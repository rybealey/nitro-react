import { FC, SVGProps } from 'react';

// The player menus' arrows (Player Menu canvas, A), drawn one pixel at a time
// at the size they are seen, in place of the Font Awesome glyphs the furni,
// pet and bot menus still use. They paint in currentColor.
const ARROWS = {
    right: { width: 4, height: 7, path: 'M0 0h1v1H0zM1 1h1v1H1zM2 2h1v1H2zM3 3h1v1H3zM2 4h1v1H2zM1 5h1v1H1zM0 6h1v1H0z' },
    left: { width: 4, height: 7, path: 'M3 0h1v1H3zM2 1h1v1H2zM1 2h1v1H1zM0 3h1v1H0zM1 4h1v1H1zM2 5h1v1H2zM3 6h1v1H3z' },
    down: { width: 7, height: 4, path: 'M0 0h7v1H0zM1 1h5v1H1zM2 2h3v1H2zM3 3h1v1H3z' },
    up: { width: 7, height: 4, path: 'M3 0h1v1H3zM2 1h3v1H2zM1 2h5v1H1zM0 3h7v1H0z' }
};

interface ContextMenuPixelArrowViewProps extends SVGProps<SVGSVGElement>
{
    direction: keyof typeof ARROWS;
}

export const ContextMenuPixelArrowView: FC<ContextMenuPixelArrowViewProps> = props =>
{
    const { direction = 'right', ...rest } = props;
    const { width, height, path } = ARROWS[direction];

    return (
        <svg width={ width } height={ height } viewBox={ `0 0 ${ width } ${ height }` } fill="currentColor" shapeRendering="crispEdges" aria-hidden="true" { ...rest }>
            <path d={ path } />
        </svg>
    );
}
