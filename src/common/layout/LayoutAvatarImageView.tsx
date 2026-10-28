import { AvatarScaleType, AvatarSetType } from '@nitrots/nitro-renderer';
import { CSSProperties, FC, useEffect, useMemo, useRef, useState } from 'react';
import { GetAvatarRenderManager } from '../../api';
import { ReadTextureImageAsync } from '../../api/utils/ReadTextureImageAsync';
import { Base, BaseProps } from '../Base';

// pixelrp: every mount drew its avatar afresh - a render to a texture, read
// back from the GPU and PNG-encoded, synchronously - and the same faces are
// drawn again and again: a clicked player's infostand, the HUD target and
// portrait (every room change), phone contacts, city lists. A finished still
// is kept, keyed by everything that changes the picture, and capped with the
// oldest dropped first (a Map keeps insertion order). A placeholder (the
// outfit still downloading) and an animated preview are never kept.
const IMAGE_CACHE_LIMIT = 300;
const imageCache: Map<string, string> = new Map();

const rememberImage = (key: string, url: string) =>
{
    imageCache.delete(key);
    imageCache.set(key, url);

    while(imageCache.size > IMAGE_CACHE_LIMIT) imageCache.delete(imageCache.keys().next().value);
}

// pixelrp (Twist, 2026-10-27): a still being read, by its cache key - settled
// with the picture once it is kept, or null when it was not (a placeholder, an
// empty draw, a read that failed, a view gone first). A click on a player has
// the HUD target and the infostand ask for the same picture together; the
// second waits for the first instead of reading it again, and draws it itself
// only on a null.
const reading: Map<string, Promise<string>> = new Map();

// pixelrp: a still is only kept once it has something in it. One drawn while
// the clothes were briefly unavailable came out empty - and, kept, the profile
// and HUD showed an empty picture until the page was reloaded (Twist,
// 2026-10-25). An empty or failed draw is drawn again shortly instead, a few
// times, each wait longer than the last.
const RETRY_DELAYS_MS = [ 250, 500, 1000, 2000, 4000, 8000 ];

const hasPixels = (image: HTMLImageElement): boolean =>
{
    const width = image.naturalWidth;
    const height = image.naturalHeight;

    if(!width || !height) return false;

    const canvas = document.createElement('canvas');

    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext('2d', { willReadFrequently: true });

    // nothing to check it with: trust it, as before
    if(!context) return true;

    context.drawImage(image, 0, 0);

    const pixels = context.getImageData(0, 0, width, height).data;

    for(let index = 3; index < pixels.length; index += 4)
    {
        if(pixels[index]) return true;
    }

    return false;
}

export interface LayoutAvatarImageViewProps extends BaseProps<HTMLDivElement>
{
    figure: string;
    gender?: string;
    headOnly?: boolean;
    direction?: number;
    scale?: number;
    animate?: boolean;
}

