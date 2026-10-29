import { RoomObjectCategory, RoomObjectVariable } from '@nitrots/nitro-renderer';
import { useEffect, useState } from 'react';
import { GetRoomEngine } from '../nitro';
import { OnAccountPrefsLoaded, ReadPref, WritePref } from './AccountPrefs';

// Settings > UI > Target select: how the player you have locked on (the lock
// on the target HUD, :lt) is marked out in the room - boards A to D of the
// "Target Lock Highlight" canvas: a thin, thick or glowing red line round them,
// or a red ring at their feet; or nothing. The line is drawn on their own
// sprite, so furni in front of them hides it with them. Only you see it. Kept
// on the account (AccountPrefs), like every setting. The renderer draws it
// (renderer patch target-highlight); this puts the style on the target's
// avatar, which PlayerHudWidgetView names.

export const TARGET_HIGHLIGHT_STYLES = [ 'thin', 'thick', 'glow', 'ring', 'off' ] as const;
export type TargetHighlightStyle = typeof TARGET_HIGHLIGHT_STYLES[number];

export const DEFAULT_TARGET_HIGHLIGHT: TargetHighlightStyle = 'thin';

const STYLE_KEY = 'pixelrp.prefs.target.highlight';

let style: TargetHighlightStyle = DEFAULT_TARGET_HIGHLIGHT;

const load = (): void =>
{
    const saved = ReadPref(STYLE_KEY) as TargetHighlightStyle;

    style = (TARGET_HIGHLIGHT_STYLES.includes(saved) ? saved : DEFAULT_TARGET_HIGHLIGHT);
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

    unit?.model?.setValue(RoomObjectVariable.FIGURE_TARGET_HIGHLIGHT, value);
}

OnAccountPrefsLoaded(() =>
{
    load();
    notify();
    paint(shownRoomId, shownIndex, rendererStyle());
});

/** Marks out this unit as your locked target, and nobody else - an index of -1 for nobody. */
export const HighlightTarget = (roomId: number, index: number): void =>
{
    if((roomId === shownRoomId) && (index === shownIndex)) return;

    paint(shownRoomId, shownIndex, '');

    shownRoomId = roomId;
    shownIndex = index;

    paint(shownRoomId, shownIndex, rendererStyle());
}

export const SetTargetHighlight = (next: TargetHighlightStyle) =>
{
    if(!TARGET_HIGHLIGHT_STYLES.includes(next)) return;

    style = next;
    WritePref(STYLE_KEY, next);
    notify();
    paint(shownRoomId, shownIndex, rendererStyle());
}

export const useTargetHighlight = (): TargetHighlightStyle =>
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

    return style;
}
