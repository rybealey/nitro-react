import { RpAirplaneModeEvent, RpAlbumListEvent, RpAlbumListItem, RpAlbumMemberComposer, RpAlbumPhoto, RpAlbumPhotoComposer, RpAlbumPhotosEvent, RpCreateAlbumComposer, RpDeleteAlbumComposer, RpDeletePhotoComposer, RpPhotoListEvent, RpPhotoListItem, RpRequestAlbumPhotosComposer, RpRequestAlbumsComposer, RpRequestPhotoListComposer, RpSaveScreenshotComposer, RpSetAirplaneModeComposer, RpUpdatePhotoComposer } from '@nitrots/nitro-renderer';
import { useEffect, useMemo, useState } from 'react';
import { useBetween } from 'use-between';
import { GetConfiguration, GetSessionDataManager, SendMessageComposer } from '../../api';
import { useFriends, useMessageEvent, useMessenger } from '../../hooks';

// Photo messages ride the normal messenger text channel as a marker plus
// the photo's URL. Only URLs under the hotel's own camera base render as
// photos — anything else displays as the literal text it is, so nobody can
// make someone's client load arbitrary images.
export const PHOTO_MESSAGE_PREFIX: string = '[photo]';

export const MakePhotoMessage = (url: string): string => `${ PHOTO_MESSAGE_PREFIX }${ url }`;

export const ParsePhotoMessage = (message: string): string =>
{
    if(!message || !message.startsWith(PHOTO_MESSAGE_PREFIX)) return null;

    const url = message.substring(PHOTO_MESSAGE_PREFIX.length).trim();
    const cameraBase = GetConfiguration<string>('camera.url', '');

    if(!cameraBase || !url.startsWith(cameraBase)) return null;

    return url;
}

// Pinned / muted conversation preferences plus home-screen layout for the
// phone, persisted per account in localStorage. Muting a conversation hides
// it from the unread badge counts; pinning promotes it to the Messages
// app's pinned grid; the app order is the player's drag arrangement.
// Loaded lazily via ensureLoaded() because the session user id isn't known
// until after login.

// The canonical app roster + default arrangement (mirrors the design's home
// screen). New apps get appended to the stored layout on load; unknown stored
// keys (renamed/removed apps) are dropped.
export const DEFAULT_DOCK_APPS: string[] = [ 'Phone', 'Messages', 'Camera', 'App Store' ];
export const DEFAULT_GRID_APPS: string[] = [ 'Contacts', 'Photos', 'Stocks', 'Music', 'Wallet', 'Calendar', 'Tasks', 'Notes', 'Weather', 'News', 'Translate', 'Settings' ];
export const DOCK_CAPACITY: number = 4;

// Fixed home-screen slot matrix (iOS-style): apps sit in any slot, empty
// slots ('' entries) are allowed anywhere - the grid is NOT packed.
export const GRID_COLS: number = 4;
export const GRID_ROWS: number = 5;
export const GRID_SLOTS: number = (GRID_COLS * GRID_ROWS);

const packIntoSlots = (apps: string[]): string[] =>
{
    const slots = new Array<string>(GRID_SLOTS).fill('');

    apps.slice(0, GRID_SLOTS).forEach((key, index) => (slots[index] = key));

    return slots;
}

// Bump when the default roster changes enough that stored layouts should be
// discarded and reset to the new arrangement (rather than merged). v3: the
// grid became a fixed slot matrix with gaps; v2 dense lists migrate by
// packing into the first slots (arrangement preserved).
const PHONE_LAYOUT_VERSION: number = 3;

export type PhoneTheme = 'auto' | 'light' | 'dark';

// Where the phone pops up on the client when opened.
export type PhonePosition = 'left' | 'center' | 'right';

interface PhonePrefs
{
    pinned: number[];
    muted: number[];
    grid: string[];
    dock: string[];
    theme: PhoneTheme;
    position: PhonePosition;
}

const storageKey = (userId: number) => `pixelrp.phone.prefs.${ userId }`;

// Reconcile a stored slot layout with the current app roster: keep every
// surviving app in its exact slot, drop strays and duplicates, and place new
// apps into their default zone (first empty grid slot catches a full dock).
const mergeAppOrder = (storedGrid: string[], storedDock: string[]): { grid: string[], dock: string[] } =>
{
    const known = [ ...DEFAULT_GRID_APPS, ...DEFAULT_DOCK_APPS ];
    const dock = storedDock.filter(key => (known.indexOf(key) >= 0)).slice(0, DOCK_CAPACITY);
    const seen = new Set<string>(dock);
    const grid = new Array<string>(GRID_SLOTS).fill('');

    storedGrid.slice(0, GRID_SLOTS).forEach((key, index) =>
    {
        if(!key || (known.indexOf(key) === -1) || seen.has(key)) return;

        grid[index] = key;
        seen.add(key);
    });

    for(const key of known)
    {
        if(seen.has(key)) continue;

        if((DEFAULT_DOCK_APPS.indexOf(key) >= 0) && (dock.length < DOCK_CAPACITY))
        {
            dock.push(key);
            seen.add(key);
            continue;
        }

        const slot = grid.indexOf('');

        if(slot >= 0)
        {
            grid[slot] = key;
            seen.add(key);
        }
    }

    return { grid, dock };
}

