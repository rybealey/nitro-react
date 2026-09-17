import { RpJukeboxAddComposer } from '@nitrots/nitro-renderer';
import { FC, useEffect, useRef, useState } from 'react';
import { SendMessageComposer } from '../../api';
import { useJukeboxState } from './JukeboxStore';
import { SiriWave } from './SiriWave';

// Siri — the jukebox prompt as a chat-bar popover. Springs up from behind
// the chat bar (styled as its sibling: same gloss stripe, black border and
// 8px radius), wrapped in a slow-turning halo in the game's plum/teal.
// Submitting a link sends the queue packet, holds a one-second "Queued for
// the room" beat while the halo flares, then sinks back out of view.
// Escape or clicking anywhere outside dismisses it without queueing.
//
// The queue itself stays server-authoritative and visible in the music
// player panel (UP NEXT); skipping lives there too.
//
// It refuses to take a link when the server says there is no jukebox here, and
// says so. The two ends disagreed about what a jukebox IS: the double-click
// that opens this matches the furni's CLASSNAME, while the server accepts on
// the BEHAVIOUR the Function Tool hands out - deliberately, so a builder can
// use a booth or a radio. A jukebox-shaped furni without the behaviour would
// open this box and then have the request refused, and the refusal arrives as
// a system whisper while this popover is covering the chat bar, so it read as
// nothing happening at all. `present` is the server's own answer, so asking it
// is the one check that cannot drift from what the server will accept.

type SiriPhase = 'open' | 'sending' | 'done' | 'failed' | 'closing';

const DONE_HOLD_MS = 1000;
const FAILED_HOLD_MS = 2600;
const SINK_MS = 300;
// Focus lands with the box, not after its animation. It used to wait 460ms for
// the spring to finish, and for those 460ms the box was on screen while the
// CHAT BAR still had the keys - so a link pasted the moment it appeared went
// into chat, this input stayed empty, and submit returned on the empty check
// without a word. The phone's request sheet autofocuses and has always worked;
// that was the whole of the difference between them.
const FOCUS_DELAY_MS = 0;
// How long the room has to change before we call it refused. The server sends
// state on every change, so a song landing is a packet; a refusal is a whisper
// we cannot read from here, and this is what stands in for hearing it.
const ACCEPT_WAIT_MS = 4000;

export const SiriView: FC<{ onClose: () => void }> = ({ onClose = null }) =>
{
    const [ phase, setPhase ] = useState<SiriPhase>('open');
    const { present, current, queue } = useJukeboxState();
    const [ url, setUrl ] = useState('');
    // what the room looked like when we asked, so the state packet coming back
    // is what tells us the song landed
    const [ pending, setPending ] = useState<{ videoId: string, queued: number }>(null);
    const wrapRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const phaseRef = useRef<SiriPhase>('open');

    phaseRef.current = phase;

    const sink = () =>
    {
        if(phaseRef.current === 'closing') return;

        setPhase('closing');
        setTimeout(() => (onClose && onClose()), SINK_MS);
    }

    const submit = () =>
    {
        if(phaseRef.current !== 'open') return;
        if(!present) return;
        if(!url.trim().length) return;

        setPending({ videoId: (current?.videoId ?? ''), queued: queue.length });
        SendMessageComposer(new RpJukeboxAddComposer(url.trim()));
        setUrl('');
        setPhase('sending');
    }

    // The room changing IS the acceptance - a song either starts or joins the
    // queue, and either way the server broadcasts. Saying "Queued for the room"
    // the instant the packet left was the reason every failure in this feature
    // looked exactly like a success.
    useEffect(() =>
    {
        if((phase !== 'sending') || !pending) return;
        if(((current?.videoId ?? '') === pending.videoId) && (queue.length === pending.queued)) return;

        setPhase('done');
    }, [ phase, pending, current, queue.length ]);

    useEffect(() =>
    {
        if(phase === 'sending')
        {
            const timer = setTimeout(() => ((phaseRef.current === 'sending') && setPhase('failed')), ACCEPT_WAIT_MS);

            return () => clearTimeout(timer);
        }

        if((phase === 'done') || (phase === 'failed'))
        {
            const timer = setTimeout(sink, (phase === 'done') ? DONE_HOLD_MS : FAILED_HOLD_MS);

            return () => clearTimeout(timer);
        }
    }, [ phase ]);

    useEffect(() =>
    {
        // Siri REPLACES the chat bar while active: the body class drives the
        // chat bar's fade-out (ChatInputView.scss) with no coupling, and the
        // cleanup restores it on every close path - submit, Escape, outside
        // click, room change, unmount.
        document.body.classList.add('siri-active');

        const focusTimeout = setTimeout(() => inputRef.current?.focus(), FOCUS_DELAY_MS);

        const onKeyDown = (event: KeyboardEvent) =>
        {
            if(event.key === 'Escape') sink();
        }

        // popover semantics: clicking anything that isn't Siri dismisses it
        // (no backdrop — the room stays clickable, and that click closes us)
        const onMouseDown = (event: MouseEvent) =>
        {
            if(wrapRef.current && !wrapRef.current.contains(event.target as Node)) sink();
        }

        document.addEventListener('keydown', onKeyDown);
        document.addEventListener('mousedown', onMouseDown);

        return () =>
        {
            document.body.classList.remove('siri-active');
            clearTimeout(focusTimeout);
            document.removeEventListener('keydown', onKeyDown);
            document.removeEventListener('mousedown', onMouseDown);
        }
    }, []);

    return (
        <div ref={ wrapRef } className={ `nitro-siri siri-${ phase }` }>
            <div className="siri-halo" />
            <div className="siri-plate">
                { (phase === 'open') && !present &&
                    <div className="siri-row siri-none">
                        <SiriWave />
                        <span className="siri-nonetext">No jukebox in this room</span>
                    </div> }
                { (phase === 'open') && present &&
                    <div className="siri-row">
                        <SiriWave />
                        <input ref={ inputRef } className="siri-input" type="text" spellCheck={ false } autoFocus placeholder="Paste a YouTube link"
                            value={ url } onChange={ event => setUrl(event.target.value) } onKeyDown={ event =>
                            {
                                if(event.key !== 'Enter') return;

                                // The chat input listens for keydown on document.body and
                                // only stands down while another input HAS focus. Submitting
                                // unmounts this input, and React flushes that before the
                                // event reaches body - so without stopping propagation the
                                // chat guard passes and the URL goes out as a chat bubble.
                                event.preventDefault();
                                event.stopPropagation();
                                submit();
                            } } />
                        <button className="siri-add" type="button" onClick={ submit }>Add</button>
                    </div> }
                { (phase === 'sending') &&
                    <div className="siri-done siri-sending">
                        <SiriWave />
                        Asking the jukebox…
                    </div> }
                { (phase === 'done') &&
                    <div className="siri-done">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                        Queued for the room
                    </div> }
                { (phase === 'failed') &&
                    <div className="siri-done siri-failed">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
                        That didn't queue — check chat for why
                    </div> }
            </div>
        </div>
    );
}
