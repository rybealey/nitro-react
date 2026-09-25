import { MouseEventType } from '@nitrots/nitro-renderer';
import { ROOM_DRAG_STILL_PX, RoomDragUsesLeft } from '../../prefs/RoomDragStore';
import { GetRoomEngine } from './GetRoomEngine';

let didMouseMove = false;
let lastClick = 0;
let lastClickX = 0;
let lastClickY = 0;
let clickCount = 0;

// CLICK ON PRESS, NOT ON RELEASE.
//
// The browser's click event fires when the button comes back UP, so every walk
// waited for the finger: a normal click holds the button for roughly 50-150ms
// before anything was sent. But pressing is also how a drag (pan) starts, and
// at the moment of the press nothing can know which it will be.
//
// So a left press starts a short timer. If the mouse is still where it was
// pressed when the timer ends, the click is delivered THEN, through exactly the
// same path a real click takes - avatars, furni, walking and double-clicks all
// behave as before, only sooner - and the browser's own click on release is
// swallowed so nothing happens twice. A mouse that moves first is a drag and is
// left entirely to the existing drag handling. A release before the timer is an
// ordinary click, unchanged.
//
// THE ONE EDGE: a press held still past the timer and only then dragged has
// already become a click, and delivering a click ends the room's drag - so that
// press walks and does not pan. Decorating is left alone entirely, and touch has
// its own path (DispatchTouchEvent).
//
// When the player has moved the pan to the right button (Settings > General,
// RoomDragStore), a left press can only ever be a click, so it is delivered the
// moment it lands with no timer and no edge.
const EARLY_CLICK_MS = 40;

let pressTimer: ReturnType<typeof setTimeout> = null;
let pressX = 0;
let pressY = 0;
let earlyClickDelivered = false;

const cancelPress = (): void =>
{
    if(pressTimer === null) return;

    clearTimeout(pressTimer);
    pressTimer = null;
}

// Everything a mouse event did before, unchanged - shared by the browser's own
// events and the early click, so the two cannot drift apart.
const dispatch = (canvasId: number, x: number, y: number, type: string, altKey: boolean, ctrlKey: boolean, shiftKey: boolean): void =>
{
    let eventType = type;

    if(eventType === MouseEventType.MOUSE_CLICK)
    {
        // A second click only pairs with the first when it lands where the
        // first did. Two quick clicks on DIFFERENT floor tiles are two
        // steering clicks, but stock Nitro made them a double-click, which the
        // floor ignores - so the second walk was silently dropped (every other
        // quick click with the pan on the right button). didMouseMove cannot
        // catch it: it is reset on each press, not between the two clicks.
        const samePlace = ((Math.abs(x - lastClickX) <= ROOM_DRAG_STILL_PX) && (Math.abs(y - lastClickY) <= ROOM_DRAG_STILL_PX));

        if(lastClick)
        {
            clickCount = 1;

            if((lastClick >= Date.now() - 300) && samePlace) clickCount++;
        }

        lastClick = Date.now();
        lastClickX = x;
        lastClickY = y;

        if(clickCount === 2)
        {
            if(!didMouseMove) eventType = MouseEventType.DOUBLE_CLICK;

            clickCount = 0;
            lastClick = null;
        }
    }

    switch(eventType)
    {
        case MouseEventType.MOUSE_CLICK:
            break;
        case MouseEventType.DOUBLE_CLICK:
            break;
        case MouseEventType.MOUSE_MOVE:
            didMouseMove = true;
            break;
        case MouseEventType.MOUSE_DOWN:
            didMouseMove = false;
            break;
        case MouseEventType.MOUSE_UP:
            break;
        case MouseEventType.RIGHT_CLICK:
            break;
        default: return;
    }

    GetRoomEngine().dispatchMouseEvent(canvasId, x, y, eventType, altKey, ctrlKey, shiftKey, false);
}

export const DispatchMouseEvent = (event: MouseEvent, canvasId: number = 1) =>
{
    const x = event.clientX;
    const y = event.clientY;
    const altKey = event.altKey;
    const ctrlKey = (event.ctrlKey || event.metaKey);
    const shiftKey = event.shiftKey;

    switch(event.type)
    {
        case MouseEventType.MOUSE_DOWN:
            cancelPress();
            earlyClickDelivered = false;

            if((event.button === 0) && !GetRoomEngine().isDecorating)
            {
                if(!RoomDragUsesLeft())
                {
                    dispatch(canvasId, x, y, event.type, altKey, ctrlKey, shiftKey);

                    earlyClickDelivered = true;

                    dispatch(canvasId, x, y, MouseEventType.MOUSE_CLICK, altKey, ctrlKey, shiftKey);

                    return;
                }

                pressX = x;
                pressY = y;

                pressTimer = setTimeout(() =>
                {
                    pressTimer = null;
                    earlyClickDelivered = true;

                    dispatch(canvasId, pressX, pressY, MouseEventType.MOUSE_CLICK, altKey, ctrlKey, shiftKey);
                }, EARLY_CLICK_MS);
            }
            break;
        case MouseEventType.MOUSE_MOVE:
            if((pressTimer !== null) && ((Math.abs(x - pressX) > ROOM_DRAG_STILL_PX) || (Math.abs(y - pressY) > ROOM_DRAG_STILL_PX))) cancelPress();
            break;
        case MouseEventType.MOUSE_UP:
            cancelPress();
            break;
        case MouseEventType.MOUSE_CLICK:
            // Already delivered at the press - this is the same click.
            if(earlyClickDelivered)
            {
                earlyClickDelivered = false;

                return;
            }
            break;
    }

    dispatch(canvasId, x, y, event.type, altKey, ctrlKey, shiftKey);
}
