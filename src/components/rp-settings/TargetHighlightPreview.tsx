import { CSSProperties, FC, useEffect, useRef, useState } from 'react';
import { GetSessionDataManager } from '../../api';
import { TargetHighlightStyle } from '../../api/prefs/TargetHighlightStore';
import { LayoutAvatarImageView } from '../../common';

// Settings > UI > Target select: your own avatar on a patch of floor, marked
// out the way the style marks your locked target, in the player's colour. The
// line is drawn here with one-pixel drop shadows round the picture (the
// "Target Lock Highlight" canvas's way) and the tint with the picture as a
// mask; in the room the renderer draws the same things (TargetOutlineFilter,
// TargetRingAddition, TargetArrowAddition).

const ringOf = (colour: string) => `drop-shadow(1px 0 0 ${ colour }) drop-shadow(-1px 0 0 ${ colour }) drop-shadow(0 1px 0 ${ colour }) drop-shadow(0 -1px 0 ${ colour })`;

const filterFor = (highlight: TargetHighlightStyle, colour: string): string =>
{
    switch(highlight)
    {
        case 'thin':
        case 'linering':
            return ringOf(colour);
        case 'thick':
            return `${ ringOf(colour) } ${ ringOf(colour) }`;
        case 'glow':
            return `${ ringOf(colour) } drop-shadow(0 0 4px ${ colour }99)`;
        default:
            return null;
    }
}

// The renderer's arrow (TargetArrowAddition), pixel for pixel: 'o' the edge
// at 45% of the colour, 'x' the colour.
const ARROW = [
    '   ooooo   ',
    '   oxxxo   ',
    '   oxxxo   ',
    'oooxxxxxooo',
    ' oxxxxxxxo ',
    '  oxxxxxo  ',
    '   oxxxo   ',
    '    oxo    ',
    '     o     '
];

const darker = (colour: string): string =>
{
    const value = parseInt(colour.slice(1), 16);
    const part = (shift: number) => Math.round(((value >> shift) & 0xFF) * 0.45);

    return `rgb(${ part(16) }, ${ part(8) }, ${ part(0) })`;
}

// Where the soles go: a few pixels below the middle tile's centre (y 100), as
// an avatar stands on its tile in the room.
const FEET_Y = 104;

// The avatar's picture is its whole drawing canvas, with empty space round
// the figure, so the figure's top and bottom are found in it - once per picture.
const figureRows = new Map<string, { top: number, bottom: number }>();

const figureRowsOf = (image: HTMLImageElement): { top: number, bottom: number } =>
{
    const canvas = document.createElement('canvas');

    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;

    if(!canvas.width || !canvas.height) return null;

    const context = canvas.getContext('2d');

    context.drawImage(image, 0, 0);

    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const rowHasFigure = (y: number) =>
    {
        for(let x = 0; x < canvas.width; x++) if(pixels[(((y * canvas.width) + x) * 4) + 3] > 0) return true;

        return false;
    };

    let top = 0;
    let bottom = (canvas.height - 1);

    while((top < canvas.height) && !rowHasFigure(top)) top++;
    while((bottom > top) && !rowHasFigure(bottom)) bottom--;

    return ((top < canvas.height) ? { top, bottom } : null);
}

export const TargetHighlightPreview: FC<{ highlight: TargetHighlightStyle, colour: string }> = ({ highlight, colour }) =>
{
    const session = GetSessionDataManager();
    const hostRef = useRef<HTMLDivElement>(null);
    const [ picture, setPicture ] = useState<{ url: string, top: number, bottom: number }>(null);

    // The picture arrives after the first draw (and again if the clothes are
    // redrawn), so its address is watched on the element.
    useEffect(() =>
    {
        const host = hostRef.current;

        if(!host) return;

        let cancelled = false;
        let measured = '';

        const measure = () =>
        {
            const element = host.querySelector<HTMLElement>('.avatar-image');
            const url = (/url\(["']?(.*?)["']?\)/.exec(element?.style.backgroundImage ?? '')?.[1] ?? '');

            if(!url || (url === measured)) return;

            measured = url;

            if(figureRows.has(url))
            {
                const rows = figureRows.get(url);

                if(rows) setPicture({ url, ...rows });

                return;
            }

            const image = new Image();

            image.onload = () =>
            {
                const rows = figureRowsOf(image);

                figureRows.set(url, rows);

                if(!cancelled && rows) setPicture({ url, ...rows });
            };
            image.src = url;
        };

        const observer = new MutationObserver(measure);

        observer.observe(host, { subtree: true, attributes: true, attributeFilter: [ 'style' ] });
        measure();

        return () =>
        {
            cancelled = true;
            observer.disconnect();
        };
    }, []);

    const shift = (picture ? (FEET_Y - picture.bottom) : null);
    const position = ((shift !== null) ? `center ${ shift }px` : null);
    const filter = filterFor(highlight, colour);
    const avatarStyle: CSSProperties = {
        ...(filter ? { filter } : {}),
        ...(position ? { backgroundPosition: position } : {})
    };
    // The tint: the colour, cut to the figure's shape, laid over it.
    const tintStyle: CSSProperties = (((highlight === 'tint') && picture) ? {
        backgroundColor: colour,
        opacity: 0.45,
        WebkitMaskImage: `url('${ picture.url }')`,
        maskImage: `url('${ picture.url }')`,
        WebkitMaskPosition: position,
        maskPosition: position,
        WebkitMaskRepeat: 'no-repeat',
        maskRepeat: 'no-repeat'
    } : null);
    // The arrow's point just over the head.
    const arrowTop = (picture ? ((FEET_Y - (picture.bottom - picture.top)) - ARROW.length - 3) : 0);

    return (
        <div ref={ hostRef } className="rp-settings-target-preview" aria-hidden="true">
            <svg width="80" height="112" viewBox="0 0 80 112" shapeRendering="crispEdges">
                <polygon points="40,84 72,100 40,116 8,100" fill="none" stroke="#8f8f5f" strokeWidth="1" />
                <ellipse cx="40" cy="101" rx="12" ry="5" fill="rgba(0, 0, 0, 0.3)" />
                { ((highlight === 'ring') || (highlight === 'linering')) &&
                    <ellipse cx="40" cy="100" rx="21" ry="10" fill={ colour } fillOpacity="0.22" stroke={ colour } strokeWidth="1" /> }
            </svg>
            <LayoutAvatarImageView figure={ session?.figure } gender={ session?.gender } direction={ 2 } style={ avatarStyle } />
            { tintStyle && <div className="rp-settings-target-tint" style={ tintStyle } /> }
            { ((highlight === 'arrow') && picture) &&
                <svg className="rp-settings-target-arrow" width={ ARROW[0].length } height={ ARROW.length } style={ { top: arrowTop } } shapeRendering="crispEdges">
                    { ARROW.flatMap((row, y) => [ ...row ].map((cell, x) => ((cell === ' ') ? null :
                        <rect key={ `${ x }:${ y }` } x={ x } y={ y } width="1" height="1" fill={ (cell === 'o') ? darker(colour) : colour } />))) }
                </svg> }
        </div>
    );
}
