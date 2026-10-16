import { FC, useEffect, useRef, useState } from 'react';
import { GetSessionDataManager, SendMessageComposer } from '../../api';
import { MedicalCall, MedicalCallState, RpMedicalCallClaimComposer, RpMedicalCallsEvent } from '../../api/rp-hospital/RpMedicalCallsMessages';
import { DraggableWindowPosition, LayoutAvatarImageView, NitroCardContentView, NitroCardHeaderView, NitroCardView } from '../../common';
import { useMessageEvent } from '../../hooks';

// PixelRP Paramedic Dispatch - 911 Dispatch's counterpart for the hospital, in
// its look (EmergencyCallsView.scss). Emulator: MedicalCalls.
//
// Open while you are an on-duty paramedic or above - the server opens it on
// clock-in and closes it on clock-out. Every death is on everyone's queue, with
// who died and the room they died in, but it is OFFERED to one paramedic at a
// time, round robin: theirs comes up on it with a Claim button and ten seconds
// to press it, after which it moves on to the next paramedic. One claim at a
// time. The call reads "Revived by" whoever drops the patient off at the
// hospital. The X only puts the window away: the next call offered to you
// brings it back, :calls does too, and it opens again on the next clock-in.
// One death at a time, the newest first; the arrows page through older ones.

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

        // A fresh clock-in opens it whether or not it was put away last shift,
        // and :calls brings it back whenever it was.
        if(!isOpen || parser.reopen) setIsDismissed(false);

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
    const holdingClaim = calls.some(entry => ((entry.state === MedicalCallState.Claimed) && (entry.actorId === myId)));
    const who = (entry: MedicalCall) => ((entry.actorId === myId) ? 'you' : entry.actorName);

    let statusClass = 'is-waiting';
    let statusText = 'Waiting for a paramedic';

    if(call) switch(call.state)
    {
        case MedicalCallState.Offered:
            statusText = (offeredToMe ? `Claim within ${ claimLeft }s` : `Offered to ${ call.actorName }`);
            break;
        case MedicalCallState.Claimed:
            statusClass = 'is-responded';
            statusText = `Claimed by ${ who(call) }`;
            break;
        case MedicalCallState.Revived:
            statusClass = 'is-responded';
            // Always the name, yours included: it is the record of who brought them in.
            statusText = `Revived by ${ call.actorName }`;
            break;
        case MedicalCallState.Recovered:
            statusClass = 'is-closed';
            statusText = 'Back on their feet';
            break;
        case MedicalCallState.Admitted:
            statusClass = 'is-closed';
            statusText = 'Taken in by the hospital';
            break;
        case MedicalCallState.Gone:
            statusClass = 'is-closed';
            statusText = 'Left the hotel';
            break;
    }

    return (
        <NitroCardView uniqueKey="medical-calls" className="nitro-emergency-calls nitro-medical-calls" theme="primary-slim" windowPosition={ DraggableWindowPosition.TOP_LEFT }>
            <NitroCardHeaderView headerText="Paramedic Dispatch" onCloseClick={ () => setIsDismissed(true) } />
            <NitroCardContentView className="emergency-body" overflow="hidden">
                { !call &&
                    <div className="emergency-empty">
                        <CrossIcon size={ 20 } />
                        <b>No emergencies</b>
                        <span>Anybody who dies shows up here while you are on duty.</span>
                    </div> }
                { call &&
                    <article className={ `emergency-card is-medical${ (statusClass === 'is-closed') ? ' is-closed' : '' }` } aria-label={ `${ call.patientName } died` }>
                        <div className="emergency-caller">
                            <div className="emergency-figure" title={ `${ call.patientName }'s look` }>
                                <LayoutAvatarImageView figure={ call.patientLook } gender={ call.patientGender } direction={ 2 } />
                            </div>
                            <div className="emergency-text">
                                <div className="emergency-name-row">
                                    <span className="emergency-who">
                                        <b className="emergency-name">{ call.patientName }</b>
                                    </span>
                                    <span className="emergency-ago">{ agoText(age) }</span>
                                </div>
                                <div className="emergency-room">
                                    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 21s-7-6.2-7-12a7 7 0 0114 0c0 5.8-7 12-7 12z" /><circle cx="12" cy="9" r="2.5" /></svg>
                                    <span>{ call.roomName || 'Unknown room' }</span>
                                </div>
                                <p className="emergency-message">Has died and needs a paramedic.</p>
                            </div>
                        </div>
                        <div className={ `emergency-status ${ statusClass }` } role="status">
                            { (statusClass === 'is-waiting') && <span className="emergency-ring" /> }
                            { (statusClass === 'is-responded') && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg> }
                            <span>{ statusText }</span>
                        </div>
                        { offeredToMe &&
                            <button type="button" className="emergency-button is-respond" disabled={ holdingClaim || (claimLeft <= 0) } title={ holdingClaim ? 'Drop off your claimed patient first' : undefined } onClick={ () => SendMessageComposer(new RpMedicalCallClaimComposer(call.id)) }>
                                <CrossIcon size={ 10 } /> Claim
                            </button> }
                    </article> }
                { notice && <div className="emergency-notice" role="status">{ notice }</div> }
                { call &&
                    <div className="emergency-foot">
                        <button type="button" className="emergency-pager" aria-label="Newer emergency" disabled={ (index === 0) } onClick={ () => setIndex(index - 1) }>
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
                        </button>
                        <span className="emergency-position">{ index + 1 } / { calls.length }</span>
                        <button type="button" className="emergency-pager" aria-label="Older emergency" disabled={ (index >= (calls.length - 1)) } onClick={ () => setIndex(index + 1) }>
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 5l7 7-7 7" /></svg>
                        </button>
                    </div> }
            </NitroCardContentView>
        </NitroCardView>
    );
}
