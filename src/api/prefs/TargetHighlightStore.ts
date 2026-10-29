import { RoomObjectCategory, RoomObjectVariable } from '@nitrots/nitro-renderer';
import { useEffect, useState } from 'react';
import { GetRoomEngine } from '../nitro';
import { OnAccountPrefsLoaded, ReadPref, WritePref } from './AccountPrefs';

// Settings > UI > Target select: how the player you have locked on (the lock
// on the target HUD, :lt) is marked out in the room, and in what colour. Off,
// then boards A to E of the "Target Lock Highlight" canvas - a thin, thick or
// glowing line round them, a ring at their feet, or a line and a ring - then
// an arrow over their head and a tint of the whole avatar. Lines and tints are
// drawn on their own sprite, so furni in front of them hides them too. Only
// you see it. Kept on the account (AccountPrefs), like every setting. The
// renderer draws it (renderer patch target-highlight); this puts the style
// and colour on the target's avatar, which PlayerHudWidgetView names.

export const TARGET_HIGHLIGHT_STYLES = [ 'off', 'thin', 'thick', 'glow', 'ring', 'linering', 'arrow', 'tint' ] as const;
export type TargetHighlightStyle = typeof TARGET_HIGHLIGHT_STYLES[number];

export const DEFAULT_TARGET_HIGHLIGHT: TargetHighlightStyle = 'thin';
// The design system's danger red, the canvas's default.
export const DEFAULT_TARGET_COLOUR = '#e03131';

const STYLE_KEY = 'pixelrp.prefs.target.highlight';
const COLOUR_KEY = 'pixelrp.prefs.target.colour';

const HEX_COLOUR = /^#[0-9a-f]{6}$/;

let style: TargetHighlightStyle = DEFAULT_TARGET_HIGHLIGHT;
let colour = DEFAULT_TARGET_COLOUR;

const load = (): void =>
{
    const saved = ReadPref(STYLE_KEY) as TargetHighlightStyle;

    style = (TARGET_HIGHLIGHT_STYLES.includes(saved) ? saved : DEFAULT_TARGET_HIGHLIGHT);

    const savedColour = (ReadPref(COLOUR_KEY) || '').toLowerCase();

    colour = (HEX_COLOUR.test(savedColour) ? savedColour : DEFAULT_TARGET_COLOUR);
}

load();

const listeners = new Set<() => void>();
const notify = () => listeners.forEach(listener => listener());

// The renderer's names: '' is none (AvatarVisualization).
const rendererStyle = (): string => ((style === 'off') ? '' : style);

// The unit wearing it - its room and room index, -1 for nobody.
let shownRoomId = -1;
let shownIndex = -1;

const paint = (roomId: number, index: number, value: string): void =>
{
    if((roomId < 0) || (index < 0)) return;

    const unit = GetRoomEngine()?.getRoomObject(roomId, index, RoomObjectCategory.UNIT);

    if(!unit?.model) return;

    unit.model.setValue(RoomObjectVariable.FIGURE_TARGET_HIGHLIGHT_COLOR, parseInt(colour.slice(1), 16));
    unit.model.setValue(RoomObjectVariable.FIGURE_TARGET_HIGHLIGHT, value);
}

const repaint = () => paint(shownRoomId, shownIndex, rendererStyle());

OnAccountPrefsLoaded(() =>
{
    load();
    notify();
    repaint();
});

/** Marks out this unit as your locked target, and nobody else - an index of -1 for nobody. */
export const HighlightTarget = (roomId: number, index: number): void =>
{
    if((roomId === shownRoomId) && (index === shownIndex)) return;

    paint(shownRoomId, shownIndex, '');

    shownRoomId = roomId;
    shownIndex = index;

    repaint();
}

export const SetTargetHighlight = (next: TargetHighlightStyle) =>
{
    if(!TARGET_HIGHLIGHT_STYLES.includes(next)) return;

    style = next;
    WritePref(STYLE_KEY, next);
    notify();
    repaint();
}

export const SetTargetColour = (next: string) =>
{
    const value = (next || '').toLowerCase();

    if(!HEX_COLOUR.test(value)) return;

    colour = value;
    WritePref(COLOUR_KEY, value);
    notify();
    repaint();
}

export const useTargetHighlight = (): { style: TargetHighlightStyle, colour: string } =>
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

    return { style, colour };
}
