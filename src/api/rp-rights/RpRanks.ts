import { GetSessionDataManager } from '../nitro';

// PixelRP: the six ranks (users.rank, emulator migration 285).
//
// The renderer's SecurityLevel names are stock Habbo's nine and no longer line
// up - 6 is PLAYER_SUPPORT there and Developer here - so PixelRP checks use
// these. Rank 5 is still the staff line the renderer's isModerator draws.
export const RP_RANK_BUILDER: number = 2;
export const RP_RANK_TRIAL_MODERATOR: number = 3;
export const RP_RANK_MODERATOR: number = 4;
export const RP_RANK_ADMINISTRATOR: number = 5;
export const RP_RANK_DEVELOPER: number = 6;

// Renaming a furni and moving it to another category from the Furni Shop, from
// Builder up (Habbo.CanEditShop). The Function tool stays on rp_furni_function
// (CanUseFurniFunction).
export const CanEditShop = (): boolean => (GetSessionDataManager().securityLevel >= RP_RANK_BUILDER);