const readPrefs = (userId: number): PhonePrefs =>
{
    try
    {
        const raw = window.localStorage.getItem(storageKey(userId));

        if(raw)
        {
            const parsed = JSON.parse(raw);
            const readStrings = (value: unknown) => (Array.isArray(value) ? value.filter((key: unknown) => (typeof key === 'string')) : []);
            // A stored layout from an older roster version is discarded so the
            // new default arrangement shows; pins/mutes/theme are preserved.
            // Exception: a v2 dense list migrates into the slot matrix packed
            // top-left, keeping the player's arrangement.
            const storedDock = (Array.isArray(parsed.dock) ? readStrings(parsed.dock) : [ ...DEFAULT_DOCK_APPS ]);
            const { grid, dock } = ((parsed.layout === PHONE_LAYOUT_VERSION)
                ? mergeAppOrder(readStrings(parsed.grid), storedDock)
                : ((parsed.layout === 2)
                    ? mergeAppOrder(packIntoSlots(readStrings(parsed.grid).filter(key => (key !== ''))), storedDock)
                    : { grid: packIntoSlots(DEFAULT_GRID_APPS), dock: [ ...DEFAULT_DOCK_APPS ] }));

            return {
                pinned: (Array.isArray(parsed.pinned) ? parsed.pinned.filter((id: unknown) => (typeof id === 'number')) : []),
                muted: (Array.isArray(parsed.muted) ? parsed.muted.filter((id: unknown) => (typeof id === 'number')) : []),
                grid,
                dock,
                theme: (((parsed.theme === 'light') || (parsed.theme === 'dark')) ? parsed.theme : 'auto'),
                position: (((parsed.position === 'left') || (parsed.position === 'right') || (parsed.position === 'center')) ? parsed.position : 'right')
            };
        }
    }

    catch(e)
    {}

    return { pinned: [], muted: [], grid: packIntoSlots(DEFAULT_GRID_APPS), dock: [ ...DEFAULT_DOCK_APPS ], theme: 'auto', position: 'right' };
}

// Synchronous read of just the saved open-position, straight from storage -
// used by PhoneView on open, before the React prefs state may have loaded.
export const ReadPhonePosition = (): PhonePosition =>
{
    try
    {
        const userId = GetSessionDataManager().userId;

        if(userId)
        {
            const raw = window.localStorage.getItem(storageKey(userId));

            if(raw)
            {
                const value = JSON.parse(raw).position;

                if((value === 'left') || (value === 'right') || (value === 'center')) return value;
            }
        }
    }

    catch(e)
    {}

    return 'right';
}

