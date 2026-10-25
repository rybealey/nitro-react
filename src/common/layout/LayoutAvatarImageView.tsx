import { AvatarScaleType, AvatarSetType } from '@nitrots/nitro-renderer';
import { CSSProperties, FC, useEffect, useMemo, useRef, useState } from 'react';
import { GetAvatarRenderManager } from '../../api';
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

    const getStyle = useMemo(() =>
    {
        let newStyle: CSSProperties = {};

        if(avatarUrl && avatarUrl.length) newStyle.backgroundImage = `url('${ avatarUrl }')`;

        if(scale !== 1)
        {
            newStyle.transform = `scale(${ scale })`;

            if(!(scale % 1)) newStyle.imageRendering = 'pixelated';
        }

        if(Object.keys(style).length) newStyle = { ...newStyle, ...style };

        return newStyle;
    }, [ avatarUrl, scale, style ]);

    useEffect(() =>
    {
        const cacheKey = `${ figure }|${ gender }|${ direction }|${ headOnly ? 'head' : 'full' }`;

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

        // pixelrp: a face not drawn before is drawn just after the next paint.
        // A click on a new player rendered it inside the click - a GPU readback
        // and a PNG encode before the frame showing the click could paint.
        let stopDrawing: () => void = null;
        let timeoutId = 0;

        const frameId = window.requestAnimationFrame(() =>
        {
            timeoutId = window.setTimeout(() => (stopDrawing = draw()), 0);
        });

        return () =>
        {
            cancelled = true;

            window.cancelAnimationFrame(frameId);
            window.clearTimeout(timeoutId);
            window.clearTimeout(retryTimeoutId);

            if(stopDrawing) stopDrawing();
        }
    }, [ figure, gender, direction, headOnly, animate, randomValue ]);

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
