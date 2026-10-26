import { NitroContainer, NitroSprite, NitroTexture } from '@nitrots/nitro-renderer';
import { SCALE_MODES } from '@pixi/constants';
import type { Container } from '@pixi/display';
import { Rgb, SkyLook } from './SkyModel';

// pixelrp: the sky behind rooms, drawn in the room canvas itself (Twist,
// 2026-10-26: "lets do 2" - make the game picture solid).
//
// It was a layer of the web page under a see-through room canvas
// (EnvironmentSky.scss): every frame Chrome blended the whole game picture over
// the sky, its drifting fog and its twinkling stars before it could show it.
// Now the sky is the canvas's bottom layer and the canvas is solid (Nitro.ts,
// useContextAlpha false), so Chrome takes the game picture as it is.
//
// The same look, from the same numbers (SkyModel) and the same timings as the
// CSS it replaces, which the Settings thumbnail still uses:
// - the gradient, the horizon glow and the dark edge are painted once into one
//   picture, at half size and stretched (smooth gradients lose nothing), and
//   painted again only when the look changes - the in-game clock moves it a
//   little every few ticks;
// - the two fog bands are painted once, blurred and faded at top and bottom,
//   and only slide and fade in the frame (90 s and 120 s, there and back);
// - the stars are three pictures, one per twinkle group, at full size;
// - with fog or stars up, the dark edge is its own picture on top of them, as
//   the vignette div was;
// - a change of weather crossfades over 2 s, and the first sky fades in.
// Under reduced motion nothing moves, as before.

const SCALE = 0.5;
const FADE_MS = 2000;
const RESIZE_SETTLE_MS = 250;

const STAR_FIELD_W = 1600;
const STAR_FIELD_H = 700;

type Star = { x: number, y: number, r: number, o: number };

// CSS timing functions
const cubicBezier = (x1: number, y1: number, x2: number, y2: number) => (t: number): number =>
{
    if(t <= 0) return 0;
    if(t >= 1) return 1;

    const curve = (a: number, b: number, s: number) => (((((1 - (3 * b)) + (3 * a)) * s + ((3 * b) - (6 * a))) * s + (3 * a)) * s);

    let low = 0;
    let high = 1;
    let s = t;

    for(let i = 0; i < 24; i++)
    {
        s = ((low + high) / 2);

        if(curve(x1, x2, s) < t) low = s;
        else high = s;
    }

    return curve(y1, y2, s);
}

const ease = cubicBezier(.25, .1, .25, 1);
const easeInOut = cubicBezier(.42, 0, .58, 1);

// an `infinite alternate` animation's eased progress at elapsed ms
const alternating = (elapsed: number, duration: number): number =>
{
    const cycles = (Math.max(0, elapsed) / duration);
    const done = Math.floor(cycles);

    let progress = (cycles - done);

    if(done % 2) progress = (1 - progress);

    return easeInOut(progress);
}

const rgb = (c: Rgb): string => `rgb(${ Math.round(c[0]) }, ${ Math.round(c[1]) }, ${ Math.round(c[2]) })`;
const rgba = (c: Rgb, alpha: number): string => `rgba(${ Math.round(c[0]) }, ${ Math.round(c[1]) }, ${ Math.round(c[2]) }, ${ alpha })`;

const canvasOf = (width: number, height: number): HTMLCanvasElement =>
{
    const canvas = document.createElement('canvas');

    canvas.width = Math.max(1, Math.round(width));
    canvas.height = Math.max(1, Math.round(height));

    return canvas;
}

// .env-sky-vignette: radial-gradient(70% 70% at 50% 45%, rgba(0, 0, 0, 0) 55%, rgba(0, 0, 0, .35) 100%)
const paintVignette = (context: CanvasRenderingContext2D, width: number, height: number) =>
{
    context.save();
    context.translate((width * .5), (height * .45));
    context.scale((width * .7), (height * .7));

    const gradient = context.createRadialGradient(0, 0, 0, 0, 0, 1);

    gradient.addColorStop(.55, 'rgba(0, 0, 0, 0)');
    gradient.addColorStop(1, 'rgba(0, 0, 0, .35)');

    context.fillStyle = gradient;
    context.fillRect(-2, -2, 4, 4);
    context.restore();
}

