import { TextureUtils } from '@nitrots/nitro-renderer';
import type { Renderer, RenderTexture } from '@pixi/core';

/**
 * pixelrp: a render texture's picture as a PNG data URL, read back from the
 * graphics card without waiting for it.
 *
 * TextureUtils.generateImageUrl reads it straight away, and the browser first
 * waits for every draw already queued for the graphics card - about 50 ms for
 * a chat head on a busy machine (the lag recorder, 2026-10-26). Here the copy
 * is queued behind those draws (WebGL2: readPixels into a buffer, and a fence)
 * and collected a frame or two later, when it has landed - the same way the
 * shop previews are read (RoomPreviewPainter). The PNG is the same one
 * generateImageUrl makes: the same pixels, made plain the same way as Pixi's
 * Extract, on a canvas the same size.
 *
 * WebGL1, or a copy that fails to start, reads it straight away as before. A
 * copy not back after GIVE_UP_MS is read then, waiting for it. The caller
 * keeps the texture until this settles, and destroys it.
 */
const POLL_MS = 16;
const GIVE_UP_MS = 250;

// Extract.arrayPostDivide: the GPU keeps colours multiplied by their alpha
const plain = (pixels: Uint8Array, out: Uint8ClampedArray): void =>
{
    for(let i = 0; i < pixels.length; i += 4)
    {
        const alpha = out[i + 3] = pixels[i + 3];

        if(alpha !== 0)
        {
            out[i] = Math.round(Math.min(pixels[i] * 255.0 / alpha, 255.0));
            out[i + 1] = Math.round(Math.min(pixels[i + 1] * 255.0 / alpha, 255.0));
            out[i + 2] = Math.round(Math.min(pixels[i + 2] * 255.0 / alpha, 255.0));
        }
        else
        {
            out[i] = pixels[i];
            out[i + 1] = pixels[i + 1];
            out[i + 2] = pixels[i + 2];
        }
    }
}

const toPng = (pixels: Uint8Array, width: number, height: number): string =>
{
    const canvas = document.createElement('canvas');

    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext('2d');

    if(!context) return null;

    const imageData = context.getImageData(0, 0, width, height);

    plain(pixels, imageData.data);

    context.putImageData(imageData, 0, 0);

    return canvas.toDataURL('image/png');
}

export const ReadTextureImageAsync = (texture: RenderTexture): Promise<string> =>
{
    if(!texture) return Promise.resolve(null);

    const readNow = (): string =>
    {
        try
        {
            return TextureUtils.generateImageUrl(texture);
        }
        catch(error)
        {
            return null;
        }
    };

    const renderer = (TextureUtils.getRenderer() as Renderer);
    const gl = renderer?.gl;

    if(!gl || (typeof WebGL2RenderingContext === 'undefined') || !(gl instanceof WebGL2RenderingContext)) return Promise.resolve(readNow());

    const resolution = texture.baseTexture.resolution;
    const frame = texture.frame;
    const width = Math.round(frame.width * resolution);
    const height = Math.round(frame.height * resolution);

    let buffer: WebGLBuffer = null;
    let sync: WebGLSync = null;

    const forget = () =>
    {
        try
        {
            if(!gl.isContextLost())
            {
                if(sync) gl.deleteSync(sync);
                if(buffer) gl.deleteBuffer(buffer);
            }
        }
        catch(error)
        {
            // the context is gone with them
        }

        sync = null;
        buffer = null;
    };

    try
    {
        if(gl.isContextLost() || (width < 1) || (height < 1)) return Promise.resolve(null);

        renderer.renderTexture.bind(texture);

        buffer = gl.createBuffer();

        gl.bindBuffer(gl.PIXEL_PACK_BUFFER, buffer);
        gl.bufferData(gl.PIXEL_PACK_BUFFER, (width * height * 4), gl.STREAM_READ);
        gl.readPixels(Math.round(frame.x * resolution), Math.round(frame.y * resolution), width, height, gl.RGBA, gl.UNSIGNED_BYTE, 0);
        gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);

        sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);

        gl.flush();

        if(!sync) throw new Error('no fence');
    }
    catch(error)
    {
        forget();

        return Promise.resolve(readNow());
    }

    const startedAt = performance.now();

    return new Promise<string>(resolve =>
    {
        const collect = () =>
        {
            try
            {
                if(gl.isContextLost())
                {
                    forget();
                    resolve(null);

                    return;
                }

                if((gl.getSyncParameter(sync, gl.SYNC_STATUS) !== gl.SIGNALED) && ((performance.now() - startedAt) < GIVE_UP_MS))
                {
                    window.setTimeout(collect, POLL_MS);

                    return;
                }

                // landed - or waited long enough, and read now, waiting for it
                const pixels = new Uint8Array(width * height * 4);

                gl.bindBuffer(gl.PIXEL_PACK_BUFFER, buffer);
                gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, pixels);
                gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);

                forget();
                resolve(toPng(pixels, width, height));
            }
            catch(error)
            {
                forget();
                resolve(null);
            }
        };

        window.setTimeout(collect, POLL_MS);
    });
}
