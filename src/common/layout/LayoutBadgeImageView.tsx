import { BadgeImageReadyEvent, NitroSprite, TextureUtils } from '@nitrots/nitro-renderer';
import { CSSProperties, FC, useEffect, useMemo, useState } from 'react';
import { GetConfiguration, GetSessionDataManager, LocalizeBadgeDescription, LocalizeBadgeName, LocalizeText } from '../../api';
import { Base, BaseProps } from '../Base';

export interface LayoutBadgeImageViewProps extends BaseProps<HTMLDivElement>
{
    badgeCode: string;
    isGroup?: boolean;
    showInfo?: boolean;
    customTitle?: string;
    isGrayscale?: boolean;
    scale?: number;
}

export const LayoutBadgeImageView: FC<LayoutBadgeImageViewProps> = props =>
{
    const { badgeCode = null, isGroup = false, showInfo = false, customTitle = null, isGrayscale = false, scale = 1, classNames = [], style = {}, children = null, ...rest } = props;
    const [ imageElement, setImageElement ] = useState<{ src: string, width: number, height: number }>(null);

    const getClassNames = useMemo(() =>
    {
        const newClassNames: string[] = [ 'badge-image' ];

        if(isGroup) newClassNames.push('group-badge');

        if(isGrayscale) newClassNames.push('grayscale');

        if(classNames.length) newClassNames.push(...classNames);

        return newClassNames;
    }, [ classNames, isGroup, isGrayscale ]);

    const getStyle = useMemo(() =>
    {
        let newStyle: CSSProperties = {};

        if(imageElement)
        {
            newStyle.backgroundImage = `url(${ (isGroup) ? imageElement.src : GetConfiguration<string>('badge.asset.url').replace('%badgename%', badgeCode.toString())})`;
            newStyle.width = imageElement.width;
            newStyle.height = imageElement.height;

            if(scale !== 1)
            {
                newStyle.transform = `scale(${ scale })`;

                if(!(scale % 1)) newStyle.imageRendering = 'pixelated';

                newStyle.width = (imageElement.width * scale);
                newStyle.height = (imageElement.height * scale);
            }
        }

        if(Object.keys(style).length) newStyle = { ...newStyle, ...style };

        return newStyle;
    }, [ imageElement, scale, style ]);

    useEffect(() =>
    {
        if(!badgeCode || !badgeCode.length) return;

        let didSetBadge = false;

        // pixelrp: a normal badge is drawn from its URL (getStyle) and only its
        // size was ever read off the image made here - a GPU read-back and a PNG
        // encode on every badge shown. The texture has the size. Group badges
        // are drawn from the image itself, so they still make one.
        const showTexture = (texture: ConstructorParameters<typeof NitroSprite>[0]) =>
        {
            if(!isGroup)
            {
                setImageElement({ src: null, width: texture.width, height: texture.height });

                return;
            }

            const element = TextureUtils.generateImage(new NitroSprite(texture));

            element.onload = () => setImageElement({ src: element.src, width: element.width, height: element.height });
        }

        const onBadgeImageReadyEvent = (event: BadgeImageReadyEvent) =>
        {
            if(event.badgeId !== badgeCode) return;

            showTexture(event.image);

            didSetBadge = true;

            GetSessionDataManager().events.removeEventListener(BadgeImageReadyEvent.IMAGE_READY, onBadgeImageReadyEvent);
        }

        GetSessionDataManager().events.addEventListener(BadgeImageReadyEvent.IMAGE_READY, onBadgeImageReadyEvent);

        const texture = isGroup ? GetSessionDataManager().getGroupBadgeImage(badgeCode) : GetSessionDataManager().getBadgeImage(badgeCode);

        if(texture && !didSetBadge) showTexture(texture);

        return () => GetSessionDataManager().events.removeEventListener(BadgeImageReadyEvent.IMAGE_READY, onBadgeImageReadyEvent);
    }, [ badgeCode, isGroup ]);

    return (
        <Base classNames={ getClassNames } style={ getStyle } { ...rest }>
            { (showInfo && GetConfiguration<boolean>('badge.descriptions.enabled', true)) &&
                <Base className="badge-information text-black py-1 px-2 small">
                    <div className="fw-bold mb-1">{ isGroup ? customTitle : LocalizeBadgeName(badgeCode) }</div>
                    <div>{ isGroup ? LocalizeText('group.badgepopup.body') : LocalizeBadgeDescription(badgeCode) }</div>
                </Base> }
            { children }
        </Base>
    );
}
