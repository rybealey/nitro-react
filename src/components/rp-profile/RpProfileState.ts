// Who the RP profile window is showing. Set by the opener (player HUD
// portraits) right before CreateLinkEvent('rp-profile/show') — the same
// plain-module pattern as TargetState. Interface-only for now; live stats
// wiring comes later.
export const RpProfileState = {
    name: '' as string,
    figure: '' as string,
    motto: '' as string,
};
