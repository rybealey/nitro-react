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
// having, because lowering it is the one lever a player on a weak machine
// has, and a 144Hz or 240Hz monitor genuinely uses the top of the range.

const FPS_KEY = 'pixelrp.prefs.fps.max';

// Pixi clamps maxFPS UP to minFPS (10 by default), so a smaller number would
// silently become 10 anyway - the floor says so honestly rather than offering
// a value that does not do what it reads.
export const FPS_MIN = 10;
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

// system.fps.max is the operator's value in renderer-config.json; 60 is what
// the shipped example carries, and the fallback if the key is missing.
const HotelDefault = (): number => clamp(GetConfiguration<number>('system.fps.max') || 60);

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
