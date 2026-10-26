import { useEffect, useState } from 'react';

// PixelRP: the frosted glass behind the HUD can be switched off - a staff test
// (Twist, 2026-10-26). A dozen HUD pieces blur the room behind them
// (backdrop-filter): the clock, the online count, the HUD plate, the chat bar,
// the purse, the room title, and the menu and info panel a click on somebody
// opens. The room is drawn again every frame, so every blur is worked out
// again every frame by the browser's compositor and the graphics card - work
// the lag recorder cannot see. The stutters on record (twist, Jeen) had the
// page idle while the screen did not update, which that work would explain.
// Off, every backdrop-filter is dropped (index.scss, .prp-no-blur) and each lag
// report says blur=off, so the two can be compared.
//
// Kept on THIS computer, not the account (AccountPrefs): the question is
// whether this machine's graphics stall less without it.

const KEY = 'pixelrp.test.hud-blur-off';
const CLASS = 'prp-no-blur';

const read = (): boolean =>
{
    try
    {
        return (window.localStorage.getItem(KEY) === '1');
    }
    catch(e)
    {
        return false;
    }
}

let off = read();

const listeners = new Set<() => void>();

export const IsHudBlurOff = (): boolean => off;

export const ApplyHudBlur = (): void =>
{
    document.documentElement.classList.toggle(CLASS, off);
}

export const SetHudBlurOff = (value: boolean): void =>
{
    off = value;

    try
    {
        if(off) window.localStorage.setItem(KEY, '1');
        else window.localStorage.removeItem(KEY);
    }
    catch(e)
    {}

    ApplyHudBlur();
    listeners.forEach(listener => listener());
}

export const useHudBlurOff = (): boolean =>
{
    const [ , setTick ] = useState(0);

    useEffect(() =>
    {
        const listener = () => setTick(value => (value + 1));

        listeners.add(listener);

        return () =>
        {
            listeners.delete(listener);
        };
    }, []);

    return off;
}
