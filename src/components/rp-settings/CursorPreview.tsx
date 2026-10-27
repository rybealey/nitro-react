import { NitroSprite, TextureUtils } from '@nitrots/nitro-renderer';
import { FC, useEffect, useRef } from 'react';
import { GetRoomEngine } from '../../api';
import { CursorAssetName, CursorStyle, DEFAULT_CURSOR_STYLE } from '../../api/prefs/CursorStore';

// Settings > UI > Cursor: one style on a patch of floor, drawn from the game's
// own cursor art (tile_cursor.nitro) in the player's colour. The colour is
// multiplied into each pixel and its alpha left alone, as the renderer tints
// the cursor, so a dark shade stays dark.

const WIDTH = 72;
const HEIGHT = 42;
// The middle tile's centre - Classic (66x36, registered 32,19) fits around it.
const CENTRE_X = 36;
const CENTRE_Y = 21;
// Floor 111, the redesign canvas's khaki, with its tile lines (x 0.933).
const FLOOR = '#999966';
const FLOOR_LINE = '#8f8f5f';

// Each frame read out of the sheet once: its pixels and where it sits.
const frames = new Map<string, { pixels: ImageData, x: number, y: number }>();

const readFrame = (name: string): { pixels: ImageData, x: number, y: number } =>
{
    if(frames.has(name)) return frames.get(name);

    // Where the room's cursor reads it from (the room loader, then the global assets).
    const collection = GetRoomEngine()?.roomContentLoader?.getCollection('tile_cursor');
    // A bundle cached from before a style existed shows the default, as in the room.
    const asset = (collection?.getAsset(name) ?? collection?.getAsset(CursorAssetName(DEFAULT_CURSOR_STYLE)));

    if(!asset?.texture) return null;

    const canvas = document.createElement('canvas');

    canvas.width = asset.width;
    canvas.height = asset.height;

    const context = canvas.getContext('2d');

    context.drawImage(TextureUtils.generateCanvas(new NitroSprite(asset.texture)), 0, 0, asset.width, asset.height);

    const frame = { pixels: context.getImageData(0, 0, asset.width, asset.height), x: asset.offsetX, y: asset.offsetY };

    frames.set(name, frame);

    return frame;
}

const drawFloor = (context: CanvasRenderingContext2D) =>
{
    context.fillStyle = FLOOR;
    context.fillRect(0, 0, WIDTH, HEIGHT);
    context.fillStyle = FLOOR_LINE;

    // Each tile's two top edges, as the floor texture draws them.
    for(let i = -2; i <= 2; i++)
    {
        for(let j = -2; j <= 2; j++)
        {
            const x = (CENTRE_X + (32 * (i - j)));
            const top = (CENTRE_Y + (16 * (i + j)) - 16);

            for(let row = 0; row < 16; row++)
            {
                const half = (2 * (row + 1));

                context.fillRect((x - half), (top + row), 2, 1);
                context.fillRect((x + half - 2), (top + row), 2, 1);
            }
        }
    }
}

export const CursorPreview: FC<{ cursorStyle: CursorStyle, colour: string }> = props =>
{
    const { cursorStyle = DEFAULT_CURSOR_STYLE, colour = '#ffffff' } = props;
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() =>
    {
        const context = canvasRef.current?.getContext('2d');

        if(!context) return;

        drawFloor(context);

        const frame = readFrame(CursorAssetName(cursorStyle));

        if(!frame) return;

        const tint = [ 1, 3, 5 ].map(at => (parseInt(colour.slice(at, (at + 2)), 16) / 255));
        const pixels = new ImageData(new Uint8ClampedArray(frame.pixels.data), frame.pixels.width, frame.pixels.height);

        for(let i = 0; i < pixels.data.length; i += 4)
        {
            pixels.data[i] *= tint[0];
            pixels.data[i + 1] *= tint[1];
            pixels.data[i + 2] *= tint[2];
        }

        // putImageData replaces pixels outright, so the cursor is laid over
        // the floor from a canvas of its own.
        const sprite = document.createElement('canvas');

        sprite.width = pixels.width;
        sprite.height = pixels.height;
        sprite.getContext('2d').putImageData(pixels, 0, 0);

        context.drawImage(sprite, (CENTRE_X + frame.x), (CENTRE_Y + frame.y));
    }, [ cursorStyle, colour ]);

    return <canvas ref={ canvasRef } className="rp-settings-cursor-preview" width={ WIDTH } height={ HEIGHT } aria-hidden="true" />;
}