// .env-sky-layer's gradient and .env-sky-horizon, and the vignette when nothing
// sits between them
const paintBase = (canvas: HTMLCanvasElement, look: SkyLook, vignette: boolean) =>
{
    const width = canvas.width;
    const height = canvas.height;
    const context = canvas.getContext('2d');

    const gradient = context.createLinearGradient(0, 0, 0, height);

    gradient.addColorStop(0, rgb(look.stops.top));
    gradient.addColorStop(.52, rgb(look.stops.mid));
    gradient.addColorStop(1, rgb(look.stops.bottom));

    context.fillStyle = gradient;
    context.fillRect(0, 0, width, height);

    // left/right -10%, top 50%, height 50%; an ellipse 60% x 50% of that box
    // at its middle, to nothing at its edge (the same colour at 0 alpha, so it
    // fades the way the CSS one does)
    const boxX = (-0.1 * width);
    const boxY = (0.5 * height);
    const boxW = (1.2 * width);
    const boxH = (0.5 * height);

    context.save();
    context.beginPath();
    context.rect(boxX, boxY, boxW, boxH);
    context.clip();
    context.translate((boxX + (boxW / 2)), (boxY + (boxH / 2)));
    context.scale((boxW * .6), (boxH * .5));

    const glow = context.createRadialGradient(0, 0, 0, 0, 0, 1);

    glow.addColorStop(0, rgba(look.horizonRgb, look.glow));
    glow.addColorStop(.45, rgba(look.horizonRgb, (look.glow * .45)));
    glow.addColorStop(1, rgba(look.horizonRgb, 0));

    context.fillStyle = glow;
    context.fillRect(-2, -2, 4, 4);
    context.restore();

    if(vignette) paintVignette(context, width, height);
}

// .env-sky-fog-band: a band across, blurred 26px, then faded to nothing at
// its top and bottom (CSS applies the filter before the mask)
const FOG_BANDS: [ number, number ][][] = [
    [ [ 0, 0 ], [ .30, .06 ], [ .55, .11 ], [ 1, 0 ] ],
    [ [ 0, .1 ], [ .45, 0 ], [ .80, .07 ], [ 1, 0 ] ]
];

const paintFog = (canvas: HTMLCanvasElement, stops: [ number, number ][], blur: number) =>
{
    const width = canvas.width;
    const height = canvas.height;
    const band = canvasOf(width, height);
    const bandContext = band.getContext('2d');
    const across = bandContext.createLinearGradient(0, 0, width, 0);

    for(const [ at, alpha ] of stops) across.addColorStop(at, `rgba(255, 255, 255, ${ alpha })`);

    bandContext.fillStyle = across;
    bandContext.fillRect(0, 0, width, height);

    const context = canvas.getContext('2d');

    context.clearRect(0, 0, width, height);

    if('filter' in context) context.filter = `blur(${ blur }px)`;

    context.drawImage(band, 0, 0);

    if('filter' in context) context.filter = 'none';

    const mask = context.createLinearGradient(0, 0, 0, height);

    mask.addColorStop(0, 'rgba(0, 0, 0, 0)');
    mask.addColorStop(.4, 'rgba(0, 0, 0, 1)');
    mask.addColorStop(.6, 'rgba(0, 0, 0, 1)');
    mask.addColorStop(1, 'rgba(0, 0, 0, 0)');

    context.globalCompositeOperation = 'destination-in';
    context.fillStyle = mask;
    context.fillRect(0, 0, width, height);
    context.globalCompositeOperation = 'source-over';
}

