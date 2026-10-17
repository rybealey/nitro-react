import { FC, useEffect, useRef, useState } from 'react';
import { GetSessionDataManager, SendMessageComposer } from '../../api';
import { MedicalCall, MedicalCallState, RpMedicalCallClaimComposer, RpMedicalCallDeclineComposer, RpMedicalCallsEvent } from '../../api/rp-hospital/RpMedicalCallsMessages';
import { DraggableWindowPosition, LayoutAvatarImageView, NitroCardContentView, NitroCardHeaderView, NitroCardView } from '../../common';
import { useMessageEvent } from '../../hooks';

// PixelRP Paramedic Dispatch - 911 Dispatch's counterpart for the hospital, in
// its look (EmergencyCallsView.scss). Emulator: MedicalCalls.
//
// Live while you are an on-duty paramedic or above - the server sends it on
// clock-in and takes it away on clock-out - but only on screen when a call is
// dispatched to you. Each death, with who died and the room they died in, is
// OFFERED to one paramedic at a time, round robin: theirs comes up on it with
// Accept and Decline buttons and thirty seconds to answer. Decline, or no
// answer in time, sends it on to the next paramedic and leaves it greyed in
// theirs. Accept turns the card into the Active Call - who and where - until
// the patient is dropped off; the hospital collects them itself two minutes
// after the Accept (emulator MedicalCalls.ReviveSeconds). The server sends
// each paramedic only their own calls - the one offered to them, the ones
// they declined or let run out, and the ones they claimed or dropped off.
// One claim at a time. The call reads "Revived by" whoever drops the
// patient off at the hospital. The X puts the window away: the next call
// offered to you brings it back, and :calls does too. The newest first; the
// arrows page through older ones.

const NOTICE_MS = 6000;
// Ages are counted on from when the queue arrived; a claim countdown each second.
const TICK_MS = 30000;
const COUNTDOWN_MS = 1000;

const agoText = (seconds: number) =>
{
    if(seconds < 60) return 'just now';

    const minutes = Math.floor(seconds / 60);

    if(minutes < 60) return `${ minutes } min ago`;

    const hours = Math.floor(minutes / 60);

    if(hours < 24) return `${ hours } h ago`;

    return `${ Math.floor(hours / 24) } d ago`;
}

const CrossIcon: FC<{ size?: number }> = ({ size = 10 }) =>
    <svg width={ size } height={ size } viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6z" /></svg>;

const ClockIcon: FC<{}> = () =>
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>;

const CheckIcon: FC<{}> = () =>
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>;

