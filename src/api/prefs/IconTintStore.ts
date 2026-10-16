import { useEffect, useState } from 'react';

// Settings > UI > Colours > Sidebar Icons: the tint on the left drawer icons.
// This used to follow the Interface colour; it is now its own setting. Kept on
// THIS device (like the HUD colours), so it does not follow the account.
//
//   '' (default) = no tint, the icons' own grayscale art
//   '#rrggbb'    = recolour the icons to this hue (mix-blend-mode: color, so
//                  the art keeps its shading)

export const DEFAULT_ICON_TINT = '';

// What the chip and the picker show when nothing is set, so there is a colour
// to start from; picking it (or any colour) counts as "set", Reset clears it.
export const ICON_TINT_NEUTRAL = '#9296a0';

const KEY = 'pixelrp.prefs.iconTint';

const IsHex = (value: unknown): value is string => ((typeof value === 'string') && /^#[0-9a-fA-F]{6}$/.test(value));

let tint = DEFAULT_ICON_TINT;

try
{
    const raw = window.localStorage.getItem(KEY);

    if(IsHex(raw)) tint = raw.toLowerCase();
}
catch(e)
{
    // storage blocked: the default for this session
}

const listeners = new Set<() => void>();

export const GetIconTint = (): string => tint;

export const SetIconTint = (next: string): void =>
{
    const value = (IsHex(next) ? next.toLowerCase() : DEFAULT_ICON_TINT);

    if(value === tint) return;

    tint = value;

    try
    {
        if(value) window.localStorage.setItem(KEY, value);
        else window.localStorage.removeItem(KEY);
    }
    catch(e)
    {
        // per-session only, then
    }

    listeners.forEach(listener => listener());
}

export const useIconTint = (): { iconTint: string } =>
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

    return { iconTint: tint };
}
