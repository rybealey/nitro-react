import { CSSProperties, FC, PointerEvent, useRef, useState } from 'react';
import { DOCK_CAPACITY, GRID_COLS, GRID_ROWS, usePhoneBadges, usePhonePrefs } from './usePhone';

// Phone home screen: terrace wallpaper, a fixed 4x5 slot grid and the dock.
// iOS-style rearranging: icons are NOT immediately draggable — click-hold an
// app for a moment to enter edit mode, where every icon jiggles in place and
// can be dragged onto ANY grid slot (empty slots stay empty — the grid is a
// fixed matrix, not a packed list; dropping on an occupied slot swaps), into
// the dock (up to 4) and back out.
// The layout persists per account as it changes; the Done pill (top right)
// leaves edit mode with the configuration saved. Messages, Contacts, Camera
// and Photos are live apps; the rest are visible but disabled (grayed out)
// until their features ship.

const DRAG_THRESHOLD: number = 8;
const LONG_PRESS_MS: number = 550;
// Must match .phone-home-grid's gap in PhoneView.scss (row / column).
const GRID_GAP_Y: number = 18;
const GRID_GAP_X: number = 12;

// Stable per-tile pseudo-random jiggle phase/duration so the icons wobble
// out of sync (like iOS) without re-randomizing on every render.
const jiggleVars = (key: string): CSSProperties =>
{
    let hash = 0;

    for(let index = 0; index < key.length; index++) hash = (((hash * 31) + key.charCodeAt(index)) >>> 0);

    return ({
        '--jig-delay': `${ -((hash % 40) / 100) }s`,
        '--jig-dur': `${ (0.3 + ((hash % 7) / 100)) }s`
    } as CSSProperties);
}

interface PhoneAppDef
{
    // FontAwesome Duotone Solid glyph name (fa-<icon>) for the app tile.
    icon: string;
    active?: boolean;
    // Per-app icon plate gradient (from the design); disabled apps still get
    // their colour, greyed by the .is-disabled filter.
    plate?: string;
    // Optional duotone secondary-layer colour (rendered at full opacity),
    // used to tint one part of the glyph towards its iOS icon - e.g. Weather's
    // yellow sun, Camera's dark lens. When unset the glyph is white on white
    // (secondary softened) like every other iOS colour-plate icon.
    sec?: string;
}

// The full app roster from the design. Live apps: Messages, Contacts,
// Camera, Photos, Settings. Everything else is a visible-but-disabled
// placeholder (greyed) matching the design's decorative home screen.
// Plate colours track each app's iOS default icon as closely as this format
// allows (a saturated plate + white glyph, which is how iOS colours its own
// icons). Several iOS icons are grey/silver (Camera, Contacts, Settings,
// Translate) or dark (Stocks, Wallet) - kept distinct by tint.
const APP_DEFS: Record<string, PhoneAppDef> = {
    // dock
    'Phone': { icon: 'phone', plate: 'linear-gradient(160deg, #6ee86f, #34c759 55%, #1aa63f)' },
    'Messages': { icon: 'comment-dots', active: true, plate: 'linear-gradient(160deg, #5bf07a, #23c33f 55%, #12a636)' },
    'Camera': { icon: 'camera', active: true, plate: 'linear-gradient(160deg, #cfd3da, #8b9099 55%, #565b63)', sec: '#3f4650' },
    'App Store': { icon: 'store', plate: 'linear-gradient(160deg, #46a6ff, #1a86f5 55%, #0a6ee0)' },
    // grid
    'Contacts': { icon: 'address-book', active: true, plate: 'linear-gradient(160deg, #a9aeb8, #7b8290 55%, #545a66)' },
    'Photos': { icon: 'images', active: true, plate: 'linear-gradient(135deg, #fc4f8e, #ff9d3a 33%, #3fd06a 66%, #37a6ff)', sec: '#ffd60a' },
    'Stocks': { icon: 'chart-line', plate: 'linear-gradient(160deg, #3a3a46, #211c28 60%, #0f0b14)', sec: '#30d158' },
    'Music': { icon: 'music', plate: 'linear-gradient(160deg, #fc586f, #fa2d55 55%, #d81e46)' },
    'Wallet': { icon: 'wallet', plate: 'linear-gradient(160deg, #4a4650, #2a2730 60%, #141118)', sec: '#ff9f0a' },
    'Calendar': { icon: 'calendar', plate: 'linear-gradient(160deg, #ff5a52, #f5352b 55%, #cc231b)' },
    'Tasks': { icon: 'list-check', plate: 'linear-gradient(160deg, #ff9d3a, #ff5a7d 55%, #7a5cff)' },
    'Notes': { icon: 'note-sticky', plate: 'linear-gradient(160deg, #ffd85e, #f7bf2e 55%, #e6a400)', sec: '#e09a00' },
    'Weather': { icon: 'cloud-sun', plate: 'linear-gradient(160deg, #5bb8ff, #2f95e8 55%, #1e6fc0)', sec: '#ffd60a' },
    'News': { icon: 'newspaper', plate: 'linear-gradient(160deg, #ff7a7a, #fb4f4f 55%, #e23232)' },
    'Translate': { icon: 'language', plate: 'linear-gradient(160deg, #8fc7c2, #5a9a95 55%, #3a6b67)' },
    'Settings': { icon: 'gear', active: true, plate: 'linear-gradient(160deg, #c2c6ce, #9096a0 55%, #5c616b)', sec: '#5c616b' }
};

