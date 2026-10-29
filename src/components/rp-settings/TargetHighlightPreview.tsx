import { CSSProperties, FC } from 'react';
import { GetSessionDataManager } from '../../api';
import { TargetHighlightStyle } from '../../api/prefs/TargetHighlightStore';
import { LayoutAvatarImageView } from '../../common';

// Settings > UI > Target select: your own avatar on a patch of floor, marked
// out the way the style marks your locked target. The line is drawn here with
// one-pixel drop shadows round the picture (the "Target Lock Highlight"
// canvas's way); in the room the renderer draws the same thing
// (TargetOutlineFilter, TargetRingAddition).

const RED = '#e03131';
const RING = `drop-shadow(1px 0 0 ${ RED }) drop-shadow(-1px 0 0 ${ RED }) drop-shadow(0 1px 0 ${ RED }) drop-shadow(0 -1px 0 ${ RED })`;

const FILTERS: Partial<Record<TargetHighlightStyle, string>> = {
    thin: RING,
    thick: `${ RING } ${ RING }`,
    glow: `${ RING } drop-shadow(0 0 4px rgba(224, 49, 49, 0.6))`
};

export const TargetHighlightPreview: FC<{ highlight: TargetHighlightStyle }> = ({ highlight }) =>
{
    const session = GetSessionDataManager();
    const avatarStyle: CSSProperties = (FILTERS[highlight] ? { filter: FILTERS[highlight] } : {});

    return (
        <div className="rp-settings-target-preview" aria-hidden="true">
            <svg width="80" height="112" viewBox="0 0 80 112" shapeRendering="crispEdges">
                <polygon points="40,84 72,100 40,116 8,100" fill="none" stroke="#8f8f5f" strokeWidth="1" />
                <ellipse cx="40" cy="101" rx="12" ry="5" fill="rgba(0, 0, 0, 0.3)" />
                { (highlight === 'ring') &&
                    <ellipse cx="40" cy="100" rx="21" ry="10" fill={ RED } fillOpacity="0.22" stroke={ RED } strokeWidth="1" /> }
            </svg>
            <LayoutAvatarImageView figure={ session?.figure } gender={ session?.gender } direction={ 2 } style={ avatarStyle } />
        </div>
    );
}