export const LayoutAvatarImageView: FC<LayoutAvatarImageViewProps> = props =>
{
    const { figure = '', gender = 'M', headOnly = false, direction = 0, scale = 1, animate = false, classNames = [], style = {}, ...rest } = props;
    const [ avatarUrl, setAvatarUrl ] = useState<string>(null);
    const [ randomValue, setRandomValue ] = useState(-1);
    const isDisposed = useRef(false);
    // empty draws retried for the picture now shown (its cache key)
    const retries = useRef({ key: '', count: 0 });

    const getClassNames = useMemo(() =>
    {
        const newClassNames: string[] = [ 'avatar-image' ];

        if(classNames.length) newClassNames.push(...classNames);

        return newClassNames;
    }, [ classNames ]);

    const cacheKey = `${ figure }|${ gender }|${ direction }|${ headOnly ? 'head' : 'full' }`;

    // pixelrp (Twist, 2026-10-28): a picture already kept is shown in this very
    // render. The effect below put it in state, which drew it a render later,
    // in a task of its own - the HUD target and the infostand showed a known
    // face a frame or more after the click. A view that shows a different
    // player is given a key of its own by its caller, so it starts empty
    // rather than with the last player's face.
    const shownUrl = ((!animate && imageCache.get(cacheKey)) || avatarUrl);

    const getStyle = useMemo(() =>
    {
        let newStyle: CSSProperties = {};

        if(shownUrl && shownUrl.length) newStyle.backgroundImage = `url('${ shownUrl }')`;

        if(scale !== 1)
        {
            newStyle.transform = `scale(${ scale })`;

            if(!(scale % 1)) newStyle.imageRendering = 'pixelated';
        }

        if(Object.keys(style).length) newStyle = { ...newStyle, ...style };

        return newStyle;
    }, [ shownUrl, scale, style ]);

    useEffect(() =>
    {
        if(retries.current.key !== cacheKey) retries.current = { key: cacheKey, count: 0 };

        let cancelled = false;
        let retryTimeoutId = 0;

        const retryLater = () =>
        {
            if(cancelled || isDisposed.current || (retries.current.count >= RETRY_DELAYS_MS.length)) return;

            const delay = RETRY_DELAYS_MS[retries.current.count++];

            retryTimeoutId = window.setTimeout(() =>
            {
                if(!isDisposed.current) setRandomValue(Math.random());
            }, delay);
        };

        if(!animate)
        {
            const cached = imageCache.get(cacheKey);

            if(cached)
            {
                rememberImage(cacheKey, cached);
                setAvatarUrl(cached);

                return;
            }
        }

        const draw = (): (() => void) =>
        {
            const avatarImage = GetAvatarRenderManager().createAvatarImage(figure, AvatarScaleType.LARGE, gender, {
                resetFigure: figure =>
                {
                    if(isDisposed.current) return;

                    setRandomValue(Math.random());
                },
                dispose: () =>
                {},
                disposed: false
            }, null);

            if(!avatarImage) return null;

            let setType = AvatarSetType.FULL;

            if(headOnly) setType = AvatarSetType.HEAD;

            avatarImage.setDirection(setType, direction);

            const renderFrame = () =>
            {
                const image = avatarImage.getCroppedImage(setType);

                if(image) setAvatarUrl(image.src);

                return image;
            };

            const firstFrame = renderFrame();

            // A placeholder is redrawn when its clothes arrive (resetFigure);
            // anything else is kept only if it is not empty.
            if(!animate && !avatarImage.isPlaceholder())
            {
                const keepOrRetry = () =>
                {
                    if(cancelled) return;

                    if(hasPixels(firstFrame)) rememberImage(cacheKey, firstFrame.src);
                    else retryLater();
                };

                if(!firstFrame) retryLater();
                else if(firstFrame.complete && firstFrame.naturalWidth) keepOrRetry();
                else firstFrame.decode().then(keepOrRetry, retryLater);
            }

            // Animated figures (e.g. animated clothing) keep cycling their idle frames.
            // Advance them on a timer so the preview matches how they look in the room;
            // the room runs the avatar animation at ~12fps (24fps max / 2-frame interval).
            if(animate && avatarImage.isAnimating())
            {
                const intervalId = window.setInterval(() =>
                {
                    avatarImage.updateAnimationByFrames(1);

                    renderFrame();
                }, 80);

                return () =>
                {
                    window.clearInterval(intervalId);

                    avatarImage.dispose();
                }
            }

            avatarImage.dispose();

            return null;
        };

        let stopDrawing: () => void = null;
        let frameId = 0;
        let timeoutId = 0;

        // pixelrp: a face not drawn before is drawn just after the next paint.
        // A click on a new player rendered it inside the click - a GPU readback
        // and a PNG encode before the frame showing the click could paint.
        const afterNextPaint = (work: () => void) =>
        {
            frameId = window.requestAnimationFrame(() =>
            {
                timeoutId = window.setTimeout(work, 0);
            });
        };

        // Our share of `reading`, while this view is the one reading the picture.
        let settleShared: (url: string) => void = null;

        const share = (url: string) =>
        {
            if(!settleShared) return;

            settleShared(url);
            settleShared = null;
        };

        // pixelrp (Twist, 2026-10-27): a still read back from the graphics card
        // without waiting for it (ReadTextureImageAsync, as the chat heads are).
        // Read straight away, as draw() does, the browser first waits for every
        // draw already queued for the graphics card - about 50 ms on a busy
        // machine, the first time each player is clicked. The same picture,
        // shown a frame or two later. Kept or retried exactly as draw() does,
        // and a read that fails falls back to draw() itself.
        const drawWithoutWaiting = () =>
        {
            const avatarImage = GetAvatarRenderManager().createAvatarImage(figure, AvatarScaleType.LARGE, gender, {
                resetFigure: figure =>
                {
                    if(isDisposed.current) return;

                    setRandomValue(Math.random());
                },
                dispose: () =>
                {},
                disposed: false
            }, null);

            if(!avatarImage)
            {
                share(null);

                return;
            }

            const setType = (headOnly ? AvatarSetType.HEAD : AvatarSetType.FULL);

            avatarImage.setDirection(setType, direction);

            // A placeholder is shown and redrawn when its clothes arrive
            // (resetFigure), never kept.
            const placeholder = avatarImage.isPlaceholder();
            const texture = avatarImage.getCroppedTexture(setType);

            avatarImage.dispose();

            if(!texture)
            {
                share(null);

                if(!placeholder) retryLater();

                return;
            }

            let read: Promise<string> = null;

            try
            {
                read = ReadTextureImageAsync(texture);
            }
            catch(error)
            {
                read = Promise.resolve(null);
            }

            read.catch(() => null).then(url =>
            {
                texture.destroy(true);

                if(cancelled) return;

                if(!url)
                {
                    share(null);

                    stopDrawing = draw();

                    return;
                }

                setAvatarUrl(url);

                if(placeholder)
                {
                    share(null);

                    return;
                }

                const image = new Image();

                const keepOrRetry = () =>
                {
                    if(cancelled) return;

                    if(hasPixels(image))
                    {
                        rememberImage(cacheKey, url);
                        share(url);
                    }
                    else
                    {
                        share(null);
                        retryLater();
                    }
                };

                image.src = url;
                image.decode().then(keepOrRetry, () =>
                {
                    if(cancelled) return;

                    share(null);
                    retryLater();
                });
            });
        };

        // and whatever goes wrong drawing it, a view waiting on this one is let go
        const drawShared = () =>
        {
            try
            {
                drawWithoutWaiting();
            }
            catch(error)
            {
                share(null);

                throw error;
            }
        };

        if(animate)
        {
            afterNextPaint(() => (stopDrawing = draw()));
        }
        else
        {
            const pending = reading.get(cacheKey);

            if(pending)
            {
                // Another view is reading this picture: wait for it, and draw
                // it here only if it comes to nothing.
                pending.then(url =>
                {
                    if(cancelled) return;

                    if(url) setAvatarUrl(url);
                    else afterNextPaint(drawShared);
                });
            }
            else
            {
                const shared = new Promise<string>(resolve => (settleShared = resolve));

                reading.set(cacheKey, shared);

                shared.then(() =>
                {
                    if(reading.get(cacheKey) === shared) reading.delete(cacheKey);
                });

                afterNextPaint(drawShared);
            }
        }

        return () =>
        {
            cancelled = true;

            // a view waiting on this one draws the picture itself
            share(null);

            window.cancelAnimationFrame(frameId);
            window.clearTimeout(timeoutId);
            window.clearTimeout(retryTimeoutId);

            if(stopDrawing) stopDrawing();
        }
    }, [ cacheKey, figure, gender, direction, headOnly, animate, randomValue ]);

    useEffect(() =>
    {
        isDisposed.current = false;

        return () =>
        {
            isDisposed.current = true;
        }
    }, []);
        
    return <Base classNames={ getClassNames } style={ getStyle } { ...rest } />;
}
