import { useEffect, useState } from 'react';

// Settings > General: which mouse button drags (pans) the room. Per device like
// the frame-rate cap - it describes this machine's mouse or trackpad, not the
// player's account, so it does not follow them to another computer.
//
// WHY IT EXISTS. With the left button doing both, a press cannot know whether
// it is a click or the start of a pan, so DispatchMouseEvent waits a moment to
// see if the mouse moves. A MacBook trackpad rests between the press and the
// slide for longer than that wait, so the press becomes a walk and the pan is
// lost. Moving the pan to the right button takes the guess away entirely: a
// left press is a click at once, and a right press is the pan.
//
//   left  - the left button pans, as it always has (the default)
//   right - the right button pans; a left press is a click the moment it lands
//   both  - either button pans

export type RoomDragButton = 'left' | 'right' | 'both';

export const ROOM_DRAG_BUTTONS: RoomDragButton[] = [ 'left', 'right', 'both' ];

// How far a press may travel and still be a click rather than a drag. Shared
// by the early click and the right-button macro so the two agree on what a
// drag is.
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

export const RoomDragUsesLeft = (): boolean => (chosen !== 'right');

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
