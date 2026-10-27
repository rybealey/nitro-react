import { GetTicker } from '@nitrots/nitro-renderer';
import { useEffect, useState } from 'react';
import { OnAccountPrefsLoaded, ReadPref, WritePref } from './AccountPrefs';

const SLOW_KEY = 'pixelrp.prefs.fps.slow';

// PixelRP: Slow computer mode (Twist, 2026-10-27 - "just add it as an option in
// settings > General for very slow computers"). Off unless the player turns it
// on, since drawing half as often makes walking and dragging less fluid on a
// computer that only misses the odd frame. On, when this computer keeps
// falling behind - a frame drawn a screen refresh or more late, over and over
// - the game draws on every other screen refresh instead, until it has shown
// it can keep up again. Settings > General says so while it is lowered
// (RpSettingsView); the player's FPS choice is never touched. Kept on the
// account (AccountPrefs). Off, frames are still measured, for the lag
// recorder's minute line.
//
// EVERY OTHER REFRESH, NOT A LOWER maxFPS. Pixi paces its cap against the
// clock with rounding, and a cap at or under the refresh rate skips frames
// unevenly (FpsStore) - the judder this is meant to cure. Skipping every
// other call of the ticker is exact: 30 even frames a second on a 60 Hz
// screen, 72 on 144 Hz. Half is as low as it goes (Twist's choice).
//
// Falling behind is measured on drawn frames: one is late when it came more
// than LATE_FACTOR screen refreshes (or the player's cap, if slower) after
// the last. A room loading or a crowd arriving is a few late frames - not
// enough; a machine that cannot hold the pace is late again and again.
//
// Back up: after RETRY_FIRST_MS at half rate full rate is tried again. A try
// that falls behind again within TRY_MS goes back to half and waits twice as
// long next time (up to RETRY_MOST_MS); one that holds stays.
//
// While playing it only writes numbers into fixed buffers - nothing is made
// per frame - and it looks at them four times a second.

const WINDOW_MS = 4000;
const LATE_SHARE = 0.1;
const LATE_MIN = 8;
const FRAMES_MIN = 30;
const LATE_FACTOR = 1.75;
const RETRY_FIRST_MS = 20000;
const RETRY_MOST_MS = 160000;
const TRY_MS = 5000;
const CHECK_MS = 250;
const REFRESH_EVERY_MS = 1000;
// a gap this long is the page put away, a load or a debugger - not the pace
const GAP_IGNORE_MS = 500;
// half rate has to stay this fast or better (a 50 Hz screen still halves)
const HALF_FPS_MIN = 25;

export interface IAutoFrameRate
{
    // Slow computer mode is switched on
    enabled: boolean;
    lowered: boolean;
    // frames a second while lowered (half the screen's rate)
    fps: number;
    // late frames in the last WINDOW_MS when it last stepped down, 0-1
    lateShare: number;
    // the screen's refresh as measured, and the late frames in the last
    // WINDOW_MS at full rate, 0-1 - for the lag recorder's minute line
    refreshHz: number;
    recentLateShare: number;
}

// drawn frames: when, and whether late
const RING = 1024;
const drawnAt = new Float64Array(RING);
const drawnLate = new Uint8Array(RING);
let ringHead = 0;
let ringCount = 0;
let lastDrawnAt = 0;

// the screen's refresh: gaps between the browser's frame calls, the tenth
// percentile of the last ones (a busy frame only ever makes a gap longer)
const CALL_GAPS = 64;
const callGaps = new Float64Array(CALL_GAPS);
const callGapsSorted = new Float64Array(CALL_GAPS);
let callGapHead = 0;
let callGapCount = 0;
let lastCallAt = 0;
let refreshMs = (1000 / 60);
let refreshAt = 0;

let divisor = 1;
let callIndex = 0;
let checkedAt = 0;
let retryAt = 0;
let retryWait = RETRY_FIRST_MS;
let tryingUntil = 0;
let lastLateShare = 0;
let recentLateShare = 0;
let installed = false;
let enabled = (ReadPref(SLOW_KEY) === 'true');

const listeners = new Set<(state: IAutoFrameRate) => void>();

export const GetAutoFrameRate = (): IAutoFrameRate => ({
    enabled,
    lowered: (divisor > 1),
    fps: Math.round(1000 / (refreshMs * 2)),
    lateShare: lastLateShare,
    refreshHz: Math.round(1000 / refreshMs),
    recentLateShare
});

const notify = () =>
{
    const state = GetAutoFrameRate();

    listeners.forEach(listener => listener(state));
}

/** Told whenever the game steps down to half rate or back up. */
export const OnAutoFrameRateChange = (listener: (state: IAutoFrameRate) => void): (() => void) =>
{
    listeners.add(listener);

    return () =>
    {
        listeners.delete(listener);
    };
}

const forgetFrames = () =>
{
    ringHead = 0;
    ringCount = 0;
    lastDrawnAt = 0;
}