// one twinkle group over the starfield box (the top 65%), as the SVG's
// viewBox 1600x700 with preserveAspectRatio xMidYMid slice
const paintStars = (canvas: HTMLCanvasElement, stars: Star[]) =>
{
    const width = canvas.width;
    const height = canvas.height;
    const scale = Math.max((width / STAR_FIELD_W), (height / STAR_FIELD_H));
    const offsetX = ((width - (STAR_FIELD_W * scale)) / 2);
    const offsetY = ((height - (STAR_FIELD_H * scale)) / 2);
    const context = canvas.getContext('2d');

    context.clearRect(0, 0, width, height);

    for(const star of stars)
    {
        context.beginPath();
        context.arc((offsetX + (star.x * scale)), (offsetY + (star.y * scale)), (star.r * scale), 0, (Math.PI * 2));
        context.fillStyle = `rgba(255, 255, 255, ${ star.o })`;
        context.fill();
    }
}

const spriteOf = (canvas: HTMLCanvasElement, linear: boolean): NitroSprite =>
{
    const texture = NitroTexture.from(canvas);

    texture.baseTexture.scaleMode = (linear ? SCALE_MODES.LINEAR : SCALE_MODES.NEAREST);

    return new NitroSprite(texture);
}

const repainted = (sprite: NitroSprite) => sprite.texture.baseTexture.update();

const forget = (sprite: NitroSprite) =>
{
    if(!sprite) return;

    // the canvas goes with its texture
    sprite.destroy({ children: true, texture: true, baseTexture: true });
}

// .env-sky-fog.is-a / .is-b: left/right -20%, its top and height, and the drift
const FOG_PLACES = [
    { top: .24, height: .44, duration: 90000, from: -0.04, to: 0.04, alphaFrom: .75, alphaTo: 1 },
    { top: .46, height: .40, duration: 120000, from: 0.03, to: -0.03, alphaFrom: 1, alphaTo: .7 }
];

// .env-sky-star-group is-0/1/2: 6 s, 7.5 s from -2.5 s, 9 s from -5 s
const TWINKLES = [ { duration: 6000, delay: 0 }, { duration: 7500, delay: -2500 }, { duration: 9000, delay: -5000 } ];

class SkyLayer
{
    public readonly kind: string;
    public readonly container: NitroContainer = new NitroContainer();

    private _look: SkyLook;
    private _baseKey: string = null;
    private _base: NitroSprite = null;
    private _fog: NitroSprite[] = [];
    private _stars: NitroSprite[] = [];
    private _starBox: NitroContainer = null;
    private _vignette: NitroSprite = null;
    private _width = 0;
    private _height = 0;
    private _bornAt: number;
    private _fadingFrom: number = -1;

    constructor(look: SkyLook, private _starGroups: Star[][], now: number)
    {
        this.kind = look.kind;
        this._look = look;
        this._bornAt = now;
    }

    public get look(): SkyLook
    {
        return this._look;
    }

    public set look(look: SkyLook)
    {
        this._look = look;
    }

    public fadeOut(now: number): void
    {
        if(this._fadingFrom < 0) this._fadingFrom = now;
    }

    public get faded(): boolean
    {
        return ((this._fadingFrom >= 0) && ((performance.now() - this._fadingFrom) >= FADE_MS));
    }

    // the pictures for this size and look; a resize only stretches them until
    // it settles (paintSize)
    public layout(width: number, height: number, paintSize: boolean): void
    {
        const look = this._look;
        const layered = (look.fog || look.stars);
        const baseKey = `${ look.gradient }|${ look.horizon }|${ layered }`;

        if(paintSize || !this._base)
        {
            this._width = width;
            this._height = height;
        }

        if(!this._base || paintSize || (baseKey !== this._baseKey))
        {
            const sizeChanged = (!this._base || (this._base.texture.baseTexture.width !== Math.max(1, Math.round(this._width * SCALE))));

            if(sizeChanged)
            {
                forget(this._base);

                this._base = spriteOf(canvasOf((this._width * SCALE), (this._height * SCALE)), true);

                this.container.addChildAt(this._base, 0);
            }

            paintBase((this._base.texture.baseTexture.resource as any).source, look, !layered);
            repainted(this._base);

            this._baseKey = baseKey;
        }

        this._base.width = width;
        this._base.height = height;

        this.layoutFog(width, height, paintSize);
        this.layoutStars(width, height, paintSize);
        this.layoutVignette(width, height, paintSize, layered);
    }

