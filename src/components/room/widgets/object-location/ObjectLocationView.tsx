import { GetTicker } from '@nitrots/nitro-renderer';
import { FC, useEffect, useRef, useState } from 'react';
import { GetRoomObjectBounds, GetRoomSession } from '../../../../api';
import { Base, BaseProps } from '../../../../common';

interface ObjectLocationViewProps extends BaseProps<HTMLDivElement>
{
    objectId: number;
    category: number;
    noFollow?: boolean;
}

export const ObjectLocationView: FC<ObjectLocationViewProps> = props =>
{
    const { objectId = -1, category = -1, noFollow = false, position = 'absolute', ...rest } = props;
    // pixelrp: shown once it has a place on screen. The place itself goes
    // straight onto the element as a transform, as ContextMenuView does: it
    // follows its object every frame, and moving it by left and top laid out
    // and repainted the whole page each frame and re-rendered it through React.
    const [ shown, setShown ] = useState(false);
    const elementRef = useRef<HTMLDivElement>();

    useEffect(() =>
    {
        const element = elementRef.current;

        if(!element) return;

        let remove = false;
        let size: { width: number, height: number } = null;
        let lastX: number = null;
        let lastY: number = null;

        const observer = ((typeof ResizeObserver !== 'undefined') ? new ResizeObserver(() => (size = { width: element.offsetWidth, height: element.offsetHeight })) : null);

        if(observer) observer.observe(element);

        const getObjectLocation = () =>
        {
            const roomSession = GetRoomSession();
            const objectBounds = GetRoomObjectBounds(roomSession.roomId, objectId, category, 1);

            return objectBounds;
        }

        const updatePosition = () =>
        {
            const bounds = getObjectLocation();

            if(!bounds) return;

            const width = (size ? size.width : element.offsetWidth);
            const height = (size ? size.height : element.offsetHeight);
            const x = Math.round(((bounds.left + (bounds.width / 2)) - (width / 2)));
            const y = Math.round((bounds.top - height) + 10);

            if((x === lastX) && (y === lastY)) return;

            lastX = x;
            lastY = y;
            element.style.transform = `translate(${ x }px, ${ y }px)`;

            setShown((x + width) > -1);
        }

        if(noFollow)
        {
            updatePosition();
        }
        else
        {
            remove = true;

            GetTicker().add(updatePosition);
        }

        return () =>
        {
            if(remove) GetTicker().remove(updatePosition);

            if(observer) observer.disconnect();
        }
    }, [ objectId, category, noFollow ]);

    return <Base innerRef={ elementRef } position={ position } visible={ shown } className="object-location" style={ { left: 0, top: 0 } } { ...rest } />;
}
