import { FC, useEffect, useState } from 'react';
import { GetJailSentence, JailSentence, SubscribeJailSentence } from '../../api/rp-police/RpJailMessages';

// PixelRP jail countdown - hangs from the top-centre while you serve a
// sentence (:arrest, emulator JailState), like the turf panel's folded tab.
// Yours only: nobody else is sent it.
//
// Server-driven, counted locally: RpJailMessages keeps the last sentence the
// server sent (on arrest, on each room entry while serving, and 0 on release)
// and this runs the clock on from it, so no tick is sent. The server's clock is
// the one that frees you; this only shows it.

const clock = (seconds: number) =>
{
    const safe = Math.max(0, Math.ceil(seconds));

    return `${ Math.floor(safe / 60) }:${ String(safe % 60).padStart(2, '0') }`;
}

const LockIcon: FC<{}> = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
);

const secondsLeftOf = (sentence: JailSentence, now: number) =>
    Math.max(0, sentence.secondsLeft - ((now - sentence.receivedAt) / 1000));

export const RpJailView: FC<{}> = props =>
{
    const [ sentence, setSentence ] = useState<JailSentence>(GetJailSentence);
    const [ now, setNow ] = useState(() => performance.now());

    useEffect(() => SubscribeJailSentence(() =>
    {
        setSentence(GetJailSentence());
        setNow(performance.now());
    }), []);

    const serving = (sentence.secondsLeft > 0);

    // One tick a second while serving; nothing at all otherwise.
    useEffect(() =>
    {
        if(!serving) return;

        const interval = window.setInterval(() => setNow(performance.now()), 1000);

        return () => window.clearInterval(interval);
    }, [ serving ]);

    const left = secondsLeftOf(sentence, now);

    if(!serving || (left <= 0)) return null;

    const served = (sentence.sentenceSeconds > 0) ? Math.min(1, 1 - (left / sentence.sentenceSeconds)) : 0;

    return (
        <div className="rp-jail-panel" role="timer" aria-label={ `In jail, ${ clock(left) } left` }>
            <span className="rp-jail-icon"><LockIcon /></span>
            <span className="rp-jail-text">
                <span className="rp-jail-label">In jail</span>
                <span className="rp-jail-clock">{ clock(left) }</span>
            </span>
            <div className="rp-jail-progress"><div style={ { width: `${ (served * 100).toFixed(1) }%` } } /></div>
        </div>
    );
}