    private layoutFog(width: number, height: number, paintSize: boolean): void
    {
        if(!this._look.fog)
        {
            this._fog.forEach(forget);
            this._fog = [];

            return;
        }

        if(!this._fog.length || paintSize)
        {
            this._fog.forEach(forget);
            this._fog = FOG_PLACES.map((place, index) =>
            {
                const canvas = canvasOf((this._width * 1.4 * SCALE), (this._height * place.height * SCALE));

                paintFog(canvas, FOG_BANDS[index], (26 * SCALE));

                return spriteOf(canvas, true);
            });

            this._fog.forEach((sprite, index) => this.container.addChildAt(sprite, (1 + index)));
        }

        FOG_PLACES.forEach((place, index) =>
        {
            const sprite = this._fog[index];

            sprite.width = (width * 1.4);
            sprite.height = (height * place.height);
            sprite.y = (height * place.top);
        });
    }

    private layoutStars(width: number, height: number, paintSize: boolean): void
    {
        if(!this._look.stars)
        {
            this._stars.forEach(forget);
            this._stars = [];

            if(this._starBox)
            {
                this._starBox.destroy();
                this._starBox = null;
            }

            return;
        }

        if(!this._starBox)
        {
            this._starBox = new NitroContainer();

            this.container.addChildAt(this._starBox, (1 + this._fog.length));
        }

        if(!this._stars.length || paintSize)
        {
            this._stars.forEach(forget);
            this._stars = this._starGroups.map(group =>
            {
                const canvas = canvasOf(this._width, (this._height * .65));

                paintStars(canvas, group);

                return spriteOf(canvas, false);
            });

            this._stars.forEach(sprite => this._starBox.addChild(sprite));
        }

        for(const sprite of this._stars)
        {
            sprite.width = width;
            sprite.height = (height * .65);
        }

        this._starBox.alpha = (1 - (this._look.daylight / .3));
    }

    private layoutVignette(width: number, height: number, paintSize: boolean, layered: boolean): void
    {
        if(!layered)
        {
            forget(this._vignette);
            this._vignette = null;

            return;
        }

        if(!this._vignette || paintSize)
        {
            forget(this._vignette);

            const canvas = canvasOf((this._width * SCALE), (this._height * SCALE));

            paintVignette(canvas.getContext('2d'), canvas.width, canvas.height);

            this._vignette = spriteOf(canvas, true);
            this.container.addChild(this._vignette);
        }

        this._vignette.width = width;
        this._vignette.height = height;
    }

    // the fade, the fog's drift and the twinkle at this moment
    public animate(now: number, width: number, still: boolean): void
    {
        if(still)
        {
            this.container.alpha = ((this._fadingFrom >= 0) ? 0 : 1);

            for(const sprite of this._fog)
            {
                sprite.x = (-0.2 * width);
                sprite.alpha = 1;
            }

            for(const sprite of this._stars) sprite.alpha = 1;

            return;
        }

        const fadeIn = ease(Math.min(1, ((now - this._bornAt) / FADE_MS)));
        const fadeOut = ((this._fadingFrom >= 0) ? (1 - ease(Math.min(1, ((now - this._fadingFrom) / FADE_MS)))) : 1);

        this.container.alpha = (fadeIn * fadeOut);

        FOG_PLACES.forEach((place, index) =>
        {
            const sprite = this._fog[index];

            if(!sprite) return;

            const progress = alternating((now - this._bornAt), place.duration);

            sprite.x = ((-0.2 * width) + ((place.from + ((place.to - place.from) * progress)) * width * 1.4));
            sprite.alpha = (place.alphaFrom + ((place.alphaTo - place.alphaFrom) * progress));
        });

        this._stars.forEach((sprite, index) =>
        {
            const twinkle = TWINKLES[index];

            sprite.alpha = (.6 + (.4 * alternating(((now - this._bornAt) - twinkle.delay), twinkle.duration)));
        });
    }

