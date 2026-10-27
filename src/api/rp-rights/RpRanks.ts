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

// Furni picked up in a public room (one PixelRP owns) goes into the inventory of
// a Builder or above, as theirs (emulator PixelRpRooms.BuilderTakesFurni).
export const TakesPublicRoomFurni = (): boolean => (GetSessionDataManager().securityLevel >= RP_RANK_BUILDER);

// The City Panel, Administrator and up (emulator rp_city_panel). The server
// refuses every City Panel packet below it; this only hides the way in.
export const CanOpenCityPanel = (): boolean => (GetSessionDataManager().securityLevel >= RP_RANK_ADMINISTRATOR);

// Every clothing set in Choose Your Look without buying it from the Clothing
// Store, every face included, for every staff rank - Builder up (emulator
// Habbo.WearsAnyClothing, which lets the saved look through).
export const WearsAnyClothing = (): boolean => (GetSessionDataManager().securityLevel >= RP_RANK_BUILDER);
