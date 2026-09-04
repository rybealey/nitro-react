import { FC } from 'react';

let crestCounter = 0;

// The gang mark: a 50/50 vertical split shield - primary fills the left half,
// secondary the right - inside a neutral outline (neither half owns the
// border). Drawn from the two RGB colours picked at creation, the same values
// that will tint a gang's turf furni.
export const GangCrest: FC<{ primary: string, secondary: string, size?: number }> = ({ primary, secondary, size = 52 }) =>
{
    // one clipPath id per instance - several crests share a document
    const clipId = `gang-crest-clip-${ (crestCounter++) }`;
    const shield = 'M12 2 L20 5 V12 C20 17 16.5 20.5 12 22 C7.5 20.5 4 17 4 12 V5 Z';

    return (
        <svg className="gang-crest" width={ size } height={ size } viewBox="0 0 24 24" fill="none">
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