    public dispose(): void
    {
        forget(this._base);
        this._fog.forEach(forget);
        this._stars.forEach(forget);
        forget(this._vignette);

        this._base = null;
        this._fog = [];
        this._stars = [];
        this._vignette = null;

        this.container.destroy({ children: true });
    }
}

interface SkyScreen
{
    width: number;
    height: number;
}

interface SkyTicker
{
    add(fn: () => void, context: unknown): unknown;
    remove(fn: () => void, context: unknown): unknown;
}

// the Pixi application the room is drawn by (GetNitroInstance().application)
export interface SkyHost
{
    stage: Container;
    renderer: { screen: SkyScreen };
    ticker: SkyTicker;
}

export class SkyPainter
{
    private _host: SkyHost = null;
    private _root: NitroContainer = null;
    private _layers: SkyLayer[] = [];
    private _width = 0;
    private _height = 0;
    private _resizedAt = 0;
    private _paintedSize = true;
    private _still = false;

    constructor(private _starGroups: Star[][])
    {}

    public attach(host: SkyHost): boolean
    {
        if(this._host) return true;

        if(!host?.stage || !host.renderer || !host.ticker) return false;

        this._host = host;
        this._root = new NitroContainer();

        host.stage.addChildAt(this._root, 0);

        try
        {
            this._still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        }
        catch(e)
        {
            this._still = false;
        }

        host.ticker.add(this.update, this);

        return true;
    }

    // the look now; a new kind of sky crossfades from the last one
    public show(look: SkyLook): void
    {
        if(!this._root) return;

        const now = performance.now();
        const current = this._layers[this._layers.length - 1];

        if(!this._layers.length) this.measure();

        if(current && (current.kind === look.kind))
        {
            current.look = look;
            current.layout(this._width, this._height, false);

            return;
        }

        if(current) current.fadeOut(now);

        const layer = new SkyLayer(look, this._starGroups, now);

        // it fades in from nothing (animate), unless nothing moves
        layer.container.alpha = (this._still ? 1 : 0);
        layer.layout(this._width, this._height, true);

        this._root.addChild(layer.container);
        this._layers.push(layer);
    }

    // Environment > Weather off: black, as before
    public hide(): void
    {
        for(const layer of this._layers) layer.dispose();

        this._layers = [];
    }

    public dispose(): void
    {
        this.hide();

        if(this._host) this._host.ticker.remove(this.update, this);

        if(this._root)
        {
            this._root.destroy({ children: true });
            this._root = null;
        }

        this._host = null;
    }

    // the size the sky is painted for, from the canvas as it is now
    private measure(): void
    {
        this._width = Math.max(1, Math.round(this._host.renderer.screen.width));
        this._height = Math.max(1, Math.round(this._host.renderer.screen.height));
        this._paintedSize = true;
    }

    private update(): void
    {
        if(!this._root || !this._layers.length) return;

        const now = performance.now();
        const stage = this._host.stage;

        // under the room, whatever was added since
        if(stage.getChildIndex(this._root) !== 0) stage.setChildIndex(this._root, 0);

        const width = Math.max(1, Math.round(this._host.renderer.screen.width));
        const height = Math.max(1, Math.round(this._host.renderer.screen.height));

        if((width !== this._width) || (height !== this._height))
        {
            this._width = width;
            this._height = height;
            this._resizedAt = now;
            this._paintedSize = false;

            for(const layer of this._layers) layer.layout(width, height, false);
        }
        else if(!this._paintedSize && ((now - this._resizedAt) >= RESIZE_SETTLE_MS))
        {
            this._paintedSize = true;

            for(const layer of this._layers) layer.layout(width, height, true);
        }

        for(const layer of this._layers) layer.animate(now, width, this._still);

        // a faded sky goes
        while((this._layers.length > 1) && this._layers[0].faded)
        {
            this._layers.shift().dispose();
        }
    }
}
