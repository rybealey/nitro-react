import { NitroRenderTexture, TextureUtils } from '@nitrots/nitro-renderer';
import type { Renderer, RenderTexture } from '@pixi/core';
import type { Container, DisplayObject } from '@pixi/display';
import { Matrix } from '@pixi/math';

/**
 * pixelrp: puts a room previewer's picture - the furni, bot or pet in the
 * shop and the backpack - into a <canvas> in its box.
 *
 * The box used to show it as a CSS background image. Every time the preview
 * counted as updated - each animation tick, about 24 times a second, whether
 * the furni moved or not - the renderer drew it into a new texture, read that
 * back from the GPU (the browser waits for everything already queued there),
 * packed it into a PNG and handed the browser a data: URL to unpack again.
 * With a preview open the whole game stuttered, an animated one worst.
 *
 * Now the picture is drawn only when what it is made of changed - and every
 * half second besides, for pictures redrawn in place, like a bot's - into
 * one texture kept for it. On WebGL 2 the GPU copies it into a buffer and it
 * is picked up a frame or so later, without waiting; on WebGL 1 it is read
 * back at once, still with no PNG. Either way it goes straight into the
 * canvas, pixel for pixel what the background showed.
 */
export class RoomPreviewPainter
{
    private static REDRAW_ANYWAY_MS: number = 500;
    // a copy still not back after this is read the old way, at once; after a
    // few of those this preview stops copying in the background, so a driver
    // that never reports one done cannot freeze the picture
    private static COPY_GIVE_UP_MS: number = 250;
    private static SLOW_COPIES_ALLOWED: number = 3;

    private _canvas: HTMLCanvasElement;
    private _context: CanvasRenderingContext2D;
    private _texture: RenderTexture = null;
    private _matrix: Matrix = new Matrix();
    private _signature: unknown[] = [];
    private _nextSignature: unknown[] = [];
    private _drawnAt: number = -Infinity;
    private _dirty: boolean = false;

    private _gl: WebGL2RenderingContext = null;
    private _buffer: WebGLBuffer = null;
    private _bufferSize: number = 0;
    private _sync: WebGLSync = null;
    private _pendingWidth: number = 0;
    private _pendingHeight: number = 0;
    private _pixels: Uint8Array = null;
    private _copyStartedAt: number = 0;
    private _slowCopies: number = 0;

    constructor(canvas: HTMLCanvasElement)
    {
        this._canvas = canvas;
        this._context = canvas.getContext('2d');
    }

    /**
     * Every frame. changed: the preview canvas counts as updated this frame.
     * force: draw whatever the picture is made of (a new item, a resize).
     */
    public update(master: DisplayObject, changed: boolean, force: boolean = false): void
    {
        this.collect();

        if(!master || !this._context) return;

        if(this._dirty && !this._sync) force = true;

        if(!changed && !force) return;

        const now = performance.now();

        this._nextSignature.length = 0;

        RoomPreviewPainter.describe(master, this._nextSignature);

        const same = RoomPreviewPainter.sameList(this._signature, this._nextSignature);

        if(!force && same && ((now - this._drawnAt) < RoomPreviewPainter.REDRAW_ANYWAY_MS)) return;

        // one copy on its way at a time; the newest picture goes once it lands
        if(this._sync)
        {
            this._dirty = true;

            return;
        }

        const swap = this._signature;

        this._signature = this._nextSignature;
        this._nextSignature = swap;
        this._drawnAt = now;
        this._dirty = false;

        this.draw(master);
    }

    /** Keeps the picture centred in the box, as the background was. */
    public place(): void
    {
        const box = this._canvas.parentElement;

        if(!box) return;

        this._canvas.style.left = `${ Math.floor((box.clientWidth - this._canvas.width) / 2) }px`;
        this._canvas.style.top = `${ Math.floor((box.clientHeight - this._canvas.height) / 2) }px`;
    }

    public dispose(): void
    {
        this.forgetCopy();

        if(this._texture)
        {
            this._texture.destroy(true);

            this._texture = null;
        }

        this._context = null;
    }

    private draw(master: DisplayObject): void
    {
        const renderer = (TextureUtils.getRenderer() as Renderer);

        if(!renderer) return;

        // the region and the drawing are the ones generateTexture used
        const bounds = (master as Container).getLocalBounds(null, true);
        const width = Math.max(1, Math.round(bounds.width));
        const height = Math.max(1, Math.round(bounds.height));

        if(!this._texture || (this._texture.width !== width) || (this._texture.height !== height))
        {
            if(this._texture) this._texture.destroy(true);

            this._texture = NitroRenderTexture.create({ width, height, resolution: 1 });
        }

        this._matrix.set(1, 0, 0, 1, -bounds.x, -bounds.y);

        renderer.render(master, { renderTexture: this._texture, clear: true, transform: this._matrix, skipUpdateTransform: !!master.parent });

        const gl = renderer.gl;

        const background = ((this._slowCopies < RoomPreviewPainter.SLOW_COPIES_ALLOWED) && (typeof WebGL2RenderingContext !== 'undefined') && (gl instanceof WebGL2RenderingContext));

        if(background && this.startCopy(renderer, gl, width, height)) return;

        const pixels = TextureUtils.getPixels(this._texture);

        if(pixels) this.paint(pixels, width, height);
    }

