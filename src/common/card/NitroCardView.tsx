import { FC, MutableRefObject, PointerEvent as ReactPointerEvent, useMemo, useRef } from 'react';
import { Column, ColumnProps } from '..';
import { DraggableWindow, DraggableWindowPosition, DraggableWindowProps } from '../draggable-window';
import { NitroCardContextProvider } from './NitroCardContext';

export interface NitroCardViewProps extends DraggableWindowProps, ColumnProps
{
    theme?: string;
    // Opt-in corner grip. Off by default: most windows are sized to their
    // contents and have nothing to gain from resizing.
    resizable?: boolean;
}

// Floor used when a window declares no min-width/min-height of its own, so a
// card can never be dragged down to an unusable sliver.
const MIN_RESIZE_WIDTH: number = 240;
const MIN_RESIZE_HEIGHT: number = 180;

// Drag-to-resize grip in the bottom-right corner. Writes inline width/height
// straight onto the card. Nothing is persisted - the window unmounts when it
// closes, so it reopens at its stylesheet default.
const NitroCardResizeHandle: FC<{ targetRef: MutableRefObject<HTMLDivElement> }> = ({ targetRef }) =>
{
    const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) =>
    {
        const element = targetRef.current;

        if(!element) return;

        // the header owns dragging; the corner must not start a move too
        event.preventDefault();
        event.stopPropagation();

        const computed = window.getComputedStyle(element);
        const minWidth = (parseInt(computed.minWidth) || MIN_RESIZE_WIDTH);
        const minHeight = (parseInt(computed.minHeight) || MIN_RESIZE_HEIGHT);
        const startX = event.clientX;
        const startY = event.clientY;
        const startWidth = element.offsetWidth;
        const startHeight = element.offsetHeight;

        const onMove = (moveEvent: globalThis.PointerEvent) =>
        {
            element.style.width = `${ Math.max(minWidth, (startWidth + (moveEvent.clientX - startX))) }px`;
            element.style.height = `${ Math.max(minHeight, (startHeight + (moveEvent.clientY - startY))) }px`;
        }

        const onUp = () =>
        {
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
            window.removeEventListener('pointercancel', onUp);
        }

        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
        window.addEventListener('pointercancel', onUp);
    }

    return <div className="nitro-card-resize-handle" title="Resize" onPointerDown={ onPointerDown } />;
}

export const NitroCardView: FC<NitroCardViewProps> = props =>
{
    const { theme = 'primary', uniqueKey = null, handleSelector = '.drag-handler', windowPosition = DraggableWindowPosition.CENTER, disableDrag = false, overflow = 'hidden', position = 'relative', gap = 0, classNames = [], resizable = false, children = null, ...rest } = props;
    const elementRef = useRef<HTMLDivElement>();

    const getClassNames = useMemo(() =>
    {
        const newClassNames: string[] = [ 'nitro-card', 'rounded', 'shadow', ];

        newClassNames.push(`theme-${ theme || 'primary' }`);

        if(classNames.length) newClassNames.push(...classNames);

        return newClassNames;
    }, [ theme, classNames ]);

    /* useEffect(() =>
    {
        if(!uniqueKey || !elementRef || !elementRef.current) return;

        const localStorage = GetLocalStorage<WindowSaveOptions>(`nitro.windows.${ uniqueKey }`);
        const element = elementRef.current;

        if(localStorage && localStorage.size)
        {
            //element.style.width = `${ localStorage.size.width }px`;
            //element.style.height = `${ localStorage.size.height }px`;
        }

        const observer = new ResizeObserver(event =>
        {
            const newStorage = { ...GetLocalStorage<Partial<WindowSaveOptions>>(`nitro.windows.${ uniqueKey }`) } as WindowSaveOptions;

            newStorage.size = { width: element.offsetWidth, height: element.offsetHeight };

            SetLocalStorage<WindowSaveOptions>(`nitro.windows.${ uniqueKey }`, newStorage);
        });

        observer.observe(element);

        return () =>
        {
            observer.disconnect();
        }
    }, [ uniqueKey ]); */

    return (
        <NitroCardContextProvider value={ { theme } }>
            <DraggableWindow uniqueKey={ uniqueKey } handleSelector={ handleSelector } windowPosition={ windowPosition } disableDrag={ disableDrag }>
                <Column innerRef={ elementRef } overflow={ overflow } position={ position } gap={ gap } classNames={ getClassNames } { ...rest }>
                    { children }
                    { resizable && <NitroCardResizeHandle targetRef={ elementRef } /> }
                </Column>
            </DraggableWindow>
        </NitroCardContextProvider>
    );
}
