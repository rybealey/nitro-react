import MentionSoundFile from '../../assets/sounds/mention.mp3';
import { GetLocalStorage } from './GetLocalStorage';
import { SetLocalStorage } from './SetLocalStorage';

// The @mention alert, built to fire from a BACKGROUND tab. A fresh
// `new Audio().play()` at mention time is refused by browsers when the tab is
// hidden (no user gesture of its own), so audio is unlocked by the player's
// clicks and keys: a Web Audio context with the clip pre-decoded (keeps running
// while the tab is hidden), and a primed <audio> element as the fallback for
// browsers without a running context.
//
// EVERY click and key, not only the first. What one gesture unlocks does not
// stay unlocked - a reload wipes it, and the browser can park the context later
// (an output device changing, the machine waking from sleep) where only another
// gesture may wake it. Once everything is running this is a few checks and out.
let context: AudioContext = null;
let buffer: AudioBuffer = null;
let decoding = false;
let primed: HTMLAudioElement = null;
let primedUnlocked = false;

// How loud the ping plays, 0-100 (Settings > General > Sound > Ping sound);
// 0 is off. Kept on this computer, like the rest of that page's local choices.
const PING_VOLUME_KEY = 'pixelrp.ping-volume';

let pingVolume: number = (() =>
{
    const saved = GetLocalStorage<number>(PING_VOLUME_KEY);

    return ((typeof saved === 'number') && (saved >= 0) && (saved <= 100)) ? saved : 100;
})();

export const GetPingVolume = (): number => pingVolume;

export const SetPingVolume = (volume: number) =>
{
    pingVolume = Math.max(0, Math.min(100, Math.round(volume)));

    SetLocalStorage<number>(PING_VOLUME_KEY, pingVolume);
}

// A twentieth of a second of silence, built as a WAV (8 kHz, 8-bit mono, every
// sample at the 0x80 midpoint) - what the fallback element plays to unlock.
const SilentClipUrl = (): string =>
{
    const samples = 400;
    const bytes = new Uint8Array(44 + samples);
    const view = new DataView(bytes.buffer);
    const text = (offset: number, value: string) => [ ...value ].forEach((char, i) => (bytes[offset + i] = char.charCodeAt(0)));

    text(0, 'RIFF');
    view.setUint32(4, (36 + samples), true);
    text(8, 'WAVE');
    text(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, 8000, true);
    view.setUint32(28, 8000, true);
    view.setUint16(32, 1, true);
    view.setUint16(34, 8, true);
    text(36, 'data');
    view.setUint32(40, samples, true);
    bytes.fill(0x80, 44);

    return URL.createObjectURL(new Blob([ bytes ], { type: 'audio/wav' }));
}

const unlockElement = () =>
{
    if(primedUnlocked) return;

    // Safari unlocks an element only by PLAYING it inside a gesture. It plays a
    // silent clip, never the ping: Safari can let a muted play be heard, and a
    // first click while the client loads would sound the alert for nothing.
    // Once that has worked the same element is handed the ping, for good.
    if(!primed)
    {
        try
        {
            primed = new Audio(SilentClipUrl());
        }
        catch(e)
        {
            primed = null;

            return;
        }
    }

    // an unlock play already under way
    if(!primed.paused) return;

    primed.muted = true;

    primed.play()
        .then(() =>
        {
            primed.pause();
            primedUnlocked = true;
            primed.src = MentionSoundFile;
            primed.preload = 'auto';
            primed.load();
        })
        .catch(() => {})
        .finally(() => (primed.muted = false));
}

const unlockContext = () =>
{
    try
    {
        if(context && (context.state === 'closed')) context = null;

        if(!context)
        {
            const Ctx = (window.AudioContext || (window as any).webkitAudioContext);

            if(!Ctx) return;

            context = new Ctx();
        }

        // suspended (never started, or parked by the browser), or Safari's interrupted
        if(context.state !== 'running') context.resume().catch(() => {});
    }
    catch(e)
    {
        context = null;

        return;
    }

    if(buffer || decoding) return;

    decoding = true;

    fetch(MentionSoundFile)
        .then(response => response.arrayBuffer())
        .then(data => context.decodeAudioData(data))
        .then(decoded => (buffer = decoded))
        .catch(() => {})
        .finally(() => (decoding = false));
}

const unlock = () =>
{
    unlockElement();
    unlockContext();
}

// capture phase so a gesture counts whatever handled it
window.addEventListener('pointerdown', unlock, { capture: true });
window.addEventListener('keydown', unlock, { capture: true });

const playFallback = () =>
{
    // the primed element only once it carries the ping - before that it holds the silent clip
    const element = ((primedUnlocked && primed) ? primed : new Audio(MentionSoundFile));

    try
    {
        element.currentTime = 0;
        element.volume = (pingVolume / 100);
    }
    catch(e) { }

    element.play().catch(() => {});
}

export const PlayMentionSound = () =>
{
    if(pingVolume <= 0) return;

    if(context && buffer && (context.state === 'running'))
    {
        try
        {
            const source = context.createBufferSource();
            const gain = context.createGain();

            gain.gain.value = (pingVolume / 100);
            source.buffer = buffer;
            source.connect(gain);
            gain.connect(context.destination);
            source.start(0);

            return;
        }
        catch(e) { }
    }

    // context missing or suspended (never unlocked, or the browser parked it):
    // play the primed element now and nudge the context back for next time
    if(context && (context.state !== 'running')) context.resume().catch(() => {});

    playFallback();
}