// The phone app-tile glyphs come from the PixelRP FontAwesome Duotone Solid
// kit (loaded in index.html), not the pixelarticons mask set the rest of the
// phone chrome uses.
const AppGlyph: FC<{ icon: string, sec?: string }> = ({ icon, sec }) =>
{
    // A per-app secondary colour (full opacity) tints one duotone layer; the
    // default (no sec) keeps the soft white-on-white look from .phone-app-fa.
    const style = (sec ? ({ '--fa-secondary-color': sec, '--fa-secondary-opacity': 1 } as CSSProperties) : undefined);

    return <i className={ `phone-app-fa fa-duotone fa-solid fa-${ icon }` } style={ style } aria-hidden="true" />;
}

interface DragApp
{
    key: string;
    x: number;
    y: number;
    offX: number;
    offY: number;
}

interface PhoneHomeViewProps
{
    openApp: (app: string) => void;
}

export const PhoneHomeView: FC<PhoneHomeViewProps> = props =>
{
    const { openApp = null } = props;
    const { unreadMessages = 0, requestCount = 0 } = usePhoneBadges();
    const { gridOrder, dockOrder, setAppOrder } = usePhonePrefs();
    const [ dragApp, setDragApp ] = useState<DragApp>(null);
    const [ editing, setEditing ] = useState(false);
    const homeRef = useRef<HTMLDivElement>(null);
    const gridRef = useRef<HTMLDivElement>(null);
    const dockRef = useRef<HTMLDivElement>(null);
    const startRef = useRef<{ key: string, x: number, y: number, left: number, top: number }>(null);
    const movedRef = useRef(false);
    const holdTimerRef = useRef<number>(0);

    const clearHoldTimer = () =>
    {
        if(!holdTimerRef.current) return;

        window.clearTimeout(holdTimerRef.current);
        holdTimerRef.current = 0;
    }

    const badgeCount = (key: string) => ((key === 'Messages') ? unreadMessages : ((key === 'Contacts') ? requestCount : 0));

    // Pointer -> grid slot index, through the phone's transform scale: convert
    // the client point into the grid's local space and snap to the 4-column,
    // fixed-pitch cell it falls in.
    const slotAt = (clientX: number, clientY: number): number =>
    {
        const grid = gridRef.current;

        if(!grid) return -1;

        const rect = grid.getBoundingClientRect();
        const scale = (rect.width ? (grid.offsetWidth / rect.width) : 1);
        const localX = ((clientX - rect.left) * scale);
        const localY = ((clientY - rect.top) * scale);
        const colPitch = ((grid.offsetWidth + GRID_GAP_X) / GRID_COLS);
        const rowPitch = ((grid.offsetHeight + GRID_GAP_Y) / GRID_ROWS);
        const col = Math.max(0, Math.min((GRID_COLS - 1), Math.floor(localX / colPitch)));
        const row = Math.max(0, Math.min((GRID_ROWS - 1), Math.floor(localY / rowPitch)));

        return ((row * GRID_COLS) + col);
    }

    // Nearest-tile insertion for the DOCK (which stays a packed, centered
    // row): pick the closest remaining tile and land before/after it
    // depending on which side of its center the pointer sits.
    const insertNear = (zone: string, list: string[], horizontal: boolean, clientX: number, clientY: number, draggedKey: string): string[] =>
    {
        if(!homeRef.current) return [ ...list, draggedKey ];

        const tiles = Array.from(homeRef.current.querySelectorAll(`[data-app-key][data-zone="${ zone }"]`)).filter(tile => (tile.getAttribute('data-app-key') !== draggedKey));
        let bestIndex = -1;
        let bestDistance = Number.MAX_VALUE;
        let after = false;

        tiles.forEach((tile, index) =>
        {
            const rect = tile.getBoundingClientRect();
            const centerX = (rect.left + (rect.width / 2));
            const centerY = (rect.top + (rect.height / 2));
            const distance = (((centerX - clientX) ** 2) + ((centerY - clientY) ** 2));

            if(distance >= bestDistance) return;

            bestDistance = distance;
            bestIndex = index;
            after = (horizontal ? (clientX > centerX) : ((clientY > (centerY + (rect.height * 0.2))) || ((Math.abs(clientY - centerY) <= (rect.height * 0.2)) && (clientX > centerX))));
        });

        const result = [ ...list ];

        result.splice(((bestIndex < 0) ? result.length : (bestIndex + (after ? 1 : 0))), 0, draggedKey);

        return result;
    }

    const onTileDown = (event: PointerEvent<HTMLDivElement>, key: string) =>
    {
        try
        {
            event.currentTarget.setPointerCapture(event.pointerId);
        }
        catch(e)
        {}

        const rect = event.currentTarget.getBoundingClientRect();

        movedRef.current = false;
        startRef.current = { key, x: event.clientX, y: event.clientY, left: rect.left, top: rect.top };

        // Click-hold enters edit mode (and the held icon can be dragged in
        // the same gesture). The pending open-on-click is suppressed via
        // movedRef, exactly like a drag.
        if(!editing)
        {
            clearHoldTimer();
            holdTimerRef.current = window.setTimeout(() =>
            {
                holdTimerRef.current = 0;
                movedRef.current = true;

                setEditing(true);
            }, LONG_PRESS_MS);
        }
    }

    const onTileMove = (event: PointerEvent<HTMLDivElement>) =>
    {
        const start = startRef.current;

        if(!start) return;

        if(!dragApp)
        {
            if((Math.abs(event.clientX - start.x) <= DRAG_THRESHOLD) && (Math.abs(event.clientY - start.y) <= DRAG_THRESHOLD)) return;

            // moved before the hold elapsed: this gesture is not a
            // long-press, and outside edit mode it is not a drag either
            clearHoldTimer();

            if(!editing) return;

            movedRef.current = true;

            setDragApp({ key: start.key, x: event.clientX, y: event.clientY, offX: (start.x - start.left), offY: (start.y - start.top) });

            return;
        }

        const key = dragApp.key;
        const grid = [ ...gridOrder ];
        const fromSlot = grid.indexOf(key);
        let dock = dockOrder.filter(entry => (entry !== key));
        let inDock = false;

        if(dockRef.current)
        {
            const rect = dockRef.current.getBoundingClientRect();

            inDock = ((event.clientX >= rect.left) && (event.clientX <= rect.right) && (event.clientY >= rect.top) && (event.clientY <= rect.bottom));
        }

        if(inDock && (dock.length < DOCK_CAPACITY))
        {
            if(fromSlot >= 0) grid[fromSlot] = '';

            dock = insertNear('dock', dock, true, event.clientX, event.clientY, key);
        }
        else
        {
            const target = slotAt(event.clientX, event.clientY);

            if((target < 0) || (grid[target] === key))
            {
                setDragApp({ ...dragApp, x: event.clientX, y: event.clientY });

                return;
            }

            // land on the slot under the pointer; whatever lived there swaps
            // into the dragged app's previous slot (or the first empty one
            // when the drag came out of the dock)
            const displaced = grid[target];

            if(fromSlot >= 0) grid[fromSlot] = '';

            grid[target] = key;

            if(displaced)
            {
                const dest = ((fromSlot >= 0) ? fromSlot : grid.indexOf(''));

                if(dest >= 0) grid[dest] = displaced;
            }
        }

        setAppOrder(grid, dock);
        setDragApp({ ...dragApp, x: event.clientX, y: event.clientY });
    }

    const onTileUp = () =>
    {
        clearHoldTimer();

        startRef.current = null;

        setDragApp(null);
    }

    const onTileTap = (key: string) =>
    {
        if(movedRef.current)
        {
            movedRef.current = false;

            return;
        }

        // while editing, taps rearrange-mode-select nothing — apps only open
        // again after Done
        if(editing) return;

        const app = APP_DEFS[key];

        if(app && app.active && openApp) openApp(key);
    }

    const onDone = () =>
    {
        clearHoldTimer();

        startRef.current = null;

        setDragApp(null);
        setEditing(false);
    }

    const appTile = (key: string, zone: string, showLabel: boolean, slot: number = -1) =>
    {
        const app = (APP_DEFS[key] ?? { icon: 'user' });
        const count = badgeCount(key);
        const dragging = (dragApp && (dragApp.key === key));
        const slotStyle: CSSProperties = ((slot >= 0) ? { gridColumn: ((slot % GRID_COLS) + 1), gridRow: (Math.floor(slot / GRID_COLS) + 1) } : {});
        const style = (editing ? { ...slotStyle, ...jiggleVars(key) } : slotStyle);

        return (
            <div key={ key } data-app-key={ key } data-zone={ zone } className={ `phone-app${ app.active ? ' phone-tap' : ' is-disabled' }${ dragging ? ' is-drag-source' : '' }` } style={ style } title={ app.active ? key : `${ key } - coming soon` } onClick={ event => onTileTap(key) } onPointerDown={ event => onTileDown(event, key) } onPointerMove={ onTileMove } onPointerUp={ onTileUp } onPointerCancel={ onTileUp }>
                <div className="phone-app-tile" style={ app.plate ? { background: app.plate } : undefined }>
                    <AppGlyph icon={ app.icon } sec={ app.sec } />
                    { (count > 0) &&
                        <div className="phone-app-badge">{ (count > 99) ? '99+' : count }</div> }
                </div>
                { showLabel &&
                    <div className="phone-app-label">{ key }</div> }
            </div>
        );
    }

    // Ghost coordinates in the (possibly transform-scaled) screen's local
    // space: convert visual pixels back through the scale factor.
    let ghostStyle = null;

    if(dragApp && homeRef.current)
    {
        const rect = homeRef.current.getBoundingClientRect();
        const scale = (rect.width ? (homeRef.current.offsetWidth / rect.width) : 1);

        ghostStyle = {
            left: (((dragApp.x - dragApp.offX) - rect.left) * scale),
            top: (((dragApp.y - dragApp.offY) - rect.top) * scale)
        };
    }

    return (
        <div ref={ homeRef } className={ `phone-screen phone-home${ editing ? ' is-editing' : '' }` }>
            <div className="phone-home-wallpaper" />
            <div className="phone-home-shade" />
            { editing &&
                <div className="phone-home-done phone-tap" onClick={ onDone }>Done</div> }
            <div ref={ gridRef } className="phone-home-grid">
                { gridOrder.map((key, slot) => (key ? appTile(key, 'grid', true, slot) : null)) }
            </div>
            <div ref={ dockRef } className="phone-home-dock">
                { dockOrder.map(key => appTile(key, 'dock', false)) }
            </div>
            { dragApp && ghostStyle &&
                <div className="phone-app-ghost" style={ ghostStyle }>
                    <div className="phone-app-tile" style={ (APP_DEFS[dragApp.key]?.plate) ? { background: APP_DEFS[dragApp.key].plate } : undefined }>
                        <AppGlyph icon={ (APP_DEFS[dragApp.key] ?? { icon: 'user' }).icon } sec={ APP_DEFS[dragApp.key]?.sec } />
                    </div>
                </div> }
        </div>
    );
}
