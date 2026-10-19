import { useEffect, useState } from 'react';
import { OnAccountPrefsLoaded, ReadPref, WritePref } from './AccountPrefs';

// Settings > UI > Colours > HUD: how the player HUD at the top left is drawn,
// and the colours of its three bars. Kept on the account (AccountPrefs), like
// every setting.
//
//   classic - the bars and name sit on the dark plate (the default)
//   light   - no plate: the room shows through, and the name, bars and
//             portrait carry black outlines so they still read over it
//
// The bar colours are '#rrggbb'; each one's default is the colour the HUD
// always had. The colour picker's saved colours live here too: they are a
// palette for this screen, shared by every colour on the page.

export type HudStyle = 'classic' | 'light';

export type HudBar = 'hp' | 'energy' | 'aggro';

export const HUD_STYLES: HudStyle[] = [ 'classic', 'light' ];

export const HUD_BAR_DEFAULTS: Record<HudBar, string> = { hp: '#e03131', energy: '#3f8fbf', aggro: '#e87332' };

export const SAVED_COLOURS_MAX = 6;

const HUD_KEY = 'pixelrp.prefs.hud';
const SAVED_KEY = 'pixelrp.prefs.colours.saved';

const IsHex = (value: unknown): value is string => ((typeof value === 'string') && /^#[0-9a-fA-F]{6}$/.test(value));

let style: HudStyle = 'classic';
let bars: Record<HudBar, string> = { ...HUD_BAR_DEFAULTS };
let saved: string[] = [];

const load = (): void =>
{
    style = 'classic';
    bars = { ...HUD_BAR_DEFAULTS };
    saved = [];

    try
    {
        const raw = JSON.parse(ReadPref(HUD_KEY) ?? '{}');

        if(HUD_STYLES.includes(raw?.style)) style = raw.style;

        for(const bar of Object.keys(HUD_BAR_DEFAULTS) as HudBar[])
        {
            if(IsHex(raw?.[bar])) bars[bar] = raw[bar].toLowerCase();
        }
    }
    catch(e)
    {
        // unreadable: the defaults
    }

    try
    {
        const raw = JSON.parse(ReadPref(SAVED_KEY) ?? '[]');

        if(Array.isArray(raw)) saved = raw.filter(IsHex).map(hex => hex.toLowerCase()).slice(0, SAVED_COLOURS_MAX);
    }
    catch(e)
    {
        // as above
    }
}

load();

const listeners = new Set<() => void>();

const notify = (): void => listeners.forEach(listener => listener());

OnAccountPrefsLoaded(() =>
{
    load();
    notify();
});

const persist = (key: string, value: unknown): void => WritePref(key, JSON.stringify(value));

export const SetHudStyle = (next: HudStyle): void =>
{
    if(!HUD_STYLES.includes(next) || (next === style)) return;

    style = next;
    persist(HUD_KEY, { style, ...bars });
    notify();
}

export const SetHudBarColour = (bar: HudBar, colour: string): void =>
{
    if(!(bar in HUD_BAR_DEFAULTS) || !IsHex(colour)) return;

    const hex = colour.toLowerCase();

    if(bars[bar] === hex) return;

    bars = { ...bars, [bar]: hex };
    persist(HUD_KEY, { style, ...bars });
    notify();
}

export const SetSavedColours = (colours: string[]): void =>
{
    saved = colours.filter(IsHex).map(hex => hex.toLowerCase()).slice(0, SAVED_COLOURS_MAX);
    persist(SAVED_KEY, saved);
    notify();
}

export const useHudPrefs = (): { hudStyle: HudStyle, hudBars: Record<HudBar, string>, savedColours: string[] } =>
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

    return { hudStyle: style, hudBars: bars, savedColours: saved };
}
