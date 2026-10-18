import { FC, useEffect, useRef, useState } from 'react';
import { GetSessionDataManager, SendMessageComposer } from '../../api';
import { EmergencyCall, EmergencyCallAction, EmergencyCallKind, EmergencyCallMark, RpEmergencyCallActionComposer, RpEmergencyCallsEvent } from '../../api/rp-police/RpEmergencyCallsMessages';
import { DraggableWindowPosition, LayoutAvatarImageView, NitroCardContentView, NitroCardHeaderView, NitroCardView } from '../../common';
import { useMessageEvent } from '../../hooks';

// PixelRP 911 calls (design: the "911 Emergency Calls" canvas). Emulator:
// EmergencyCalls.
//
// Open while you are an on-duty officer - the server opens it on clock-in and
// closes it on clock-out. The X only puts it away: the next new call brings it
// back up, :calls does too, and it opens again on the next clock-in. One call at a time, the newest first; the right arrow goes back through older
// ones. Respond takes you to a waiting call's room and claims it; after that
// the button is Go to room, for every officer. Both stop you and take you
// there four seconds later - walking off calls it off (emulator EmergencyCalls).
// Once responded, any officer marks it Helpful or Abuse - once, for good.
//
// A :backup request sits in the same queue: an officer asking the others to
// come. Any number respond, and Respond takes each straight to the room it was
// called from; theirs then reads Go to room. It has no message and no marks.

const NOTICE_MS = 6000;
// Ages are counted on from when the queue arrived.
const TICK_MS = 30000;

const agoText = (seconds: number) =>
{
    if(seconds < 60) return 'just now';

    const minutes = Math.floor(seconds / 60);

    if(minutes < 60) return `${ minutes } min ago`;

    const hours = Math.floor(minutes / 60);

    if(hours < 24) return `${ hours } h ago`;

    return `${ Math.floor(hours / 24) } d ago`;
}

const PhoneIcon: FC<{ size?: number }> = ({ size = 10 }) =>
    <svg width={ size } height={ size } viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2" /></svg>;

