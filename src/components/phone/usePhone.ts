import { RpDeletePhotoComposer, RpPhotoListEvent, RpPhotoListItem, RpRequestPhotoListComposer, RpSaveScreenshotComposer, RpUpdatePhotoComposer } from '@nitrots/nitro-renderer';
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

// The canonical app roster. New apps get appended to the stored layout on
// load; unknown stored keys (renamed/removed apps) are dropped.
export const DEFAULT_GRID_APPS: string[] = [ 'Contacts', 'Settings', 'Characters', 'App Store', 'Mercury', 'Sitch' ];
export const DEFAULT_DOCK_APPS: string[] = [ 'Messages', 'Camera', 'Photos' ];
export const DOCK_CAPACITY: number = 4;

export type PhoneTheme = 'auto' | 'light' | 'dark';

interface PhonePrefs
{
    pinned: number[];
    muted: number[];
    grid: string[];
    dock: string[];
    theme: PhoneTheme;
}

const storageKey = (userId: number) => `pixelrp.phone.prefs.${ userId }`;

// Reconcile a stored layout with the current app roster: keep the player's
// order for apps that still exist, drop strays, slot new apps into their
// default zone (grid overflow catches a full dock).
const mergeAppOrder = (storedGrid: string[], storedDock: string[]): { grid: string[], dock: string[] } =>
{
    const known = [ ...DEFAULT_GRID_APPS, ...DEFAULT_DOCK_APPS ];
    const dock = storedDock.filter(key => (known.indexOf(key) >= 0)).slice(0, DOCK_CAPACITY);
    const grid = storedGrid.filter(key => ((known.indexOf(key) >= 0) && (dock.indexOf(key) === -1)));

    for(const key of known)
    {
        if((grid.indexOf(key) >= 0) || (dock.indexOf(key) >= 0)) continue;

        if((DEFAULT_DOCK_APPS.indexOf(key) >= 0) && (dock.length < DOCK_CAPACITY)) dock.push(key);
        else grid.push(key);
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
            const { grid, dock } = mergeAppOrder(readStrings(parsed.grid), (Array.isArray(parsed.dock) ? readStrings(parsed.dock) : [ ...DEFAULT_DOCK_APPS ]));

            return {
                pinned: (Array.isArray(parsed.pinned) ? parsed.pinned.filter((id: unknown) => (typeof id === 'number')) : []),
                muted: (Array.isArray(parsed.muted) ? parsed.muted.filter((id: unknown) => (typeof id === 'number')) : []),
                grid,
                dock,
                theme: (((parsed.theme === 'light') || (parsed.theme === 'dark')) ? parsed.theme : 'auto')
            };
        }
    }

    catch(e)
    {}

    return { pinned: [], muted: [], grid: [ ...DEFAULT_GRID_APPS ], dock: [ ...DEFAULT_DOCK_APPS ], theme: 'auto' };
}

const usePhonePrefsState = () =>
{
    const [ loadedUserId, setLoadedUserId ] = useState<number>(0);
    const [ pinnedIds, setPinnedIds ] = useState<number[]>([]);
    const [ mutedIds, setMutedIds ] = useState<number[]>([]);
    const [ gridOrder, setGridOrder ] = useState<string[]>([ ...DEFAULT_GRID_APPS ]);
    const [ dockOrder, setDockOrder ] = useState<string[]>([ ...DEFAULT_DOCK_APPS ]);
    const [ theme, setThemeState ] = useState<PhoneTheme>('auto');

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
    }

    const save = (prefs: Partial<PhonePrefs>) =>
    {
        const userId = GetSessionDataManager().userId;

        if(!userId) return;

        try
        {
            window.localStorage.setItem(storageKey(userId), JSON.stringify({
                pinned: (prefs.pinned ?? pinnedIds),
                muted: (prefs.muted ?? mutedIds),
                grid: (prefs.grid ?? gridOrder),
                dock: (prefs.dock ?? dockOrder),
                theme: (prefs.theme ?? theme)
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

    // Drag-reorder of the home screen (grid + dock zones together).
    const setAppOrder = (grid: string[], dock: string[]) =>
    {
        setGridOrder(grid);
        setDockOrder(dock);
        save({ grid, dock });
    }

    return { pinnedIds, mutedIds, gridOrder, dockOrder, theme, setPinned, reorderPinned, toggleMuted, setAppOrder, setTheme, ensureLoaded };
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

// Badge counts shared by the toolbar button and the phone home screen. The
// Messages badge only counts unread direct messages from friends — group
// chats (participant.id <= 0), muted conversations and hidden threads never
// count. The Contacts badge carries pending friend requests.
export const usePhoneBadges = () =>
{
    const { visibleThreads = [] } = useMessenger();
    const { requests = [], getFriend = null } = useFriends();
    const { mutedIds, ensureLoaded } = usePhonePrefs();

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

    return { unreadMessages, requestCount: requests.length };
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
    const saveScreenshot = (base64Url: string) =>
    {
        const composer = new RpSaveScreenshotComposer();

        composer.assignBase64(base64Url);

        SendMessageComposer(composer);
    }

    return { photos, photosLoaded, requestPhotos, deletePhoto, updatePhoto, saveScreenshot };
}

export const usePhonePhotos = () => useBetween(usePhonePhotosState);
