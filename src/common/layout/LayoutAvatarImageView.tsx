import { AvatarScaleType, AvatarSetType } from '@nitrots/nitro-renderer';
import { CSSProperties, FC, useEffect, useMemo, useRef, useState } from 'react';
import { GetAvatarRenderManager } from '../../api';
import { Base, BaseProps } from '../Base';

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

        if(!avatarImage) return;

        let setType = AvatarSetType.FULL;

        if(headOnly) setType = AvatarSetType.HEAD;

        avatarImage.setDirection(setType, direction);

        const renderFrame = () =>
        {
            const image = avatarImage.getCroppedImage(setType);

            if(image) setAvatarUrl(image.src);
        };

        renderFrame();

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
