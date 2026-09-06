// The staff/verified flag rides the RP stats packet and lives in the player
// HUD's per-room store, keyed by roomIndex. Openers in the api layer (the
// shared GetUserProfile) can't import the HUD component without a module
// cycle, so the HUD registers its lookup here and the api asks through it.
let resolver: (roomIndex: number) => boolean = () => false;

export const SetRpStaffResolver = (fn: (roomIndex: number) => boolean) =>
{
    resolver = fn;
}

export const ResolveRpStaff = (roomIndex: number): boolean =>
{
    try
    {
        return resolver(roomIndex);
    }
    catch(e)
    {
        return false;
    }
}
