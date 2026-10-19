import { useEffect, useState } from 'react';
import { OnAccountPrefsLoaded, ReadPref, WritePref } from './AccountPrefs';

// Settings > General: which mouse button drags (pans) the room. Kept on the
// account (AccountPrefs), like every setting.
//
// It was added when a left press became a walk after 40ms held still, which
// lost the pan on a MacBook trackpad. That early click is gone (clicks are on
// release again), so the left button always pans; the setting now decides
// whether the RIGHT button pans too, with the browser menu blocked over the
// room so it does not swallow the drag.
//
//   left  - only the left button pans (the default)
//   right - the right button pans as well
//   both  - the same as right

export type RoomDragButton = 'left' | 'right' | 'both';

export const ROOM_DRAG_BUTTONS: RoomDragButton[] = [ 'left', 'right', 'both' ];

// How far a press may travel and still be a click rather than a drag. Shared
// by the double-click pairing and the right-button macro so the two agree on
// what a drag is.
export const ROOM_DRAG_STILL_PX = 5;

const DRAG_KEY = 'pixelrp.prefs.room.drag';

let chosen: RoomDragButton = 'left';

const load = (): void =>
{
    const raw = ReadPref(DRAG_KEY);

    chosen = (ROOM_DRAG_BUTTONS.includes(raw as RoomDragButton) ? (raw as RoomDragButton) : 'left');
}

load();

const listeners = new Set<() => void>();

OnAccountPrefsLoaded(() =>
{
    load();
    listeners.forEach(listener => listener());
});

export const GetRoomDragButton = (): RoomDragButton => chosen;

export const RoomDragUsesRight = (): boolean => (chosen !== 'left');

// Which button may drag (pan) the room. Exclusive: 'left' = left only, 'right'
// = right only, 'both' = either. The engine honours this per press, so e.g.
// 'right' makes a left-drag go back to just clicking/walking.
export const RoomDragAllowsLeft = (): boolean => (chosen !== 'right');
export const RoomDragAllowsRight = (): boolean => (chosen !== 'left');

export const SetRoomDragButton = (button: RoomDragButton): void =>
{
    if(!ROOM_DRAG_BUTTONS.includes(button)) return;

    chosen = button;

    WritePref(DRAG_KEY, button);

    listeners.forEach(listener => listener());
}

export const useRoomDragPref = (): { dragButton: RoomDragButton } =>
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

    return { dragButton: chosen };
}
