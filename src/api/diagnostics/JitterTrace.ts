import { RpMovementV2Event } from '@nitrots/nitro-renderer';
import { GetCommunication } from '../nitro';

// PixelRP Movement V2: how UNEVEN this player's movement packets arrive.
//
// V2 draws every step on the server's timetable, shifted back by the fastest
// trip any packet has made (the store's clockOffset). A packet slower than
// that fastest one is late by the difference - and a late packet is what
// makes a turn or a stop jump, because the client has already started
// drawing the step from its preview. Steady ping costs nothing; this spread
// (jitter) is what hurts. Until now nothing on either side measured it.
//
// COUNTERS ONLY. No console output, no allocation per packet, nothing that
// draws reads it - the page-stalling logging of a reverted change is why.
// One sample per server FRAME, not per packet: the server sends one 4110 per
// walker back to back, all carrying the same serverNow, so a busy room would
// otherwise count one delay twenty times.
//
// Read it from DevTools: pixelrpJitter.stats (or pixelrpJitter.print()), and
// pixelrpJitter.reset() to start a fresh test. Installed on the iframe and
// its parent, like the other movement handles.

// Bucket upper bounds in ms; the last bucket holds everything above.
const EDGES_MS = [ 5, 10, 20, 40, 80, 160, 320 ];

const stats = {
    frames: 0,
    // frames that arrived before the store had a clock to compare against
    noClock: 0,
    buckets: new Array<number>(EDGES_MS.length + 1).fill(0),
    sumMs: 0,
    maxMs: 0,
    since: 0
};

let lastServerNow = NaN;

const onMovement = (event: RpMovementV2Event): void =>
{
    const parser = event.getParser();

    if(!parser || !parser.ok) return;

    const serverNow = parser.serverNow;

    if(serverNow === lastServerNow) return;

    lastServerNow = serverNow;

    const store = (window as any).pixelrpMovementV2;

    if(!store || !store.hasClock)
    {
        stats.noClock++;

        return;
    }

    // performance.now(), the store's own clock domain (see updateClock).
    // Faster than the current fastest counts as 0: the store is about to
    // lower its offset to match it.
    const lateMs = Math.max(0, ((performance.now() - serverNow) - store.clockOffset));

    let bucket = 0;

    while((bucket < EDGES_MS.length) && (lateMs > EDGES_MS[bucket])) bucket++;

    stats.buckets[bucket]++;
    stats.frames++;
    stats.sumMs += lateMs;

    if(lateMs > stats.maxMs) stats.maxMs = lateMs;
}

const reset = (): void =>
{
    stats.frames = 0;
    stats.noClock = 0;
    stats.buckets.fill(0);
    stats.sumMs = 0;
    stats.maxMs = 0;
    stats.since = performance.now();
}

// The histogram as one readable line per bucket, for a copy-paste back.
const print = (): string =>
{
    const lines = [ `[MV2/JITTER] ${ stats.frames } frames over ${ Math.round((performance.now() - stats.since) / 1000) }s, avg ${ stats.frames ? (stats.sumMs / stats.frames).toFixed(1) : '-' }ms, max ${ Math.round(stats.maxMs) }ms late (noClock ${ stats.noClock })` ];

    stats.buckets.forEach((count, index) =>
    {
        const label = (index < EDGES_MS.length) ? `<=${ EDGES_MS[index] }ms` : `>${ EDGES_MS[EDGES_MS.length - 1] }ms`;
        const share = stats.frames ? Math.round((count / stats.frames) * 100) : 0;

        lines.push(`  ${ label.padEnd(8) } ${ String(count).padStart(6) }  ${ share }%`);
    });

    return lines.join('\n');
}

const publish = (): void =>
{
    const handle = { stats, reset, print: () => console.log(print()) };
    const install = (target: any) => (target.pixelrpJitter = handle);

    install(window);

    try
    {
        if(window.parent && (window.parent !== window)) install(window.parent);
    }
    catch (e)
    {
        // cross-origin parent - the in-frame handle still works
    }
}

let installed = false;

// ALWAYS ON: registered once at connection, beside the renderer's own 4110
// handler. Costs one comparison per packet and a few additions per frame.
export const InstallJitterTrace = (): void =>
{
    if((typeof window === 'undefined') || installed) return;

    installed = true;
    stats.since = performance.now();
    publish();
    GetCommunication().registerMessageEvent(new RpMovementV2Event(onMovement));
}
