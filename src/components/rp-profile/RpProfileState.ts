import { RpEmployment } from '../../api/rp-employment/RpEmploymentRegistry';

// Who the RP profile window is showing. Set by the opener (player HUD
// portraits, corporation directory) right before
// CreateLinkEvent('rp-profile/show') — the same plain-module pattern as
// TargetState. Stats are still interface-only; employment is live.
export const RpProfileState = {
    name: '' as string,
    figure: '' as string,
    motto: '' as string,
    online: false as boolean,
    // Real user id (AvatarInfoUser.webID / GetSessionDataManager().userId),
    // NOT roomIndex — the employment registry is keyed by user id. 0 when the
    // opener has no id to give.
    userId: 0 as number,
    // Employment the opener already knows, used as-is instead of a lookup.
    // The corporation directory has the corp, rank and tier in hand but no
    // user id on the wire, so it seeds this directly.
    employment: null as RpEmployment | null,
    // Verified/staff mark, same flag the infostand shows. It rides RpStatsEvent
    // and is keyed by roomIndex, so only openers with a room unit can supply
    // it - the corporation directory has no way to know and leaves it false.
    staff: false as boolean,
};
