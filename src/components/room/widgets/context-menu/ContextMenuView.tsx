import { FixedSizeStack, GetTicker, NitroPoint, NitroRectangle, RoomObjectType } from '@nitrots/nitro-renderer';
import { CSSProperties, FC, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GetNitroInstance, GetRoomObjectBounds, GetRoomObjectScreenLocation, GetRoomSession } from '../../../../api';
import { Base, BaseProps } from '../../../../common';
import { ContextMenuCaretView } from './ContextMenuCaretView';

// The player menus (another player and your own avatar) take this class for
// their compact look (ContextMenu.scss); furni, pet and bot menus do not.
// One shared array, so the class list memo is not rebuilt every render.
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
    const [ pos, setPos ] = useState<{ x: number, y: number }>({ x: null, y: null });
    const [ opacity, setOpacity ] = useState(1);
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

        setOpacity(newOpacity);
    }, [ isFading, onClose ]);

    const updatePosition = useCallback((bounds: NitroRectangle, location: NitroPoint) =>
    {
        if(!bounds || !location) return;

        let offset = -(elementRef.current.offsetHeight);

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

        let x = ~~(location.x - (elementRef.current.offsetWidth / 2));
        let y = ~~(deltaY + offset);

        const maxLeft = ((GetNitroInstance().width - elementRef.current.offsetWidth) - SPACE_AROUND_EDGES);
        const maxTop = ((GetNitroInstance().height - elementRef.current.offsetHeight) - SPACE_AROUND_EDGES);

        if(x < SPACE_AROUND_EDGES) x = SPACE_AROUND_EDGES;
        else if(x > maxLeft) x = maxLeft;

        if(y < SPACE_AROUND_EDGES) y = SPACE_AROUND_EDGES;
        else if(y > maxTop) y = maxTop;

        // pixelrp: this runs every frame for every open menu and name tag. A
        // new object each time re-rendered the menu and dirtied the layout even
        // when it hadn't moved; now an unchanged position changes nothing.
        setPos(prev => (((prev.x === x) && (prev.y === y)) ? prev : { x, y }));
    }, [ userType, drop ]);

    const getClassNames = useMemo(() =>
    {
        const newClassNames: string[] = [ 'nitro-context-menu' ];
        
        if (isCollapsed) newClassNames.push('menu-hidden');

        newClassNames.push((pos.x !== null) ? 'visible' : 'invisible');

        if(classNames.length) newClassNames.push(...classNames);

        return newClassNames;
    }, [ pos, classNames, isCollapsed ]);

    const getStyle = useMemo(() =>
    {
        let newStyle: CSSProperties = {};

        newStyle.left = (pos.x || 0);
        newStyle.top = (pos.y || 0);
        newStyle.opacity = opacity;

        if(Object.keys(style).length) newStyle = { ...newStyle, ...style };

        return newStyle;
    }, [ pos, opacity, style ]);

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

    return <Base innerRef={ elementRef } position={ position } classNames={ getClassNames } style={ getStyle } { ...rest }>
        { !(collapsable && COLLAPSED) && children }
        { collapsable && <ContextMenuCaretView onClick={ () => setIsCollapsed(!isCollapsed) } collapsed={ isCollapsed } /> }
    </Base>;
}
