import { RoomEngine, RoomEngineEvent, RoomObjectCategory, RoomObjectVariable } from '@nitrots/nitro-renderer';
import { useEffect, useState } from 'react';
import { GetRoomEngine } from '../nitro';
import { OnAccountPrefsLoaded, ReadPref, WritePref } from './AccountPrefs';

// Settings > UI > Cursor: the square under the mouse on the room floor. The
// boards of the "Tile cursor redesign" canvas, B to K, are the styles - their
// lines drawn 2 px, as 1 px read too thin - plus Target, a bullseye, and
// Classic, Habbo's raised frame with its shadow. (A, one thin line, is G at
// 2 px, so it is not a style.) Light (the canvas's G "Bold", a 2 px line lying
// exactly on the tile) is the default and comes first. Any style is drawn in
// the player's colour, white by default. Kept on the account (AccountPrefs),
// like every setting. The renderer draws it (renderer patch cursor-style; the
// art is docker/nitro/make-tile-cursor.py) - this puts both on the room's
// cursor when a room is built and when the player changes them.

// Light first, then the canvas's order, B to K, then Target and Classic. Each
// id names its frame in tile_cursor.nitro.
export const CURSOR_STYLES = [ 'light', 'frosted', 'corners', 'pad', 'glow', 'shade', 'double', 'rounded', 'dashed', 'points', 'target', 'classic' ] as const;
export type CursorStyle = typeof CURSOR_STYLES[number];

export const DEFAULT_CURSOR_STYLE: CursorStyle = 'light';
export const DEFAULT_CURSOR_COLOUR = '#ffffff';

const STYLE_KEY = 'pixelrp.prefs.cursor.style';
const COLOUR_KEY = 'pixelrp.prefs.cursor.colour';

const HEX_COLOUR = /^#[0-9a-f]{6}$/;

/** The style's frame in tile_cursor.nitro - the default is the stock a frame. */
export const CursorAssetName = (cursorStyle: CursorStyle): string => `tile_cursor_64_${ (cursorStyle === DEFAULT_CURSOR_STYLE) ? 'a' : cursorStyle }_0_0`;

let style: CursorStyle = DEFAULT_CURSOR_STYLE;
let colour = DEFAULT_CURSOR_COLOUR;

const load = (): void =>
{
    // 'modern' and then 'bold' were the default's names before it was Light,
    // so either reads as the default.
    const saved = ReadPref(STYLE_KEY) as CursorStyle;

    style = (CURSOR_STYLES.includes(saved) ? saved : DEFAULT_CURSOR_STYLE);

    const savedColour = (ReadPref(COLOUR_KEY) || '').toLowerCase();

    colour = (HEX_COLOUR.test(savedColour) ? savedColour : DEFAULT_CURSOR_COLOUR);
}

load();

const listeners = new Set<() => void>();
const notify = () => listeners.forEach(listener => listener());

// The renderer's names: '' is its default frame (TileCursorVisualization).
const applyToRoom = (roomId: number): boolean =>
{
    const cursor = GetRoomEngine()?.getRoomObject(roomId, RoomEngine.CURSOR_OBJECT_ID, RoomObjectCategory.CURSOR);

    if(!cursor || !cursor.model) return false;

    cursor.model.setValue(RoomObjectVariable.TILE_CURSOR_STYLE, ((style === DEFAULT_CURSOR_STYLE) ? '' : style));
    cursor.model.setValue(RoomObjectVariable.TILE_CURSOR_COLOR, parseInt(colour.slice(1), 16));

    return true;
}

const applyToActiveRoom = (): void =>
{
    const roomEngine = GetRoomEngine();

    if(roomEngine) applyToRoom(roomEngine.activeRoomId);
}

OnAccountPrefsLoaded(() =>
{
    load();
    notify();
    applyToActiveRoom();
});

let started = false;

// Called once from App at ENGINE_INITIALIZED. The cursor is made with each
// room, just before the room's INITIALIZED, so every room gets the player's.
export const StartCursorPrefs = (): void =>
{
    if(started) return;

    started = true;

    GetRoomEngine().events.addEventListener(RoomEngineEvent.INITIALIZED, (event: RoomEngineEvent) => applyToRoom(event.roomId));
    applyToActiveRoom();
}

export const SetCursorStyle = (next: CursorStyle) =>
{
    if(!CURSOR_STYLES.includes(next)) return;

    style = next;
    WritePref(STYLE_KEY, next);
    notify();
    applyToActiveRoom();
}

export const SetCursorColour = (next: string) =>
{
    const value = (next || '').toLowerCase();

    if(!HEX_COLOUR.test(value)) return;

    colour = value;
    WritePref(COLOUR_KEY, value);
    notify();
    applyToActiveRoom();
}

export const useCursorPrefs = (): { style: CursorStyle, colour: string } =>
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
