import MentionSoundFile from '../../assets/sounds/mention.mp3';

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

const unlockElement = () =>
{
    if(!primed)
    {
        try
        {
            primed = new Audio(MentionSoundFile);
            primed.preload = 'auto';
            primed.load();
        }
        catch(e)
        {
            primed = null;

            return;
        }
    }

    // Safari unlocks an element only by PLAYING it inside a gesture, so it is
    // played muted and stopped at once - until that has worked, and never over
    // a real alert that is sounding right now
    if(primedUnlocked || !primed.paused) return;

    primed.muted = true;

    primed.play()
        .then(() =>
        {
            primed.pause();
            primed.currentTime = 0;
            primedUnlocked = true;
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
    const element = (primed ?? new Audio(MentionSoundFile));

    try { element.currentTime = 0; }
    catch(e) { }

    element.play().catch(() => {});
}

export const PlayMentionSound = () =>
{
    if(context && buffer && (context.state === 'running'))
    {
        try
        {
            const source = context.createBufferSource();

            source.buffer = buffer;
            source.connect(context.destination);
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
