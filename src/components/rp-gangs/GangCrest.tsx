import { FC } from 'react';

let crestCounter = 0;

// The gang mark: a 50/50 vertical split shield - primary fills the left half,
// secondary the right - inside a neutral outline (neither half owns the
// border). Drawn from the two RGB colours picked at creation, the same values
// that will tint a gang's turf furni.
// The shield only fills the middle two thirds of the 24x24 box (x 4-20,
// y 2-22), so a crest drawn at `size` reads a third smaller than a badge drawn
// at the same number. `crop` tightens the viewBox to the shield itself, plus
// half the stroke on each edge, so `size` becomes the shield's real WIDTH -
// which is what lines a crest up with a 40px badge. Opt-in: every other caller
// keeps the square box it was laid out against.
const CROP_BOX = { x: 3.6, y: 1.6, width: 16.8, height: 20.8 };

export const GangCrest: FC<{ primary: string, secondary: string, size?: number, crop?: boolean }> = ({ primary, secondary, size = 52, crop = false }) =>
{
    // one clipPath id per instance - several crests share a document
    const clipId = `gang-crest-clip-${ (crestCounter++) }`;
    const shield = 'M12 2 L20 5 V12 C20 17 16.5 20.5 12 22 C7.5 20.5 4 17 4 12 V5 Z';
    const viewBox = (crop ? `${ CROP_BOX.x } ${ CROP_BOX.y } ${ CROP_BOX.width } ${ CROP_BOX.height }` : '0 0 24 24');
    const height = (crop ? Math.round((size * CROP_BOX.height) / CROP_BOX.width) : size);

    return (
        <svg className="gang-crest" width={ size } height={ height } viewBox={ viewBox } fill="none">
            <defs>
                <clipPath id={ clipId }>
                    <path d={ shield } />
                </clipPath>
            </defs>
            <g clipPath={ `url(#${ clipId })` }>
                <rect x="0" y="0" width="12" height="24" fill={ primary } />
                <rect x="12" y="0" width="12" height="24" fill={ secondary } />
            </g>
            <path d={ shield } fill="none" stroke="rgba(0, 0, 0, 0.4)" strokeWidth="0.8" strokeLinejoin="round" />
        </svg>
    );
}
