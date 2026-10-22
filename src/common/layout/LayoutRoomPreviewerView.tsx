import { ColorConverter, GetTicker, IRoomEngine, IRoomRenderingCanvas, RoomPreviewer } from '@nitrots/nitro-renderer';
import { FC, MouseEvent, ReactNode, useEffect, useRef, useState } from 'react';
import { RoomPreviewPainter } from './RoomPreviewPainter';

// The RoomPreviewer state the centring reads. Private in the renderer, so it is
// reached through a cast - as the resize fix below already does.
interface PreviewerInternals
{
    _roomEngine: IRoomEngine;
    _previewRoomId: number;
    _currentPreviewObjectCategory: number;
    _currentPreviewCanvasWidth: number;
    _currentPreviewCanvasHeight: number;
    _currentPreviewRectangle: ReturnType<IRoomEngine['getRoomObjectBoundingRectangle']>;
    updatePreviewObjectBoundingRectangle(point: { x: number; y: number }): void;
}

const centredPreviewers = new WeakSet<RoomPreviewer>();

/**
 * pixelrp: centre the preview on everything the item has drawn since it
 * appeared.
 *
 * The renderer measures the item once, the frame it appears, and afterwards
 * takes a bigger measurement only when it outgrows the first by more than half
 * the space left in the canvas. A first measurement taken before every layer
 * was drawn - one half of a two-tile sink - stayed, and in the shop's narrow
 * canvas the rest never counted as enough, so the item sat off to one side
 * with an edge cut away. It happened only sometimes because it depended on
 * what had been drawn by the frame of that first look.
 *
 * Here every frame's bounds are added to the rectangle instead. It only ever
 * grows, so it settles at once and an animated item does not make the view
 * wander. The renderer still clears it for a new item, a content load, a
 * scale change, and the resize below.
 */
const CentreOnWholeItem = (roomPreviewer: RoomPreviewer) =>
{
    if(!roomPreviewer || centredPreviewers.has(roomPreviewer)) return;

    centredPreviewers.add(roomPreviewer);

    const previewer = (roomPreviewer as unknown as PreviewerInternals);

    previewer.updatePreviewObjectBoundingRectangle = point =>
    {
        const bounds = previewer._roomEngine?.getRoomObjectBoundingRectangle(previewer._previewRoomId,
            RoomPreviewer.PREVIEW_OBJECT_ID, previewer._currentPreviewObjectCategory, RoomPreviewer.PREVIEW_CANVAS_ID);

        // Nothing drawn yet says nothing about where the item is.
        if(!bounds || !point || (bounds.width < 1) || (bounds.height < 1)) return;

        bounds.x -= ((previewer._currentPreviewCanvasWidth >> 1) + point.x);
        bounds.y -= ((previewer._currentPreviewCanvasHeight >> 1) + point.y);

        const current = previewer._currentPreviewRectangle;

        previewer._currentPreviewRectangle = (current && (current.width >= 1) && (current.height >= 1))
            ? current.clone().enlarge(bounds)
            : bounds;
    };
}

interface PlainSprite
{
    texture?: unknown;
    tint?: number;
    width: number;
    height: number;
    destroy(): void;
}

/**
 * pixelrp: one plain background behind the preview, not one per box.
 *
 * Every preview box asks the previewer for its canvas when it appears. The
 * previewer has the one canvas and hands back the same one, but it lays a
 * fresh background under it every time and never keeps hold of the last, so
 * they pile up - each at the width its box had then. The picture is cut from
 * the canvas's whole bounds, so one left over from a wider box made it wider
 * than the box; centred in the box, the room slid to the left and a bare strip
 * showed on the right, past the masked edge of the room.
 *
 * The newest is the first child. Only a tinted sprite is that background - a
 * container there would be the room itself, which must never be stretched -
 * and any other child drawn with its plain texture is an older one.
 */
const KeepOneBackground = (canvas: IRoomRenderingCanvas): PlainSprite =>
{
    const master = (canvas?.master as unknown as { children?: PlainSprite[], removeChild(child: PlainSprite): void });
    const background = master?.children?.[0];

    if(!background || (background.tint === undefined)) return null;

    for(const child of master.children.slice(1))
    {
        if(child.texture !== background.texture) continue;

        master.removeChild(child);
        child.destroy();
    }

    return background;
}