const usePhonePrefsState = () =>
{
    const [ loadedUserId, setLoadedUserId ] = useState<number>(0);
    const [ pinnedIds, setPinnedIds ] = useState<number[]>([]);
    const [ mutedIds, setMutedIds ] = useState<number[]>([]);
    const [ gridOrder, setGridOrder ] = useState<string[]>(packIntoSlots(DEFAULT_GRID_APPS));
    const [ dockOrder, setDockOrder ] = useState<string[]>([ ...DEFAULT_DOCK_APPS ]);
    const [ theme, setThemeState ] = useState<PhoneTheme>('auto');
    const [ position, setPositionState ] = useState<PhonePosition>('right');

    const ensureLoaded = () =>
    {
        const userId = GetSessionDataManager().userId;

        if(!userId || (userId === loadedUserId)) return;

        const prefs = readPrefs(userId);

        setLoadedUserId(userId);
        setPinnedIds(prefs.pinned);
        setMutedIds(prefs.muted);
        setGridOrder(prefs.grid);
        setDockOrder(prefs.dock);
        setThemeState(prefs.theme);
        setPositionState(prefs.position);
    }

    const save = (prefs: Partial<PhonePrefs>) =>
    {
        const userId = GetSessionDataManager().userId;

        if(!userId) return;

        try
        {
            window.localStorage.setItem(storageKey(userId), JSON.stringify({
                layout: PHONE_LAYOUT_VERSION,
                pinned: (prefs.pinned ?? pinnedIds),
                muted: (prefs.muted ?? mutedIds),
                grid: (prefs.grid ?? gridOrder),
                dock: (prefs.dock ?? dockOrder),
                theme: (prefs.theme ?? theme),
                position: (prefs.position ?? position)
            }));
        }

        catch(e)
        {}
    }

    const setPinned = (friendId: number, flag: boolean) =>
    {
        setPinnedIds(prevValue =>
        {
            const newValue = prevValue.filter(id => (id !== friendId));

            if(flag) newValue.push(friendId);

            save({ pinned: newValue });

            return newValue;
        });
    }

    // Drag-reorder of the Messages pinned grid: replaces the pin order
    // wholesale (same ids, new sequence).
    const reorderPinned = (order: number[]) =>
    {
        setPinnedIds(prevValue =>
        {
            if((order.length !== prevValue.length) || order.some(id => (prevValue.indexOf(id) === -1))) return prevValue;

            save({ pinned: order });

            return order;
        });
    }

    const toggleMuted = (friendId: number) =>
    {
        setMutedIds(prevValue =>
        {
            const newValue = ((prevValue.indexOf(friendId) >= 0) ? prevValue.filter(id => (id !== friendId)) : [ ...prevValue, friendId ]);

            save({ muted: newValue });

            return newValue;
        });
    }

    // Appearance (Settings app): auto follows the system, light/dark pin it.
    const setTheme = (nextTheme: PhoneTheme) =>
    {
        setThemeState(nextTheme);
        save({ theme: nextTheme });
    }

    // Where the phone opens on the client (left / center / right). Read by
    // PhoneView when the phone is shown.
    const setPosition = (nextPosition: PhonePosition) =>
    {
        setPositionState(nextPosition);
        save({ position: nextPosition });
    }

    // Drag-rearrange of the home screen (grid slot matrix + dock together).
    const setAppOrder = (grid: string[], dock: string[]) =>
    {
        setGridOrder(grid);
        setDockOrder(dock);
        save({ grid, dock });
    }

    return { pinnedIds, mutedIds, gridOrder, dockOrder, theme, position, setPinned, reorderPinned, toggleMuted, setAppOrder, setTheme, setPosition, ensureLoaded };
}

export const usePhonePrefs = () => useBetween(usePhonePrefsState);

