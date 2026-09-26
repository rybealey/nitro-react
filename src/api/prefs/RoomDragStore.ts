import { useEffect, useState } from 'react';

// Settings > General: which mouse button drags (pans) the room. Per device like
// the frame-rate cap - it describes this machine's mouse or trackpad, not the
// player's account, so it does not follow them to another computer.
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

try
{
    const raw = window.localStorage.getItem(DRAG_KEY);

    if(ROOM_DRAG_BUTTONS.includes(raw as RoomDragButton)) chosen = (raw as RoomDragButton);
}
catch(e)
{
    // storage blocked: the default for this session
}

const listeners = new Set<() => void>();

export const GetRoomDragButton = (): RoomDragButton => chosen;

export const RoomDragUsesRight = (): boolean => (chosen !== 'left');

export const SetRoomDragButton = (button: RoomDragButton): void =>
{
    if(!ROOM_DRAG_BUTTONS.includes(button)) return;

    chosen = button;

    try
    {
        window.localStorage.setItem(DRAG_KEY, button);
    }
    catch(e)
    {
        // per-session only, then
    }

    listeners.forEach(listener => listener());
}

export const useRoomDragPref = (): { dragButton: RoomDragButton } =>
{
    const [ , setTick ] = useState(0);

    useEffect(() =>
    {
        const listener = () => setTick(value => (value + 1));

        listeners.add(listener);

        return () => { listeners.delete(listener); };
    }, []);

    return { dragButton: chosen };
}
