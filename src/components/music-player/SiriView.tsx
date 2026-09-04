import { RpJukeboxAddComposer } from '@nitrots/nitro-renderer';
import { FC, useEffect, useRef, useState } from 'react';
import { SendMessageComposer } from '../../api';

// Siri — the jukebox prompt as a chat-bar popover. Springs up from behind
// the chat bar (styled as its sibling: same gloss stripe, black border and
// 8px radius), wrapped in a slow-turning halo in the game's plum/teal.
// Submitting a link sends the queue packet, holds a one-second "Queued for
// the room" beat while the halo flares, then sinks back out of view.
// Escape or clicking anywhere outside dismisses it without queueing.
//
// The queue itself stays server-authoritative and visible in the music
// player panel (UP NEXT); skipping lives there too.

type SiriPhase = 'open' | 'done' | 'closing';

const DONE_HOLD_MS = 1000;
const SINK_MS = 300;
const FOCUS_DELAY_MS = 460;

export const SiriView: FC<{ onClose: () => void }> = ({ onClose = null }) =>
{
    const [ phase, setPhase ] = useState<SiriPhase>('open');
    const [ url, setUrl ] = useState('');
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
        if(!url.trim().length) return;

        SendMessageComposer(new RpJukeboxAddComposer(url.trim()));
        setUrl('');
        setPhase('done');
        setTimeout(sink, DONE_HOLD_MS);
    }

    useEffect(() =>
    {
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
            clearTimeout(focusTimeout);
            document.removeEventListener('keydown', onKeyDown);
            document.removeEventListener('mousedown', onMouseDown);
        }
    }, []);

    return (
        <div ref={ wrapRef } className={ `nitro-siri siri-${ phase }` }>
            <div className="siri-halo" />
            <div className="siri-plate">
                { (phase !== 'done') &&
                    <div className="siri-row">
                        { /* layered waveform: three sine curves drifting at
                             co-prime speeds, each breathing its own amplitude,
                             so the composite never visibly repeats. Each path
                             is two identical periods; the drift loops one
                             period (-22px) for a seamless tile. */ }
                        <span className="siri-wave">
                            <svg width="22" height="16" viewBox="0 0 22 16">
                                <g className="siri-wave-drift siri-wave-a"><g className="siri-wave-breathe"><path d="M0 8 C2.75 3 8.25 3 11 8 C13.75 13 19.25 13 22 8 C24.75 3 30.25 3 33 8 C35.75 13 41.25 13 44 8" /></g></g>
                                <g className="siri-wave-drift siri-wave-b"><g className="siri-wave-breathe"><path d="M0 8 C2.75 3 8.25 3 11 8 C13.75 13 19.25 13 22 8 C24.75 3 30.25 3 33 8 C35.75 13 41.25 13 44 8" /></g></g>
                                <g className="siri-wave-drift siri-wave-c"><g className="siri-wave-breathe"><path d="M0 8 C2.75 3 8.25 3 11 8 C13.75 13 19.25 13 22 8 C24.75 3 30.25 3 33 8 C35.75 13 41.25 13 44 8" /></g></g>
                            </svg>
                        </span>
                        <input ref={ inputRef } className="siri-input" type="text" spellCheck={ false } placeholder="Paste a YouTube link"
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
                { (phase === 'done') &&
                    <div className="siri-done">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                        Queued for the room
                    </div> }
            </div>
        </div>
    );
}
