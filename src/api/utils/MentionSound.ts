import MentionSoundFile from '../../assets/sounds/mention.mp3';

// The @mention alert, built to fire from a BACKGROUND tab. A fresh
// `new Audio().play()` at mention time is refused by browsers when the tab is
// hidden (no user gesture of its own), so audio is unlocked ONCE on the
// player's first click or key: a Web Audio context with the clip pre-decoded
// (keeps running while the tab is hidden), and a primed <audio> element as the
// fallback for browsers without a running context.
let context: AudioContext = null;
let buffer: AudioBuffer = null;
let primed: HTMLAudioElement = null;
let unlocked = false;

const unlock = async () =>
{
    if(unlocked) return;

    unlocked = true;

    try
    {
        primed = new Audio(MentionSoundFile);
        primed.preload = 'auto';
        primed.load();
    }
    catch(e) { }

    try
    {
        const Ctx = (window.AudioContext || (window as any).webkitAudioContext);

        if(!Ctx) return;

        context = new Ctx();

        const data = await (await fetch(MentionSoundFile)).arrayBuffer();

        buffer = await context.decodeAudioData(data);
    }
    catch(e)
    {
        context = null;
        buffer = null;
    }
}

// capture phase so the very first gesture counts, whatever handled it
window.addEventListener('pointerdown', () => unlock(), { once: true, capture: true });
window.addEventListener('keydown', () => unlock(), { once: true, capture: true });

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