export const EmergencyCallsView: FC<{}> = props =>
{
    const [ isOpen, setIsOpen ] = useState(false);
    // Closed with the X - until a new call comes in.
    const [ isDismissed, setIsDismissed ] = useState(false);
    const [ calls, setCalls ] = useState<EmergencyCall[]>([]);
    const [ receivedAt, setReceivedAt ] = useState(0);
    const [ index, setIndex ] = useState(0);
    const [ notice, setNotice ] = useState('');
    const [ , setTick ] = useState(0);
    const newestId = useRef(0);

    useMessageEvent<RpEmergencyCallsEvent>(RpEmergencyCallsEvent, event =>
    {
        const parser = event.getParser();

        if(!parser.open)
        {
            setIsOpen(false);
            setCalls([]);
            setNotice('');
            newestId.current = 0;

            return;
        }

        const next = parser.calls;
        const newest = (next.length ? next[0].id : 0);
        const viewing = (calls[index]?.id ?? 0);

        // A new call always comes to the top, and the window shows it.
        // Otherwise stay on the call being looked at, wherever it moved.
        if(newest > newestId.current)
        {
            setIndex(0);
            setIsDismissed(false);
        }
        else
        {
            const at = (viewing ? next.findIndex(entry => (entry.id === viewing)) : -1);

            setIndex((at >= 0) ? at : Math.min(index, Math.max(0, next.length - 1)));
        }

        setCalls(next);
        newestId.current = Math.max(newestId.current, newest);
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

    useEffect(() =>
    {
        if(!isOpen) return;

        const interval = setInterval(() => setTick(prev => (prev + 1)), TICK_MS);

        return () => clearInterval(interval);
    }, [ isOpen ]);

    if(!isOpen || isDismissed) return null;

    const call = (calls[index] ?? null);
    const act = (action: number) => call && SendMessageComposer(new RpEmergencyCallActionComposer(call.id, action));
    const myId = GetSessionDataManager().userId;
    const isBackup = (!!call && (call.kind === EmergencyCallKind.Backup));
    // On a backup request each officer's own button: Respond until they have.
    const responded = (!!call && (isBackup ? call.responders.some(responder => (responder.id === myId)) : !!call.responderId));

    // A call or backup request nobody has answered yet shows no status line
    // at all (Twist, 2026-10-18) - it appears once somebody responds.
    let statusClass = '';
    let statusText = '';

    if(isBackup)
    {
        if(call.responders.length)
        {
            statusClass = 'is-responded';
            // Worded like a 911 call's, every responder listed (Twist, 2026-10-18).
            statusText = `Responded by ${ call.responders.map(responder => ((responder.id === myId) ? 'you' : responder.name)).join(', ') }`;
        }
    }
    else if(call && (call.mark === EmergencyCallMark.Abuse))
    {
        statusClass = 'is-abuse';
        // Stays on the call for good; who marked it is said in corporation
        // chat (Twist, 2026-10-18).
        statusText = 'Marked as abuse';
    }
    else if(call && call.responderId)
    {
        statusClass = 'is-responded';
        statusText = `Responded by ${ (call.responderId === myId) ? 'you' : call.responderName }`;
    }

    const canMark = (!!call && !!call.responderId && (call.mark === EmergencyCallMark.None));
    const markTitle = (!call ? '' : (call.mark !== EmergencyCallMark.None) ? `Marked by ${ call.markedByName }` : (!call.responderId ? 'Respond to the call first' : undefined));
    const age = (call ? call.age + Math.floor((Date.now() - receivedAt) / 1000) : 0);

    return (
        <NitroCardView uniqueKey="emergency-calls" className="nitro-emergency-calls" theme="primary-slim" windowPosition={ DraggableWindowPosition.TOP_LEFT }>
            <NitroCardHeaderView headerText="911 Dispatch" onCloseClick={ () => setIsDismissed(true) } />
            <NitroCardContentView className="emergency-body" overflow="hidden">
                { !call &&
                    <div className="emergency-empty">
                        <PhoneIcon size={ 20 } />
                        <b>No emergency calls</b>
                        <span>New 911 calls show up here while you are on duty.</span>
                    </div> }
                { call &&
                    <article className={ `emergency-card${ (call.mark === EmergencyCallMark.Abuse) ? ' is-abuse' : '' }` } aria-label={ isBackup ? `Backup request from ${ call.callerName }` : `Call from ${ call.callerName }` }>
                        <div className="emergency-caller">
                            <div className="emergency-figure" title={ `${ call.callerName }'s look` }>
                                <LayoutAvatarImageView figure={ call.callerLook } gender={ call.callerGender } direction={ 2 } />
                            </div>
                            <div className="emergency-text">
                                <div className="emergency-name-row">
                                    <span className="emergency-who">
                                        <b className="emergency-name">{ call.callerName }</b>
                                        { isBackup && <span className="emergency-tag">Backup</span> }
                                    </span>
                                    <span className="emergency-ago">{ agoText(age) }</span>
                                </div>
                                { !isBackup &&
                                    <div className="emergency-room">
                                        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 21s-7-6.2-7-12a7 7 0 0114 0c0 5.8-7 12-7 12z" /><circle cx="12" cy="9" r="2.5" /></svg>
                                        <span>{ call.roomName || 'Unknown room' }</span>
                                    </div> }
                                { isBackup
                                    ? <p className="emergency-message emergency-at">
                                        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 21s-7-6.2-7-12a7 7 0 0114 0c0 5.8-7 12-7 12z" /><circle cx="12" cy="9" r="2.5" /></svg>
                                        <span>Requesting for back up at { call.roomName || 'an unknown room' }.</span>
                                    </p>
                                    : <p className="emergency-message">{ call.message }</p> }
                            </div>
                        </div>
                        { statusText &&
                            <div className={ `emergency-status ${ statusClass }` } role="status">
                                { (statusClass === 'is-responded') && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg> }
                                <span>{ statusText }</span>
                            </div> }
                        { !responded &&
                            <button type="button" className="emergency-button is-respond" onClick={ () => act(EmergencyCallAction.Respond) }>
                                <PhoneIcon size={ 10 } /> Respond
                            </button> }
                        { responded &&
                            <button type="button" className="emergency-button is-go" onClick={ () => act(EmergencyCallAction.GoToRoom) }>
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 12h12" /><path d="M11 6l6 6-6 6" /><path d="M20 4v16" /></svg>
                                Go to room
                            </button> }
                    </article> }
                { notice && <div className="emergency-notice" role="status">{ notice }</div> }
                { call &&
                    <div className="emergency-foot">
                        <div className="emergency-pager-group">
                            <button type="button" className="emergency-pager" aria-label="Newer call" disabled={ (index === 0) } onClick={ () => setIndex(index - 1) }>
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
                            </button>
                            <span className="emergency-position">{ index + 1 } / { calls.length }</span>
                            <button type="button" className="emergency-pager" aria-label="Older call" disabled={ (index >= (calls.length - 1)) } onClick={ () => setIndex(index + 1) }>
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 5l7 7-7 7" /></svg>
                            </button>
                        </div>
                        { !isBackup &&
                            <div className="emergency-mark-wrap">
                                <span className="emergency-mark-label">Mark as</span>
                                <button type="button" className={ `emergency-mark is-helpful${ (call.mark === EmergencyCallMark.Helpful) ? ' is-on' : '' }` } aria-pressed={ (call.mark === EmergencyCallMark.Helpful) } disabled={ !canMark } title={ markTitle } onClick={ () => act(EmergencyCallAction.Helpful) }>Helpful</button>
                                <button type="button" className={ `emergency-mark is-abuse${ (call.mark === EmergencyCallMark.Abuse) ? ' is-on' : '' }` } aria-pressed={ (call.mark === EmergencyCallMark.Abuse) } disabled={ !canMark } title={ markTitle } onClick={ () => act(EmergencyCallAction.Abuse) }>Abuse</button>
                            </div> }
                    </div> }
            </NitroCardContentView>
        </NitroCardView>
    );
}
