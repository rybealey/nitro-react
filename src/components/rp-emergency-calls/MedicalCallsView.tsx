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
// dispatched to you. Each knockout, with who is down and the room they are
// in, is OFFERED to one paramedic at a time, round robin: theirs comes up on
// it with Accept and Decline buttons and thirty seconds to answer. Accept
// turns the card into the Active Call - who and where - until the patient is
// dropped off; the hospital collects them itself two minutes after the Accept
// (emulator MedicalCalls.ReviveSeconds).
//
// NO HISTORY (Twist, 2026-10-18): the server sends only your live call - the
// one offered to you, or the one you accepted. A call you decline or let run
// out, or one that ends, leaves the window, and the window closes with it.
// The X puts it away too, until the next call is offered to you. There is no
// :calls for paramedics (Twist, 2026-10-18) - that is the police's only.

const NOTICE_MS = 6000;
// The age is counted on from when the queue arrived; the claim countdown each second.
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

export const MedicalCallsView: FC<{}> = props =>
{
    const [ isOpen, setIsOpen ] = useState(false);
    // Put away with the X, or closed by your call leaving - until a call is
    // offered to you.
    const [ isDismissed, setIsDismissed ] = useState(false);
    const [ calls, setCalls ] = useState<MedicalCall[]>([]);
    const [ receivedAt, setReceivedAt ] = useState(0);
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
        const offered = next.find(entry => ((entry.state === MedicalCallState.Offered) && (entry.actorId === myId)));

        // A call offered to you comes up whatever the window was doing - that
        // is the round robin's whole point. Your call leaving - declined, run
        // out, dropped off or over - takes the window with it.
        if(offered && (offered.id !== offeredId.current)) setIsDismissed(false);
        else if(calls.length && !next.length) setIsDismissed(true);

        offeredId.current = (offered ? offered.id : 0);
        setCalls(next);
        setReceivedAt(Date.now());

        // A clock-in only readies it: it stays off screen until a call is
        // dispatched to you.
        if(!isOpen && !offered) setIsDismissed(true);

        setIsOpen(true);

        if(parser.notice) setNotice(parser.notice);
    });

    useEffect(() =>
    {
        if(!notice) return;

        const timeout = setTimeout(() => setNotice(''), NOTICE_MS);

        return () => clearTimeout(timeout);
    }, [ notice ]);

    // Every second while a call is being offered, for the countdown.
    const counting = calls.some(entry => (entry.state === MedicalCallState.Offered));

    useEffect(() =>
    {
        if(!isOpen) return;

        const interval = setInterval(() => setTick(prev => (prev + 1)), (counting ? COUNTDOWN_MS : TICK_MS));

        return () => clearInterval(interval);
    }, [ isOpen, counting ]);

    if(!isOpen || isDismissed) return null;

    const myId = GetSessionDataManager().userId;
    // Only ever your one live call: offered to you, or your Active Call.
    const call = (calls[0] ?? null);
    const elapsed = Math.floor((Date.now() - receivedAt) / 1000);
    const age = (call ? call.age + elapsed : 0);
    const claimLeft = (call ? Math.max(0, call.claimSeconds - elapsed) : 0);
    const offeredToMe = (!!call && (call.state === MedicalCallState.Offered) && (call.actorId === myId));
    // The call you accepted and have not dropped off yet: its own card.
    const activeForMe = (!!call && (call.state === MedicalCallState.Claimed) && (call.actorId === myId));
    const statusClass = (activeForMe ? 'is-responded' : 'is-waiting');
    const statusText = (activeForMe ? 'Active Call' : (offeredToMe ? `Accept within ${ claimLeft }s` : 'Waiting for a paramedic'));

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
                            { activeForMe ? <CrossIcon size={ 10 } /> : <ClockIcon /> }
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
                        { offeredToMe &&
                            <div className="emergency-actions">
                                <button type="button" className="emergency-button is-respond" disabled={ (claimLeft <= 0) } onClick={ () => SendMessageComposer(new RpMedicalCallClaimComposer(call.id)) }>
                                    <CrossIcon size={ 10 } /> Accept
                                </button>
                                <button type="button" className="emergency-button is-decline" disabled={ (claimLeft <= 0) } onClick={ () => SendMessageComposer(new RpMedicalCallDeclineComposer(call.id)) }>
                                    Decline
                                </button>
                            </div> }
                    </article> }
                { notice && <div className="emergency-notice" role="status">{ notice }</div> }
            </NitroCardContentView>
        </NitroCardView>
    );
}