    private startCopy(renderer: Renderer, gl: WebGL2RenderingContext, width: number, height: number): boolean
    {
        try
        {
            if(gl.isContextLost()) return false;

            if(this._gl !== gl)
            {
                this.forgetCopy();

                this._gl = gl;
            }

            const size = (width * height * 4);

            if(!this._buffer)
            {
                this._buffer = gl.createBuffer();
                this._bufferSize = 0;
            }

            renderer.renderTexture.bind(this._texture);

            gl.bindBuffer(gl.PIXEL_PACK_BUFFER, this._buffer);

            if(this._bufferSize !== size)
            {
                gl.bufferData(gl.PIXEL_PACK_BUFFER, size, gl.STREAM_READ);

                this._bufferSize = size;
            }

            gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, 0);
            gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);

            this._sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
            this._pendingWidth = width;
            this._pendingHeight = height;
            this._copyStartedAt = performance.now();

            gl.flush();

            return !!this._sync;
        }
        catch(error)
        {
            this.forgetCopy();

            return false;
        }
    }

    // a copy that has landed goes into the canvas
    private collect(): void
    {
        const gl = this._gl;

        if(!this._sync || !gl) return;

        try
        {
            if(gl.isContextLost())
            {
                this.forgetCopy();
                this._dirty = true;

                return;
            }

            if(gl.getSyncParameter(this._sync, gl.SYNC_STATUS) !== gl.SIGNALED)
            {
                if((performance.now() - this._copyStartedAt) < RoomPreviewPainter.COPY_GIVE_UP_MS) return;

                // the texture still holds that picture: nothing is drawn
                // into it while a copy is on its way
                gl.deleteSync(this._sync);
                this._sync = null;
                this._slowCopies++;

                const pixels = TextureUtils.getPixels(this._texture);

                if(pixels) this.paint(pixels, this._pendingWidth, this._pendingHeight);

                return;
            }

            gl.deleteSync(this._sync);
            this._sync = null;

            const size = (this._pendingWidth * this._pendingHeight * 4);

            if(!this._pixels || (this._pixels.length !== size)) this._pixels = new Uint8Array(size);

            gl.bindBuffer(gl.PIXEL_PACK_BUFFER, this._buffer);
            gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, this._pixels);
            gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);

            RoomPreviewPainter.unpremultiply(this._pixels);

            this.paint(this._pixels, this._pendingWidth, this._pendingHeight);
        }
        catch(error)
        {
            this.forgetCopy();
            this._dirty = true;
        }
    }

    private paint(pixels: Uint8Array, width: number, height: number): void
    {
        if(!this._context) return;

        if((this._canvas.width !== width) || (this._canvas.height !== height))
        {
            this._canvas.width = width;
            this._canvas.height = height;
            this._canvas.style.width = `${ width }px`;
            this._canvas.style.height = `${ height }px`;

            this.place();
        }

        this._context.putImageData(new ImageData(new Uint8ClampedArray(pixels.buffer, pixels.byteOffset, (width * height * 4)), width, height), 0, 0);
    }

    private forgetCopy(): void
    {
        const gl = this._gl;

        try
        {
            if(gl && !gl.isContextLost())
            {
                if(this._sync) gl.deleteSync(this._sync);
                if(this._buffer) gl.deleteBuffer(this._buffer);
            }
        }
        catch(error)
        {
            // the context is gone with them
        }

        this._sync = null;
        this._buffer = null;
        this._bufferSize = 0;
        this._gl = null;
    }

    // what the picture is made of: each piece's picture, place, size and look
    private static describe(node: DisplayObject, out: unknown[]): void
    {
        // a sprite's size is its texture times its scale; a container's width
        // would measure everything in it, so it is not asked
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const item = (node as any);

        out.push(node.visible, node.renderable, node.alpha, node.x, node.y, node.scale.x, node.scale.y, node.rotation,
            item.texture, item.tint, item.blendMode, node.mask, (node.filters ? node.filters.length : 0));

        const children = (node as Container).children;

        if(!children) return;

        out.push(children.length);

        for(const child of children) RoomPreviewPainter.describe(child, out);
    }

    private static sameList(a: unknown[], b: unknown[]): boolean
    {
        if(a.length !== b.length) return false;

        for(let i = 0; i < a.length; i++)
        {
            if(a[i] !== b[i]) return false;
        }

        return true;
    }

    // the GPU keeps colours multiplied by their alpha; a canvas wants them plain
    private static unpremultiply(pixels: Uint8Array): void
    {
        for(let i = 0; i < pixels.length; i += 4)
        {
            const alpha = pixels[i + 3];

            if((alpha === 255) || (alpha === 0)) continue;

            pixels[i] = Math.round(Math.min((255 * pixels[i]) / alpha, 255));
            pixels[i + 1] = Math.round(Math.min((255 * pixels[i + 1]) / alpha, 255));
            pixels[i + 2] = Math.round(Math.min((255 * pixels[i + 2]) / alpha, 255));
        }
    }
}
