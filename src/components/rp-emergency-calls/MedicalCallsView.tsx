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
// ONE CARD (design: "Paramedic Call Timer Bars" canvas, Twist 2026-10-19): the
// window is the card - no card inside it. Its title bar takes the call's
// colour, amber while offered and green once accepted, and a bar along the
// bottom counts down the thirty seconds to answer, then the two minutes to
// retrieve the patient, turning red near the end.
//
// NO HISTORY (Twist, 2026-10-18): the server sends only your live call - the
// one offered to you, or the one you accepted. A call you decline or let run
// out, or one that ends, leaves the window, and the window closes with it.
// The X puts it away too, until the next call is offered to you. There is no
// :calls for paramedics (Twist, 2026-10-18) - that is the police's only.

const NOTICE_MS = 6000;
// The age is counted on from when the queue arrived; the countdowns each second.
const TICK_MS = 30000;
const COUNTDOWN_MS = 1000;
// The bar turns red for an offer's last 10 seconds, and an Active Call's last
// 30 - when the "30 seconds to retrieve the patient" whisper comes.
const OFFER_LOW_SECONDS = 10;
const ACTIVE_LOW_SECONDS = 30;

const clockText = (seconds: number) => `${ Math.floor(seconds / 60) }:${ String(seconds % 60).padStart(2, '0') }`;

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
    // Put away with the X, or closed by your call leaving - until a call is
    // offered to you.
    const [ isDismissed, setIsDismissed ] = useState(false);
    const [ calls, setCalls ] = useState<MedicalCall[]>([]);
    const [ receivedAt, setReceivedAt ] = useState(0);
    const [ notice, setNotice ] = useState('');
    const [ totals, setTotals ] = useState({ claim: 30, revive: 120 });
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
        setTotals({ claim: parser.claimSeconds, revive: parser.reviveSeconds });

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

    // Every second while a call is offered or accepted, for its countdown.
    const counting = calls.some(entry => ((entry.state === MedicalCallState.Offered) || (entry.state === MedicalCallState.Claimed)));

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
    const secondsLeft = (call ? Math.max(0, call.secondsLeft - elapsed) : 0);
    const offeredToMe = (!!call && (call.state === MedicalCallState.Offered) && (call.actorId === myId));
    // The call you accepted and have not dropped off yet: its own card.
    const activeForMe = (!!call && (call.state === MedicalCallState.Claimed) && (call.actorId === myId));
    const statusClass = (call ? (activeForMe ? 'is-responded' : 'is-waiting') : '');
    const timerTotal = Math.max(1, (activeForMe ? totals.revive : totals.claim));
    const timerLow = (secondsLeft <= (activeForMe ? ACTIVE_LOW_SECONDS : OFFER_LOW_SECONDS));

    // No uniqueKey (Twist, 2026-10-19): a call always comes up in the same
    // place - top right, under the purse row - rather than wherever the last
    // one was dragged. It can still be dragged out of the way; the next call is
    // back in its place.
    return (
        <NitroCardView className={ `nitro-emergency-calls nitro-medical-calls ${ statusClass }` } theme="primary-slim" windowPosition={ DraggableWindowPosition.TOP_RIGHT }>
            <NitroCardHeaderView headerText="Paramedic Dispatch" classNames={ call ? [ 'emergency-titlebar', statusClass ] : [] } onCloseClick={ () => setIsDismissed(true) }>
                { call && <span className="emergency-titlebar-icon"><CrossIcon size={ 11 } /></span> }
                { call && !activeForMe && <span className="emergency-titlebar-ago">{ agoText(age) }</span> }
            </NitroCardHeaderView>
            <NitroCardContentView className="emergency-body" overflow="hidden">
                { !call &&
                    <div className="emergency-empty">
                        <CrossIcon size={ 20 } />
                        <b>No emergencies</b>
                    </div> }
                { call &&
                    <article className={ `emergency-card is-medical ${ statusClass }` } aria-label={ activeForMe ? `Active call: ${ call.patientName }` : `${ call.patientName } knocked out` }>
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
                                <button type="button" className="emergency-button is-respond" disabled={ (secondsLeft <= 0) } onClick={ () => SendMessageComposer(new RpMedicalCallClaimComposer(call.id)) }>
                                    <CrossIcon size={ 10 } /> Accept
                                </button>
                                <button type="button" className="emergency-button is-decline" disabled={ (secondsLeft <= 0) } onClick={ () => SendMessageComposer(new RpMedicalCallDeclineComposer(call.id)) }>
                                    Decline
                                </button>
                            </div> }
                        { (offeredToMe || activeForMe) &&
                            <div className="emergency-timer" role="progressbar" aria-label={ activeForMe ? 'Time left to retrieve the patient' : 'Time left to accept' } aria-valuemin={ 0 } aria-valuemax={ timerTotal } aria-valuenow={ secondsLeft }>
                                <div className="emergency-timer-track">
                                    <div className={ `emergency-timer-fill ${ statusClass }${ timerLow ? ' is-low' : '' }` } style={ { width: `${ Math.min(100, ((secondsLeft / timerTotal) * 100)) }%` } } />
                                </div>
                                <b className={ `emergency-timer-time${ timerLow ? ' is-low' : '' }` }>{ activeForMe ? clockText(secondsLeft) : `${ secondsLeft }s` }</b>
                            </div> }
                    </article> }
                { notice && <div className="emergency-notice" role="status">{ notice }</div> }
            </NitroCardContentView>
        </NitroCardView>
    );
}
