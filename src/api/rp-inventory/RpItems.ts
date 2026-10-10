import { ClothingIconUrl, ClothingShelfName, GetClothingCatalog, ParseClothingToken } from '../rp-clothing/RpClothingMessages';

// PixelRP backpack items: key -> display name + icon class (the icons live in
// assets/images/rp-items, the classes in RpInventoryView.scss). Shared by the
// Backpack and the City Panel's view of a player's backpack.

export const RP_ITEMS: Record<string, { name: string, cls: string }> = {
    smoothie: { name: 'Passive Smoothie', cls: 'rp-item-smoothie' },
    snack: { name: 'Snack', cls: 'rp-item-snack' },
    medkit: { name: 'Medkit', cls: 'rp-item-medkit' },
    // Police: a medkit from the locker, one at a time. Heals the same as a medkit.
    cop_medkit: { name: 'Cop Medkit', cls: 'rp-item-cop-medkit' },
    vip_token_31: { name: 'VIP Token (31 days)', cls: 'rp-item-vip-token-gold' },
    vip_token_14: { name: 'VIP Token (14 days)', cls: 'rp-item-vip-token-silver' },
    // Unlocks :spit for good; the art is the Blue Paint Splat furni's own icon.
    spit_token: { name: 'Spit Token', cls: 'rp-item-spit-token' },
    // Weapons: use one to equip it, and it is held while equipped.
    knife: { name: 'Knife', cls: 'rp-item-knife' },
    baseball_bat: { name: 'Baseball Bat', cls: 'rp-item-baseball-bat' },
    axe: { name: 'Axe', cls: 'rp-item-axe' },
    stun_gun: { name: 'Stun Gun', cls: 'rp-item-stun-gun' },
    // Carried by police: :cuff needs a pair in the backpack.
    handcuffs: { name: 'Handcuffs', cls: 'rp-item-handcuffs' },
    // Police: click to throw (or :fb) - stuns everyone around you. Spent on the throw.
    flashbang: { name: 'Flashbang', cls: 'rp-item-flashbang' },
    // Police: click to spray your target (or :ps) - sends them stumbling back. Spent on the spray.
    pepper_spray: { name: 'Pepper Spray', cls: 'rp-item-pepper-spray' },
};

export interface RpItemMeta { name: string; cls: string; iconUrl?: string }

// Clothing Store tokens (clothing:<id>:<edition>) are named from the last
// shelf received and wear the piece's own catalog icon.
export const ResolveRpItem = (item: string): RpItemMeta =>
{
    if(RP_ITEMS[item]) return RP_ITEMS[item];

    const token = ParseClothingToken(item);

    if(!token) return null;

    const listing = GetClothingCatalog().get(token.clothingId);
    const name = (listing ? ClothingShelfName(listing) : `#${ token.clothingId }`);
    const edition = ((listing && listing.ltdTotal > 0 && token.edition > 0) ? ` (LTD ${ token.edition } of ${ listing.ltdTotal })` : '');

    return { name: `Clothing Token · ${ name }${ edition }`, cls: 'rp-item-clothing-token', iconUrl: ClothingIconUrl(listing) };
}

