// PixelRP: the texture GC counts seconds, not frames.
//
// Pixi drops a picture from the graphics card once it has gone unused for
// GC_MAX_IDLE (1800, Nitro.ts) - counted in FRAMES, one per frame drawn. That
// was ~30 s at the client's default cap of 75 a second, but players run up to
// 400, and at 245 it was 7 s: furni the camera had left behind were dropped
// and every sheet sent back to the card in the frame they came into view
// again (Twist, 2026-10-27, from the lag assessment).
//
// So the GC's count moves with the clock instead - 60 to the second, which
// keeps 1800 at 30 s whatever the frame rate. One frame counts for at most
// MAX_STEP_MS: a hidden tab draws nothing, and on its first frame back a
// count that had run on with the clock would drop every picture at once,
// those on screen included. Everything that reads the count (the GC's own
// sweep, the clothing kept on the card in Nitro.ts) compares two counts, so
// only what one unit of it means changes.

const COUNTS_PER_SECOND = 60;
const MAX_STEP_MS = 100;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const TimeTextureGC = (renderer: any): void =>
{
    const gc = renderer?.textureGC;

    if(!gc || gc.pixelrpClock) return;

    gc.pixelrpClock = true;

    const postrender: () => void = gc.postrender;

    let clock: number = gc.count;
    let lastAt = performance.now();

    gc.postrender = function(): void
    {
        if(this.renderer.renderingToScreen)
        {
            const now = performance.now();

            clock += ((Math.min((now - lastAt), MAX_STEP_MS) * COUNTS_PER_SECOND) / 1000);
            lastAt = now;

            // one short, for the count++ Pixi's own step makes
            this.count = (Math.floor(clock) - 1);
        }

        postrender.call(this);
    };
}