// Resolves the Appearance setting to the actual palette: auto tracks the
// system's prefers-color-scheme live; light/dark pin it.
const usePhoneThemeState = () =>
{
    const { theme } = usePhonePrefs();
    const [ systemDark, setSystemDark ] = useState<boolean>(() => (window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)').matches : false));

    useEffect(() =>
    {
        if(!window.matchMedia) return;

        const media = window.matchMedia('(prefers-color-scheme: dark)');
        const onChange = (event: MediaQueryListEvent) => setSystemDark(event.matches);

        media.addEventListener('change', onChange);

        return () => media.removeEventListener('change', onChange);
    }, []);

    const resolvedDark = ((theme === 'dark') || ((theme === 'auto') && systemDark));

    return { resolvedDark, systemDark };
}

export const usePhoneTheme = () => useBetween(usePhoneThemeState);

// Airplane mode: a per-account flag persisted server-side. The server pushes
// the saved state on login; toggling it sends the new value back. While on,
// incoming friend requests are hidden in Contacts and DMs to the player bounce
// with a "Not Delivered" receipt (both enforced server-side / here). Kept
// alive from the toolbar via usePhoneBadges so the login push is never missed.
const useAirplaneState = () =>
{
    const [ enabled, setEnabledState ] = useState<boolean>(false);

    useMessageEvent<RpAirplaneModeEvent>(RpAirplaneModeEvent, event =>
    {
        const parser = event.getParser();

        if(!parser) return;

        setEnabledState(!!parser.enabled);
    });

    const setEnabled = (flag: boolean) =>
    {
        setEnabledState(flag);
        SendMessageComposer(new RpSetAirplaneModeComposer(flag));
    }

    return { enabled, setEnabled };
}

export const useAirplane = () => useBetween(useAirplaneState);

// Badge counts shared by the toolbar button and the phone home screen. The
// Messages badge only counts unread direct messages from friends — group
// chats (participant.id <= 0), muted conversations and hidden threads never
// count. The Contacts badge carries pending friend requests.
export const usePhoneBadges = () =>
{
    const { visibleThreads = [] } = useMessenger();
    const { requests = [], getFriend = null } = useFriends();
    const { mutedIds, ensureLoaded } = usePhonePrefs();
    const { enabled: airplaneMode = false } = useAirplane();

    // Muted ids must be loaded before the badge math is right; by the time
    // any thread or request exists the session user id is known.
    useEffect(() =>
    {
        if(visibleThreads.length || requests.length) ensureLoaded();
    }, [ visibleThreads, requests, ensureLoaded ]);

    const unreadMessages = useMemo(() =>
    {
        let count = 0;

        for(const thread of visibleThreads)
        {
            if(!thread.participant || (thread.participant.id <= 0)) continue;

            if(mutedIds.indexOf(thread.participant.id) >= 0) continue;

            if(!getFriend || !getFriend(thread.participant.id)) continue;

            count += thread.unreadCount;
        }

        return count;
    }, [ visibleThreads, mutedIds, getFriend ]);

    // Airplane mode hides incoming friend requests, so they don't count.
    return { unreadMessages, requestCount: (airplaneMode ? 0 : requests.length) };
}

// The player's photo library (camera_web rows), shared between the Camera
// and Photos apps so a fresh save shows up everywhere at once.
const usePhonePhotosState = () =>
{
    const [ photos, setPhotos ] = useState<RpPhotoListItem[]>([]);
    const [ photosLoaded, setPhotosLoaded ] = useState(false);

    useMessageEvent<RpPhotoListEvent>(RpPhotoListEvent, event =>
    {
        setPhotos(event.getParser().photos);
        setPhotosLoaded(true);
    });

    const requestPhotos = () => SendMessageComposer(new RpRequestPhotoListComposer());

    // Both reply with the refreshed library (the same RpPhotoListEvent), so
    // the grid/viewer update as soon as the server confirms.
    const deletePhoto = (photoId: number) => SendMessageComposer(new RpDeletePhotoComposer(photoId));

    const updatePhoto = (photoId: number, base64Url: string) =>
    {
        const composer = new RpUpdatePhotoComposer(photoId);

        composer.assignBase64(base64Url);

        SendMessageComposer(composer);
    }

    // Side-button screenshot: files the PNG straight into the library (no
    // room, no furni); the reply refreshes the list.
    // kind: 'screenshot' = the side-button phone-screen capture, 'saved' = a
    // photo received in a DM filed into the library. Recorded in the photo's
    // metadata server-side.
    const saveScreenshot = (base64Url: string, kind: 'screenshot' | 'saved' = 'screenshot') =>
    {
        const composer = new RpSaveScreenshotComposer((kind === 'saved') ? 1 : 0);

        composer.assignBase64(base64Url);

        SendMessageComposer(composer);
    }

    return { photos, photosLoaded, requestPhotos, deletePhoto, updatePhoto, saveScreenshot };
}

export const usePhonePhotos = () => useBetween(usePhonePhotosState);

// Photo albums for the Photos app's Collections tab. Personal albums hold
// the player's own photos; shared albums carry invited friends who can view
// and contribute. Every mutation replies with the refreshed album list, so
// state always comes from the server. The Screenshots album, People and
// Places groupings are computed client-side from photo metadata - they have
// no server state.
const usePhoneAlbumsState = () =>
{
    const [ albums, setAlbums ] = useState<RpAlbumListItem[]>([]);
    const [ albumsLoaded, setAlbumsLoaded ] = useState(false);
    const [ albumPhotos, setAlbumPhotos ] = useState<Record<number, RpAlbumPhoto[]>>({});

    useMessageEvent<RpAlbumListEvent>(RpAlbumListEvent, event =>
    {
        const parser = event.getParser();

        if(!parser) return;

        setAlbums(parser.albums);
        setAlbumsLoaded(true);
    });

    useMessageEvent<RpAlbumPhotosEvent>(RpAlbumPhotosEvent, event =>
    {
        const parser = event.getParser();

        if(!parser || (parser.albumId <= 0)) return;

        setAlbumPhotos(prevValue => ({ ...prevValue, [parser.albumId]: parser.photos }));
    });

    const requestAlbums = () => SendMessageComposer(new RpRequestAlbumsComposer());

    const requestAlbumPhotos = (albumId: number) => SendMessageComposer(new RpRequestAlbumPhotosComposer(albumId));

    const createAlbum = (name: string, shared: boolean, memberIds: number[] = []) =>
    {
        const trimmed = (name || '').trim();

        if(!trimmed.length) return;

        SendMessageComposer(new RpCreateAlbumComposer(trimmed, shared, memberIds));
    }

    const deleteAlbum = (albumId: number) => SendMessageComposer(new RpDeleteAlbumComposer(albumId));

    const setAlbumMember = (albumId: number, userId: number, add: boolean) => SendMessageComposer(new RpAlbumMemberComposer(albumId, userId, add));

    const setAlbumPhoto = (albumId: number, photoId: number, add: boolean) => SendMessageComposer(new RpAlbumPhotoComposer(albumId, photoId, add));

    return { albums, albumsLoaded, albumPhotos, requestAlbums, requestAlbumPhotos, createAlbum, deleteAlbum, setAlbumMember, setAlbumPhoto };
}

export const usePhoneAlbums = () => useBetween(usePhoneAlbumsState);