const measureRefresh = (now: number) =>
{
    if((now - refreshAt) < REFRESH_EVERY_MS || (callGapCount < 16)) return;

    refreshAt = now;

    callGapsSorted.set(callGaps);

    const sorted = callGapsSorted.subarray(0, callGapCount).sort();

    refreshMs = Math.max(2, sorted[Math.floor(callGapCount * 0.1)]);
}

const stepDown = (now: number, lateShare: number) =>
{
    // half has to be a frame rate worth drawing at
    if((1000 / (refreshMs * 2)) < HALF_FPS_MIN) return;

    // a try at full rate that fell behind again: wait longer next time
    if(tryingUntil) retryWait = Math.min((retryWait * 2), RETRY_MOST_MS);

    tryingUntil = 0;
    divisor = 2;
    retryAt = (now + retryWait);
    lastLateShare = lateShare;
    forgetFrames();
    notify();
}

const stepUp = (now: number) =>
{
    divisor = 1;
    tryingUntil = (now + TRY_MS);
    forgetFrames();
    notify();
}

// switched on or off: off goes straight back to full rate, with no try
const setEnabled = (on: boolean) =>
{
    enabled = on;

    if(!on)
    {
        divisor = 1;
        tryingUntil = 0;
        retryWait = RETRY_FIRST_MS;
        forgetFrames();
    }

    notify();
}

/** Settings > General: Slow computer mode on or off. */
export const SetSlowComputerMode = (on: boolean): void =>
{
    WritePref(SLOW_KEY, on ? 'true' : 'false');
    setEnabled(on);
}

OnAccountPrefsLoaded(() => setEnabled(ReadPref(SLOW_KEY) === 'true'));

const check = (now: number) =>
{
    if((now - checkedAt) < CHECK_MS) return;

    checkedAt = now;

    if(divisor > 1)
    {
        if(now >= retryAt) stepUp(now);

        return;
    }

    // a try at full rate that held: it stays, and the wait starts over
    if(tryingUntil && (now >= tryingUntil))
    {
        tryingUntil = 0;
        retryWait = RETRY_FIRST_MS;
    }

    let total = 0;
    let late = 0;

    for(let i = 0; i < ringCount; i++)
    {
        const index = ((ringHead - 1 - i + RING) % RING);

        if((now - drawnAt[index]) > WINDOW_MS) break;

        total++;
        late += drawnLate[index];
    }

    recentLateShare = (total ? (late / total) : 0);

    if(enabled && (total >= FRAMES_MIN) && (late >= LATE_MIN) && ((late / total) >= LATE_SHARE)) stepDown(now, (late / total));
}

// a frame the game drew (the ticker's own listener: only frames Pixi's cap let through)
const onDrawn = () =>
{
    const now = performance.now();

    if(lastDrawnAt)
    {
        const gap = (now - lastDrawnAt);

        if(gap >= GAP_IGNORE_MS)
        {
            forgetFrames();
        }
        else if(divisor === 1)
        {
            const ticker: any = GetTicker();
            const capMs = ((ticker?.maxFPS > 0) ? (1000 / ticker.maxFPS) : 0);

            drawnAt[ringHead] = now;
            drawnLate[ringHead] = ((gap > (Math.max(refreshMs, capMs) * LATE_FACTOR)) ? 1 : 0);
            ringHead = ((ringHead + 1) % RING);
            ringCount = Math.min((ringCount + 1), RING);
        }
    }

    lastDrawnAt = now;

    check(now);
}

/**
 * Watch the game's frames from now on, and draw on every other screen refresh
 * while this computer cannot keep up. Once, when the room engine is up
 * (App, ENGINE_INITIALIZED).
 */
export const StartAutoFrameRate = (): void =>
{
    if(installed) return;

    const ticker: any = GetTicker();
    const update = ticker?.update;

    if(typeof update !== 'function') return;

    installed = true;

    // Every call of the browser's frame comes through here: the screen's
    // refresh is measured on all of them, and at half rate every other one is
    // passed over before Pixi sees it - it then counts two refreshes' time
    // into the frame it does draw, so everything moves at the same speed.
    ticker.update = function(...args: any[])
    {
        const now = performance.now();

        if(lastCallAt)
        {
            const gap = (now - lastCallAt);

            if(gap < GAP_IGNORE_MS)
            {
                callGaps[callGapHead] = gap;
                callGapHead = ((callGapHead + 1) % CALL_GAPS);
                callGapCount = Math.min((callGapCount + 1), CALL_GAPS);
            }
        }

        lastCallAt = now;

        measureRefresh(now);

        if((divisor > 1) && ((++callIndex % divisor) !== 0)) return;

        return update.apply(this, args);
    };

    ticker.add(onDrawn);
}

/** The cap's state for a view, updated as it steps down and back up. */
export const useAutoFrameRate = (): IAutoFrameRate =>
{
    const [ state, setState ] = useState<IAutoFrameRate>(GetAutoFrameRate);

    useEffect(() => OnAutoFrameRateChange(setState), []);

    return state;
}
