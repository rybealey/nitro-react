import { GetTicker } from '@nitrots/nitro-renderer';
import { useEffect, useState } from 'react';
import { GetConfiguration } from '../nitro/GetConfiguration';

// Phone > Settings > General: the frame-rate cap. Per device like the other
// phone preferences - it describes this machine's screen and graphics card,
// not the player's account, so it does not follow them to another computer.
//
// WHAT THE CAP CAN AND CANNOT DO. Pixi drives its ticker from
// requestAnimationFrame, and the browser never hands out frames faster than
// the monitor refreshes. So this setting can only ever take frames AWAY: on a
// 60Hz screen every value at or above 60 looks identical. It is still worth
// having, because a 144Hz or 240Hz monitor genuinely uses the top of the range.

const FPS_KEY = 'pixelrp.prefs.fps.max';

// The floor is the default (FPS_DEFAULT, below): the slider only goes UP from
// 75. Any cap under the screen's refresh rate is the skipped-frame judder the
// default exists to avoid, so it is not offered. A value saved before the floor
// was raised is clamped up to it when read back.
export const FPS_MIN = 75;
export const FPS_MAX = 400;

const clamp = (fps: number): number => Math.min(FPS_MAX, Math.max(FPS_MIN, Math.round(fps)));

// null means "the player has never chosen", which follows whatever the hotel
// configured rather than pinning a number the operator did not pick.
let chosen: number = null;

try
{
    const raw = window.localStorage.getItem(FPS_KEY);

    if(raw !== null)
    {
        const parsed = parseInt(raw);

        if(Number.isFinite(parsed)) chosen = clamp(parsed);
    }
}
catch(e)
{
    // storage blocked: the hotel default for this session
}

const listeners = new Set<() => void>();

// The default cap, for a player who has never moved the slider.
//
// 75, NOT 60. Pixi paces its frames against the cap with rounding, and a cap
// of exactly 60 on a 60Hz screen keeps just missing a refresh - it skipped 1-4
// frames in every 100, and on each skip every walker moved twice as far in one
// frame. Any cap comfortably above the refresh rate never waits, and a 60Hz
// screen still only draws 60. On 144Hz it lands on an even ~72 (every other
// refresh) and on 120Hz an even 60, so fast screens stay smooth without
// drawing flat out.
export const FPS_DEFAULT = 75;

// system.fps.max is the operator's value in renderer-config.json. Missing, or 0
// (which the beta config once used to mean "uncapped" - it never did: `|| 60`
// read 0 as missing), gives FPS_DEFAULT.
const HotelDefault = (): number => clamp(GetConfiguration<number>('system.fps.max') || FPS_DEFAULT);

export const GetMaxFps = (): number => ((chosen !== null) ? chosen : HotelDefault());

/**
 * Push the current preference at the live ticker. Safe to call before the
 * ticker exists - GetTicker() is null until Pixi is up, and the App calls
 * this again on ENGINE_INITIALIZED, which is the call that actually lands.
 */
export const ApplyMaxFps = (): void =>
{
    const ticker = GetTicker();

    if(ticker) ticker.maxFPS = GetMaxFps();
}

export const SetMaxFps = (fps: number): void =>
{
    chosen = clamp(fps);

    try
    {
        window.localStorage.setItem(FPS_KEY, chosen.toString());
    }
    catch(e)
    {
        // per-session only, then
    }

    ApplyMaxFps();
    listeners.forEach(listener => listener());
}

export const useFpsPref = (): { maxFps: number } =>
{
    const [ , setTick ] = useState(0);

    useEffect(() =>
    {
        const listener = () => setTick(value => (value + 1));

        listeners.add(listener);

        return () => { listeners.delete(listener); };
    }, []);

    return { maxFps: GetMaxFps() };
}
