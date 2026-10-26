import { FixedSizeStack, GetTicker, NitroPoint, NitroRectangle, RoomObjectType } from '@nitrots/nitro-renderer';
import { CSSProperties, FC, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GetNitroInstance, GetRoomObjectBounds, GetRoomObjectScreenLocation, GetRoomSession } from '../../../../api';
import { Base, BaseProps } from '../../../../common';
import { ContextMenuCaretView } from './ContextMenuCaretView';

// The player and bot menus (another player, your own avatar, a bot) take this
// class for their dark window look and pixel arrows (ContextMenu.scss); furni
// and pet menus do not. One shared array, so the class list memo is not
// rebuilt every render.
export const AVATAR_MENU_CLASSES = [ 'avatar-menu' ];

interface ContextMenuViewProps extends BaseProps<HTMLDivElement>
{
    objectId: number;
    category: number;
    userType?: number;
    fades?: boolean;
    onClose: () => void;
    collapsable?: boolean;
    /** Moved down by this share of the object's on-screen height (0.1 = 10%), so it keeps its place at any zoom. */
    drop?: number;
}

const LOCATION_STACK_SIZE: number = 25;
const BUBBLE_DROP_SPEED: number = 3;
const FADE_DELAY = 5000;
const FADE_LENGTH = 75;
const SPACE_AROUND_EDGES = 10;

let COLLAPSED = false;

