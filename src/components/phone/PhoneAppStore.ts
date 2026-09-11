// The App Store's catalogue.
//
// What an app LOOKS like - its glyph, its plate colour - already lives in
// APP_DEFS (PhoneHomeView). This file is only the part the Store cares about:
// what a player can install, what it costs, and who is allowed to run it.
//
// PRICING is modelled but not yet charged. Every app in the catalogue is free
// today; the shape is here so an app can be priced in either currency without
// reworking the Store, and so that a paid app already knows the rule that
// matters - you buy it once. Removing an app keeps it in `owned`, so putting
// it back is always free. What is paid is a SINK: the coins or diamonds leave
// the economy, they are not credited to anyone.
//
// Before any app can actually carry a price, `owned` has to become the
// server's to decide. It is stored server-side now (user_phone.prefs, via
// usePhone) but as a document the CLIENT writes and the emulator never reads,
// so a player can still put any key in it - it is only trustworthy while
// everything is free. The moment an app costs something, ownership is the
// receipt and the server has to grant it, not just keep it.
//
// A CORPORATION app is listed for everyone but only runs for that
// corporation's employees; anyone else gets the unauthorised screen. Nothing
// in the catalogue carries one yet - the client has no corporation membership
// to check against, so `EmployedBy` answers false and the guard is dormant
// until that arrives.

export type AppPrice =
    { kind: 'free' } |
    { kind: 'coins', amount: number } |
    { kind: 'diamonds', amount: number };

export interface StoreApp
{
    // Matches the key in APP_DEFS, which supplies the icon and plate.
    key: string;
    category: string;
    // One line under the name in the list.
    blurb: string;
    // The headline the featured card carries - a promise, not a description.
    tagline: string;
    // At most one app is featured; it leads the Discover screen.
    featured?: boolean;
    // The app's own page.
    about: string;
    price: AppPrice;
    // When set, only this corporation's employees may open the app.
    corporation?: string;
}

// Apps that are part of the phone itself. They are never listed, never
// removable, and between them they always leave a way back to the Store.
export const CORE_APPS: string[] = [ 'Phone', 'Messages', 'Camera', 'App Store', 'Settings', 'Contacts', 'Wallet' ];

export const IsCoreApp = (key: string): boolean => (CORE_APPS.indexOf(key) >= 0);

export const STORE_APPS: StoreApp[] = [
    {
        key: 'Stocks',
        category: 'Finance',
        blurb: 'Who is running low, and buying.',
        tagline: 'Know who is buying, before you haul it.',
        featured: true,
        about: 'Every corporation in the city on one board: what they are holding, how much room they have left, and which way it is going. A morning underground or a field\u2019s worth of crops goes to whoever is running lowest \u2014 not to whoever happened to be closest.',
        price: { kind: 'free' }
    },
    {
        key: 'Mercury',
        category: 'Finance',
        blurb: 'Every coin, accounted for.',
        tagline: 'Every coin, accounted for.',
        about: 'Your checking and savings, and every movement in either of them. Wages as they land, interest as it accrues, transfers between your own two accounts, and every note counted out at an ATM \u2014 each with the balance it left behind. Mercury reads the accounts you already hold; you open those in your Wallet.',
        price: { kind: 'free' }
    },
    {
        key: 'Photos',
        tagline: 'Every shot you take, in one place.',
        category: 'Photo',
        blurb: 'Every shot you have taken.',
        about: 'Everything the Camera saves lands here. Make albums, share one with a friend so you both add to it, and set any shot as your wallpaper.',
        price: { kind: 'free' }
    },
    {
        key: 'Tunes',
        tagline: 'Know what the room is playing.',
        category: 'Music',
        blurb: 'What is playing in the room.',
        about: 'The song the room is playing, who queued it, and what is coming next.',
        price: { kind: 'free' }
    },
    {
        key: 'Calendar',
        tagline: 'Never miss what the city is doing.',
        category: 'Productivity',
        blurb: 'What is on in the city.',
        about: 'Events posted by staff, and your friends’ birthdays on the day. Reminders arrive ten minutes before an event starts.',
        price: { kind: 'free' }
    },
    {
        key: 'Notes',
        tagline: 'Write it down before you forget it.',
        category: 'Productivity',
        blurb: 'Write it down.',
        about: 'Notes to yourself, or shared with a friend so you can both write in them.',
        price: { kind: 'free' }
    },
    {
        key: 'Weather',
        tagline: 'The real San Francisco sky, in your pocket.',
        category: 'Weather',
        blurb: 'The real San Francisco sky.',
        about: 'Real weather from the real San Francisco, and the sky behind the city follows it.',
        price: { kind: 'free' }
    },
    {
        key: 'News',
        tagline: 'The city, as it happens.',
        category: 'News',
        blurb: 'Stories as they go up.',
        about: 'What the city is talking about, posted by hotel staff as it happens.',
        price: { kind: 'free' }
    }
];

export const FindStoreApp = (key: string): StoreApp => STORE_APPS.find(app => (app.key === key));

// Currency types as the purse uses them - the number is the wallet icon's
// filename (wallet/<type>.png), so a price shows the same coin or diamond the
// player already reads in the toolbar rather than spelling the currency out.
export const COINS_TYPE: number = -1;
export const DIAMONDS_TYPE: number = 5;

export const PriceCurrency = (price: AppPrice): number =>
{
    if(price.kind === 'coins') return COINS_TYPE;
    if(price.kind === 'diamonds') return DIAMONDS_TYPE;

    return null;
}

export const PriceAmount = (price: AppPrice): number => ((price.kind === 'free') ? 0 : price.amount);

// Whether the player works for a corporation. There is no membership on the
// client yet, so this is false for everyone and no catalogue app sets one.
export const EmployedBy = (corporation: string): boolean => false;
