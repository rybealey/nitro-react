import { MouseEventType } from '@nitrots/nitro-renderer';
import { ROOM_DRAG_STILL_PX } from '../../prefs/RoomDragStore';
import { GetRoomEngine } from './GetRoomEngine';

let didMouseMove = false;
let lastClick = 0;
let lastClickX = 0;
let lastClickY = 0;
let clickCount = 0;

// A click is the browser's own click, on RELEASE. The 40ms click-on-press that
// used to live here (08676607) made a press held still for a moment walk
// instead of pan, which is what made the room hard to drag, so it is gone.

export const DispatchMouseEvent = (event: MouseEvent, canvasId: number = 1) =>
{
    const x = event.clientX;
    const y = event.clientY;

    let eventType = event.type;

    if(eventType === MouseEventType.MOUSE_CLICK)
    {
        // A second click only pairs with the first when it lands where the
        // first did. Two quick clicks on DIFFERENT floor tiles are two
        // steering clicks, but stock Nitro made them a double-click, which the
        // floor ignores - so the second walk was silently dropped. didMouseMove
        // cannot catch it: it is reset on each press, not between the two clicks.
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

    GetRoomEngine().dispatchMouseEvent(canvasId, x, y, eventType, event.altKey, (event.ctrlKey || event.metaKey), event.shiftKey, false);
}