export interface LayoutRoomPreviewerViewProps
{
    roomPreviewer: RoomPreviewer;
    height?: number;
    children?: ReactNode;
}

export const LayoutRoomPreviewerView: FC<LayoutRoomPreviewerViewProps> = props =>
{
    const { roomPreviewer = null, height = 0, children = null } = props;
    const [ renderingCanvas, setRenderingCanvas ] = useState<IRoomRenderingCanvas>(null);
    const elementRef = useRef<HTMLDivElement>();
    const canvasRef = useRef<HTMLCanvasElement>();
    const painterRef = useRef<RoomPreviewPainter>(null);

    // pixelrp: the picture goes into a <canvas> in the box, drawn only when it
    // changed - not a PNG screenshot as a background on every animation tick
    // (RoomPreviewPainter).
    const getPainter = () =>
    {
        if(!painterRef.current && canvasRef.current) painterRef.current = new RoomPreviewPainter(canvasRef.current);

        return painterRef.current;
    }

    useEffect(() =>
    {
        return () =>
        {
            if(painterRef.current) painterRef.current.dispose();

            painterRef.current = null;
        }
    }, []);

    const onClick = (event: MouseEvent<HTMLDivElement>) =>
    {
        if(!roomPreviewer) return;

        if(event.shiftKey) roomPreviewer.changeRoomObjectDirection();
        else roomPreviewer.changeRoomObjectState();
    }

    useEffect(() =>
    {
        if(!roomPreviewer) return;

        CentreOnWholeItem(roomPreviewer);

        const update = (time: number) =>
        {
            if(!roomPreviewer || !renderingCanvas || !elementRef.current) return;
        
            roomPreviewer.updatePreviewRoomView();

            const painter = getPainter();

            if(painter) painter.update(renderingCanvas.master, renderingCanvas.canvasUpdated, (time === -1));
        }

        if(!renderingCanvas)
        {
            if(elementRef.current && roomPreviewer)
            {
                const computed = document.defaultView.getComputedStyle(elementRef.current, null);

                let backgroundColor = computed.backgroundColor;

                backgroundColor = ColorConverter.rgbStringToHex(backgroundColor);
                backgroundColor = backgroundColor.replace('#', '0x');

                roomPreviewer.backgroundColor = parseInt(backgroundColor, 16);

                const width = elementRef.current.parentElement.clientWidth;
                
                roomPreviewer.getRoomCanvas(width, height);

                const canvas = roomPreviewer.getRenderingCanvas();

                KeepOneBackground(canvas);

                setRenderingCanvas(canvas);

                canvas.canvasUpdated = true;

                update(-1);
            }
        }

        GetTicker().add(update);

        const resizeObserver = new ResizeObserver(() =>
        {
            if(!roomPreviewer || !elementRef.current) return;

            const width = elementRef.current.parentElement.offsetWidth;

            roomPreviewer.modifyRoomCanvas(width, height);

            // pixelrp: the plain background behind the room is the canvas's
            // first child, sized once when the canvas was made. modifyRoomCanvas
            // means to resize it, but the previewer never kept hold of it
            // (its _backgroundSprite is never assigned), so it stayed at the
            // first width. The picture is cut from the canvas's whole bounds,
            // so after the window narrowed it came out at the OLD width, was
            // cropped from the middle, and the furni sat off to the left.
            const background = KeepOneBackground(roomPreviewer.getRenderingCanvas());

            if(background)
            {
                background.width = width;
                background.height = height;
            }

            // pixelrp: the previewer centres on the item's bounds, measured
            // against the canvas width they were taken at, and keeps them
            // until the item changes - so a window made narrower went on
            // centring for the old width and the item slid to the left edge.
            // Forgetting them makes the next frame measure and centre afresh
            // (the renderer does the same itself when its scale changes).
            (roomPreviewer as unknown as { _currentPreviewRectangle: unknown })._currentPreviewRectangle = null;

            update(-1);

            getPainter()?.place();
        });
        
        resizeObserver.observe(elementRef.current);

        return () =>
        {
            resizeObserver.disconnect();

            GetTicker().remove(update);
        }

    }, [ renderingCanvas, roomPreviewer, elementRef, height ]);

    return (
        <div className="room-preview-container">
            <div ref={ elementRef } className="room-preview-image" style={ { height } } onClick={ onClick }>
                <canvas ref={ canvasRef } className="room-preview-canvas" />
            </div>
            { children }
        </div>
    );
}
