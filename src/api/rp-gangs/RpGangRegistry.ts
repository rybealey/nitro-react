// PixelRP gang membership registry, keyed by user id - the gang twin of
// RpEmploymentRegistry. Fed by RpUserGangEvent (request replies and the
// hotel-wide broadcasts every gang mutation sends), read by the profile's
// gang card and the Gang window.
export interface RpGang
{
    gangId: number;
    name: string;
    colourA: string;
    colourB: string;
    isOwner: boolean;
}

const gangs: Map<number, RpGang> = new Map();

export const SetRpGang = (userId: number, gang: RpGang) =>
{
    if(!gang || (gang.gangId <= 0))
    {
        gangs.delete(userId);

        return;
    }

    gangs.set(userId, gang);
}

export const GetRpGang = (userId: number): RpGang =>
{
    return (gangs.get(userId) ?? null);
}