export const MedicalCallsView: FC<{}> = props =>
{
    const [ isOpen, setIsOpen ] = useState(false);
    // Closed with the X - until a call is offered to you.
    const [ isDismissed, setIsDismissed ] = useState(false);
    const [ calls, setCalls ] = useState<MedicalCall[]>([]);
    const [ receivedAt, setReceivedAt ] = useState(0);
    const [ index, setIndex ] = useState(0);
    const [ notice, setNotice ] = useState('');
    const [ , setTick ] = useState(0);
    // The call offered to you in the last queue, so a new offer is told from
    // the same one arriving again.
    const offeredId = useRef(0);

    useMessageEvent<RpMedicalCallsEvent>(RpMedicalCallsEvent, event =>
    {
        const parser = event.getParser();

        if(!parser.open)
        {
            setIsOpen(false);
            setCalls([]);
            setNotice('');
            offeredId.current = 0;

            return;
        }

        const myId = GetSessionDataManager().userId;
        const next = parser.calls;
        const offered = next.findIndex(entry => ((entry.state === MedicalCallState.Offered) && (entry.actorId === myId)));
        const viewing = (calls[index]?.id ?? 0);

        // A call offered to you comes up whatever the window was doing - that
        // is the round robin's whole point. Otherwise stay on the call being
        // looked at, wherever it moved.
        if((offered >= 0) && (next[offered].id !== offeredId.current))
        {
            setIndex(offered);
            setIsDismissed(false);
        }
        else
        {
            const at = (viewing ? next.findIndex(entry => (entry.id === viewing)) : -1);

            setIndex((at >= 0) ? at : Math.min(index, Math.max(0, next.length - 1)));
        }

        offeredId.current = ((offered >= 0) ? next[offered].id : 0);
        setCalls(next);
        setReceivedAt(Date.now());

        // A clock-in only readies it: it stays off screen until a call is
        // dispatched to you. :calls brings it up whenever.
        if(parser.reopen) setIsDismissed(false);
        else if(!isOpen && (offered < 0)) setIsDismissed(true);

        setIsOpen(true);

        if(parser.notice) setNotice(parser.notice);
    });

    useEffect(() =>
    {
        if(!notice) return;

        const timeout = setTimeout(() => setNotice(''), NOTICE_MS);

        return () => clearTimeout(timeout);
    }, [ notice ]);

    // Every second while any call is being offered, for the countdown.
    const counting = calls.some(entry => (entry.state === MedicalCallState.Offered));

    useEffect(() =>
    {
        if(!isOpen) return;

        const interval = setInterval(() => setTick(prev => (prev + 1)), (counting ? COUNTDOWN_MS : TICK_MS));

        return () => clearInterval(interval);
    }, [ isOpen, counting ]);

    if(!isOpen || isDismissed) return null;

    const myId = GetSessionDataManager().userId;
    const call = (calls[index] ?? null);
    const elapsed = Math.floor((Date.now() - receivedAt) / 1000);
    const age = (call ? call.age + elapsed : 0);
    const claimLeft = (call ? Math.max(0, call.claimSeconds - elapsed) : 0);
    const offeredToMe = (!!call && (call.state === MedicalCallState.Offered) && (call.actorId === myId));
    // The call you accepted and have not dropped off yet: its own card.
    const activeForMe = (!!call && (call.state === MedicalCallState.Claimed) && (call.actorId === myId));
    const holdingClaim = calls.some(entry => ((entry.state === MedicalCallState.Claimed) && (entry.actorId === myId)));

    let statusClass = 'is-waiting';
    let statusText = 'Waiting for a paramedic';

    if(call) switch(call.state)
    {
        case MedicalCallState.Offered:
            statusText = (offeredToMe ? `Accept within ${ claimLeft }s` : `Offered to ${ call.actorName }`);
            break;
        case MedicalCallState.Claimed:
            statusClass = 'is-responded';
            // Always the name, yours included.
            statusText = `Claimed by ${ call.actorName }`;
            break;
        case MedicalCallState.Revived:
            statusClass = 'is-responded';
            statusText = `Revived by ${ call.actorName }`;
            break;
        case MedicalCallState.Recovered:
            statusClass = 'is-closed';
            statusText = 'Revived';
            break;
        case MedicalCallState.Admitted:
            statusClass = 'is-closed';
            statusText = 'Auto revived';
            break;
        case MedicalCallState.Gone:
            statusClass = 'is-closed';
            statusText = 'Logged out';
            break;
    }

    // A call you were offered and let lapse stays in your window, greyed:
    // "Declined" while it is still unclaimed, then its outcome once
    // resolved (Revived by X, Auto revived, ...).
    if(call && call.missedByMe)
    {
        statusClass = 'is-closed';
        if(call.state < MedicalCallState.Revived) statusText = 'Declined';
    }

    // The call you accepted reads as your Active Call until the drop-off.
    if(activeForMe)
    {
        statusClass = 'is-responded';
        statusText = 'Active Call';
    }

    return (
        <NitroCardView uniqueKey="medical-calls" className="nitro-emergency-calls nitro-medical-calls" theme="primary-slim" windowPosition={ DraggableWindowPosition.TOP_RIGHT }>
            <NitroCardHeaderView headerText="Paramedic Dispatch" onCloseClick={ () => setIsDismissed(true) } />
            <NitroCardContentView className="emergency-body" overflow="hidden">
                { !call &&
                    <div className="emergency-empty">
                        <CrossIcon size={ 20 } />
                        <b>No emergencies</b>
                    </div> }
                { call &&
                    <article className={ `emergency-card is-medical ${ statusClass }` } aria-label={ activeForMe ? `Active call: ${ call.patientName }` : `${ call.patientName } knocked out` }>
                        <div className={ `emergency-strip ${ statusClass }` } role="status">
                            { (statusClass === 'is-waiting') && <ClockIcon /> }
                            { activeForMe && <CrossIcon size={ 10 } /> }
                            { (statusClass === 'is-responded') && !activeForMe && <CheckIcon /> }
                            <span className="emergency-strip-text">{ statusText }</span>
                            { !activeForMe && <span className="emergency-strip-ago">{ agoText(age) }</span> }
                        </div>
                        <div className="emergency-caller">
                            <div className="emergency-figure" title={ `${ call.patientName }'s look` }>
                                <LayoutAvatarImageView figure={ call.patientLook } gender={ call.patientGender } direction={ 2 } />
                            </div>
                            <div className="emergency-facts">
                                <span>Patient:</span>
                                <b className="is-patient">{ call.patientName }</b>
                                <span>Location:</span>
                                <b>{ call.roomName || 'Unknown' }</b>
                            </div>
                        </div>
                        { offeredToMe && !call.missedByMe &&
                            <div className="emergency-actions">
                                <button type="button" className="emergency-button is-respond" disabled={ holdingClaim || (claimLeft <= 0) } title={ holdingClaim ? 'Drop off your claimed patient first' : undefined } onClick={ () => SendMessageComposer(new RpMedicalCallClaimComposer(call.id)) }>
                                    <CrossIcon size={ 10 } /> Accept
                                </button>
                                <button type="button" className="emergency-button is-decline" disabled={ (claimLeft <= 0) } onClick={ () => SendMessageComposer(new RpMedicalCallDeclineComposer(call.id)) }>
                                    Decline
                                </button>
                            </div> }
                    </article> }
                { notice && <div className="emergency-notice" role="status">{ notice }</div> }
                { call &&
                    <div className="emergency-foot">
                        <div className="emergency-pager-group">
                            <button type="button" className="emergency-pager" aria-label="Newer emergency" disabled={ (index === 0) } onClick={ () => setIndex(index - 1) }>
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
                            </button>
                            <span className="emergency-position">{ index + 1 } / { calls.length }</span>
                            <button type="button" className="emergency-pager" aria-label="Older emergency" disabled={ (index >= (calls.length - 1)) } onClick={ () => setIndex(index + 1) }>
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 5l7 7-7 7" /></svg>
                            </button>
                        </div>
                    </div> }
            </NitroCardContentView>
        </NitroCardView>
    );
}
