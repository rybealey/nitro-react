import { FC, useEffect, useRef, useState } from 'react';
import { MedicalCall, RpMedicalCallsEvent } from '../../api/rp-hospital/RpMedicalCallsMessages';
import { DraggableWindowPosition, LayoutAvatarImageView, NitroCardContentView, NitroCardHeaderView, NitroCardView } from '../../common';
import { useMessageEvent } from '../../hooks';

// PixelRP paramedics' emergency queue - 911 Dispatch's counterpart for the
// hospital, in its look (EmergencyCallsView.scss). Emulator: MedicalCalls.
//
// Open while you are an on-duty paramedic or above - the server opens it on
// clock-in and closes it on clock-out. Every time a player dies it comes up
// with who died and the room they died in. The X only puts it away: the next
// death brings it back, :calls does too, and it opens again on the next
// clock-in. One death at a time, the newest first; the arrows page through
// older ones.
//
// A report and nothing more: no Respond, no Go to room, no Helpful or Abuse.

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

const CrossIcon: FC<{ size?: number }> = ({ size = 10 }) =>
    <svg width={ size } height={ size } viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6z" /></svg>;

export const MedicalCallsView: FC<{}> = props =>
{
    const [ isOpen, setIsOpen ] = useState(false);
    // Closed with the X - until somebody else dies.
    const [ isDismissed, setIsDismissed ] = useState(false);
    const [ calls, setCalls ] = useState<MedicalCall[]>([]);
    const [ receivedAt, setReceivedAt ] = useState(0);
    const [ index, setIndex ] = useState(0);
    const [ , setTick ] = useState(0);
    const newestId = useRef(0);

    useMessageEvent<RpMedicalCallsEvent>(RpMedicalCallsEvent, event =>
    {
        const parser = event.getParser();

        if(!parser.open)
        {
            setIsOpen(false);
            setCalls([]);
            newestId.current = 0;

            return;
        }

        const next = parser.calls;
        const newest = (next.length ? next[0].id : 0);
        const viewing = (calls[index]?.id ?? 0);

        // A new death always comes to the top, and the window shows it.
        // Otherwise stay on the one being looked at, wherever it moved.
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
    });

    useEffect(() =>
    {
        if(!isOpen) return;

        const interval = setInterval(() => setTick(prev => (prev + 1)), TICK_MS);

        return () => clearInterval(interval);
    }, [ isOpen ]);

    if(!isOpen || isDismissed) return null;

    const call = (calls[index] ?? null);
    const age = (call ? call.age + Math.floor((Date.now() - receivedAt) / 1000) : 0);

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
                    <article className="emergency-card is-medical" aria-label={ `${ call.patientName } died` }>
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
                    </article> }
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