export const ContextMenuView: FC<ContextMenuViewProps> = props =>
{
    const { objectId = -1, category = -1, userType = -1, fades = false, onClose = null, position = 'absolute', classNames = [], style = {}, children = null, collapsable = false, drop = 0, ...rest } = props;
    // pixelrp: whether it has a place yet (visible / invisible). The place itself
    // is not React state - see placeAt.
    const [ placed, setPlaced ] = useState(false);
    const [ isFading, setIsFading ] = useState(false);
    const [ isCollapsed, setIsCollapsed ] = useState(COLLAPSED);
    const elementRef = useRef<HTMLDivElement>();
    // pixelrp: each menu keeps its own height history and fade clock. They
    // were module-wide, so several tags at once (the green friend tags on
    // room load) shared one: every tag sat at the TALLEST avatar's height
    // rather than its own, each new menu reset the others', and N fading
    // tags faded N times as fast.
    const stackRef = useRef<FixedSizeStack>(null);
    const maxStackRef = useRef<number>(-1000000);
    const fadeTimeRef = useRef<number>(1);

    if(!stackRef.current) stackRef.current = new FixedSizeStack(LOCATION_STACK_SIZE);

    // pixelrp (Twist, 2026-10-27 - a Chrome recording in the Courthouse): every
    // open menu and name tag follows its avatar on every game frame. It moved
    // by its left and top, which made Chrome lay out and repaint the whole
    // page each frame, re-rendered the menu through React, and read its size
    // each frame, which forced a layout whenever anything else had moved. Now
    // the place goes straight onto the element as a transform, only when it
    // changes - no layout and no React render - and the size is kept by a
    // ResizeObserver. Not on a layer of its own (no will-change): Chrome on
    // Windows would draw the text on a see-through layer without ClearType.
    const placeRef = useRef<{ x: number, y: number }>({ x: null, y: null });
    const sizeRef = useRef<{ width: number, height: number }>(null);

    const sizeOf = (element: HTMLDivElement) => (sizeRef.current ?? { width: element.offsetWidth, height: element.offsetHeight });

    useEffect(() =>
    {
        const element = elementRef.current;

        if(!element || (typeof ResizeObserver === 'undefined')) return;

        const measure = () =>
        {
            sizeRef.current = { width: element.offsetWidth, height: element.offsetHeight };
        };

        measure();

        const observer = new ResizeObserver(measure);

        observer.observe(element);

        return () =>
        {
            observer.disconnect();
            sizeRef.current = null;
        };
    }, []);

    const placeAt = useCallback((x: number, y: number) =>
    {
        const element = elementRef.current;
        const place = placeRef.current;

        if(!element || ((place.x === x) && (place.y === y))) return;

        place.x = x;
        place.y = y;
        element.style.transform = `translate(${ x }px, ${ y }px)`;

        if(!placed) setPlaced(true);
    }, [ placed ]);

    const updateFade = useCallback((time: number) =>
    {
        if(!isFading) return;

        fadeTimeRef.current += time;

        let newOpacity = ((1 - (fadeTimeRef.current / FADE_LENGTH)) * 1);

        if(newOpacity <= 0)
        {
            onClose();

            return false;
        }

        if(elementRef.current) elementRef.current.style.opacity = String(newOpacity);
    }, [ isFading, onClose ]);

    const updatePosition = useCallback((bounds: NitroRectangle, location: NitroPoint) =>
    {
        if(!bounds || !location) return;

        const size = sizeOf(elementRef.current);

        let offset = -(size.height);

        if((userType > -1) && ((userType === RoomObjectType.USER) || (userType === RoomObjectType.BOT) || (userType === RoomObjectType.RENTABLE_BOT)))
        {
            offset = (offset + ((bounds.height > 50) ? 15 : 0));
        }
        else
        {
            offset = (offset - 14);
        }

        if(drop) offset = (offset + Math.round(bounds.height * drop));

        stackRef.current.addValue((location.y - bounds.top));

        let maxStack = stackRef.current.getMax();

        if(maxStack < (maxStackRef.current - BUBBLE_DROP_SPEED)) maxStack = (maxStackRef.current - BUBBLE_DROP_SPEED);

        maxStackRef.current = maxStack;

        const deltaY = (location.y - maxStack);

        let x = ~~(location.x - (size.width / 2));
        let y = ~~(deltaY + offset);

        const maxLeft = ((GetNitroInstance().width - size.width) - SPACE_AROUND_EDGES);
        const maxTop = ((GetNitroInstance().height - size.height) - SPACE_AROUND_EDGES);

        if(x < SPACE_AROUND_EDGES) x = SPACE_AROUND_EDGES;
        else if(x > maxLeft) x = maxLeft;

        if(y < SPACE_AROUND_EDGES) y = SPACE_AROUND_EDGES;
        else if(y > maxTop) y = maxTop;

        placeAt(x, y);
    }, [ userType, drop, placeAt ]);

    const getClassNames = useMemo(() =>
    {
        const newClassNames: string[] = [ 'nitro-context-menu' ];

        if (isCollapsed) newClassNames.push('menu-hidden');

        newClassNames.push(placed ? 'visible' : 'invisible');

        if(classNames.length) newClassNames.push(...classNames);

        return newClassNames;
    }, [ placed, classNames, isCollapsed ]);

    // at 0, 0 - the place is the transform placeAt sets
    const getStyle = useMemo(() =>
    {
        let newStyle: CSSProperties = { left: 0, top: 0 };

        if(Object.keys(style).length) newStyle = { ...newStyle, ...style };

        return newStyle;
    }, [ style ]);

    useEffect(() =>
    {
        if(!elementRef.current) return;
        
        const update = (time: number) =>
        {
            if(!elementRef.current) return;

            updateFade(time);

            const bounds = GetRoomObjectBounds(GetRoomSession().roomId, objectId, category);
            const location = GetRoomObjectScreenLocation(GetRoomSession().roomId, objectId, category);

            updatePosition(bounds, location);
        }

        GetTicker().add(update);

        return () =>
        {
            GetTicker().remove(update);
        }
    }, [ objectId, category, updateFade, updatePosition ]);

    useEffect(() =>
    {
        if(!fades) return;

        const timeout = setTimeout(() => setIsFading(true), FADE_DELAY);

        return () => clearTimeout(timeout);
    }, [ fades ]);

    useEffect(() =>
    {
        COLLAPSED = isCollapsed;
    }, [ isCollapsed ]);

    // pixelrp: hidden by this menu's own state, not the shared COLLAPSED (which
    // only seeds the next menu). COLLAPSED is set in an effect, after the
    // render that read it, and a menu that stands still no longer re-renders
    // every frame - so the arrow flipped the caret and left the menu open
    // (Twist, 2026-10-24).
    return <Base innerRef={ elementRef } position={ position } classNames={ getClassNames } style={ getStyle } { ...rest }>
        { !(collapsable && isCollapsed) && children }
        { collapsable && <ContextMenuCaretView onClick={ () => setIsCollapsed(!isCollapsed) } collapsed={ isCollapsed } pixel={ classNames.includes(AVATAR_MENU_CLASSES[0]) } /> }
    </Base>;
}
