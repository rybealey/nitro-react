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

            if(!animate && firstFrame && !avatarImage.isPlaceholder()) rememberImage(cacheKey, firstFrame.src);

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
            window.cancelAnimationFrame(frameId);
            window.clearTimeout(timeoutId);

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
