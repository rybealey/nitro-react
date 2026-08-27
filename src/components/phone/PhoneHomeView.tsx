import { FC, PointerEvent, useRef, useState } from 'react';
import { PhoneIcon } from './PhoneIcon';
import { DOCK_CAPACITY, usePhoneBadges, usePhonePrefs } from './usePhone';

// Phone home screen: terrace wallpaper, a 4-wide app grid and the dock.
// Click-hold-drag an icon to rearrange — between grid slots, into the dock
// (up to 4) and back out — and the layout persists per account. Messages,
// Contacts, Camera and Photos are live apps; the rest are visible but
// disabled (grayed out) until their features ship.

const DRAG_THRESHOLD: number = 8;

interface PhoneAppDef
{
    icon: string;
    active?: boolean;
}

const APP_DEFS: Record<string, PhoneAppDef> = {
    'Contacts': { icon: 'users', active: true },
    'Settings': { icon: 'sliders', active: true },
    'Characters': { icon: 'user' },
    'App Store': { icon: 'download' },
    'Mercury': { icon: 'dollar' },
    'Sitch': { icon: 'heart' },
    'Messages': { icon: 'message', active: true },
    'Camera': { icon: 'camera', active: true },
    'Photos': { icon: 'image', active: true }
};

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
    const homeRef = useRef<HTMLDivElement>(null);
    const dockRef = useRef<HTMLDivElement>(null);
    const startRef = useRef<{ key: string, x: number, y: number, left: number, top: number }>(null);
    const movedRef = useRef(false);

    const badgeCount = (key: string) => ((key === 'Messages') ? unreadMessages : ((key === 'Contacts') ? requestCount : 0));

    // Nearest-tile insertion, straight from the design's home-screen drag:
    // pick the closest remaining tile and land before/after it depending on
    // which side of its center the pointer sits.
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
    }

    const onTileMove = (event: PointerEvent<HTMLDivElement>) =>
    {
        const start = startRef.current;

        if(!start) return;

        if(!dragApp)
        {
            if((Math.abs(event.clientX - start.x) <= DRAG_THRESHOLD) && (Math.abs(event.clientY - start.y) <= DRAG_THRESHOLD)) return;

            movedRef.current = true;

            setDragApp({ key: start.key, x: event.clientX, y: event.clientY, offX: (start.x - start.left), offY: (start.y - start.top) });

            return;
        }

        const key = dragApp.key;
        let grid = gridOrder.filter(entry => (entry !== key));
        let dock = dockOrder.filter(entry => (entry !== key));
        let inDock = false;

        if(dockRef.current)
        {
            const rect = dockRef.current.getBoundingClientRect();

            inDock = ((event.clientX >= rect.left) && (event.clientX <= rect.right) && (event.clientY >= rect.top) && (event.clientY <= rect.bottom));
        }

        if(inDock && (dock.length < DOCK_CAPACITY)) dock = insertNear('dock', dock, true, event.clientX, event.clientY, key);
        else grid = insertNear('grid', grid, false, event.clientX, event.clientY, key);

        setAppOrder(grid, dock);
        setDragApp({ ...dragApp, x: event.clientX, y: event.clientY });
    }

    const onTileUp = () =>
    {
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

        const app = APP_DEFS[key];

        if(app && app.active && openApp) openApp(key);
    }

    const appTile = (key: string, zone: string, showLabel: boolean) =>
    {
        const app = (APP_DEFS[key] ?? { icon: 'user' });
        const count = badgeCount(key);
        const dragging = (dragApp && (dragApp.key === key));

        return (
            <div key={ key } data-app-key={ key } data-zone={ zone } className={ `phone-app${ app.active ? ' phone-tap' : ' is-disabled' }${ dragging ? ' is-drag-source' : '' }` } title={ app.active ? key : `${ key } - coming soon` } onClick={ event => onTileTap(key) } onPointerDown={ event => onTileDown(event, key) } onPointerMove={ onTileMove } onPointerUp={ onTileUp } onPointerCancel={ onTileUp }>
                <div className="phone-app-tile">
                    <PhoneIcon icon={ app.icon } size={ 26 } />
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
        <div ref={ homeRef } className="phone-screen phone-home">
            <div className="phone-home-wallpaper" />
            <div className="phone-home-shade" />
            <div className="phone-home-grid">
                { gridOrder.map(key => appTile(key, 'grid', true)) }
            </div>
            <div ref={ dockRef } className="phone-home-dock">
                { dockOrder.map(key => appTile(key, 'dock', false)) }
            </div>
            { dragApp && ghostStyle &&
                <div className="phone-app-ghost" style={ ghostStyle }>
                    <div className="phone-app-tile">
                        <PhoneIcon icon={ (APP_DEFS[dragApp.key] ?? { icon: 'user' }).icon } size={ 26 } />
                    </div>
                </div> }
        </div>
    );
}
