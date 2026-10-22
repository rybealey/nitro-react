import { MouseEventType } from '@nitrots/nitro-renderer';
import { ROOM_DRAG_STILL_PX, RoomDragAllowsLeft, RoomDragAllowsRight } from '../../prefs/RoomDragStore';
import { GetRoomEngine } from './GetRoomEngine';

let didMouseMove = false;
let lastClick = 0;
let lastClickX = 0;
let lastClickY = 0;
let clickCount = 0;

// PixelRP: a burst of left clicks on one spot - X-Mouse's {LMB}{LMB}{LMB} and
// the like, which send several clicks for one press of the button, back to
// back. Every click the room is handed costs three checks of every picture in
// it (press, release, click) and maybe a walk, and the rest of a burst only
// repeats what its first two clicks did. So the first two are kept, as the
// click and the double-click they make by hand - furniture is still used by
// one press of such a macro - but the second one's press and release are not
// passed on, a double-click needs neither, and anything after it is dropped.
// Nobody presses again this soon after letting go by hand; a real
// double-click is slower and goes through untouched.
const BURST_GAP_MS = 40;

let lastReleaseAt = 0;
let lastReleaseX = 0;
let lastReleaseY = 0;
// which click of the current burst this press is: 1 = the first (or no
// burst), 2 = the double-click, 3 and on = dropped; 0 = not the left button
let burstClick = 0;

// A click is the browser's own click, on RELEASE. The 40ms click-on-press that
// used to live here (08676607) made a press held still for a moment walk
// instead of pan, which is what made the room hard to drag, so it is gone.

export const DispatchMouseEvent = (event: MouseEvent, canvasId: number = 1) =>
{
    const x = event.clientX;
    const y = event.clientY;

    let eventType = event.type;

    if(eventType === MouseEventType.MOUSE_DOWN)
    {
        if(event.button === 0)
        {
            const samePlace = ((Math.abs(x - lastReleaseX) <= ROOM_DRAG_STILL_PX) && (Math.abs(y - lastReleaseY) <= ROOM_DRAG_STILL_PX));

            burstClick = ((lastReleaseAt > 0) && ((performance.now() - lastReleaseAt) <= BURST_GAP_MS) && samePlace) ? (burstClick + 1) : 1;
        }
        else
        {
            burstClick = 0;
        }

        if(burstClick > 1)
        {
            // as the press would have, so the click after it still pairs
            // into the double-click
            didMouseMove = false;

            return;
        }
    }
    else if(eventType === MouseEventType.MOUSE_UP)
    {
        if(event.button === 0)
        {
            lastReleaseAt = performance.now();
            lastReleaseX = x;
            lastReleaseY = y;
        }

        if(burstClick > 1) return;
    }
    else if((eventType === MouseEventType.MOUSE_CLICK) && (burstClick > 2))
    {
        return;
    }

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

    // Only the button chosen in Settings > General > Drag the room with may
    // start a pan; the engine checks this on the press.
    const canStartDrag = (event.button === 2) ? RoomDragAllowsRight() : RoomDragAllowsLeft();

    GetRoomEngine().dispatchMouseEvent(canvasId, x, y, eventType, event.altKey, (event.ctrlKey || event.metaKey), event.shiftKey, false, canStartDrag);
}
