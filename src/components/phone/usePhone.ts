import { RpPhotoListEvent, RpPhotoListItem, RpRequestPhotoListComposer } from '@nitrots/nitro-renderer';
import { useEffect, useMemo, useState } from 'react';
import { useBetween } from 'use-between';
import { GetSessionDataManager, SendMessageComposer } from '../../api';
import { useFriends, useMessageEvent, useMessenger } from '../../hooks';

// Pinned / muted conversation preferences for the phone, persisted per
// account in localStorage. Muting a conversation hides it from the unread
// badge counts; pinning promotes it to the Messages app's pinned grid.
// Loaded lazily via ensureLoaded() because the session user id isn't known
// until after login.

interface PhonePrefs
{
    pinned: number[];
    muted: number[];
}

const storageKey = (userId: number) => `pixelrp.phone.prefs.${ userId }`;

const readPrefs = (userId: number): PhonePrefs =>
{
    try
    {
        const raw = window.localStorage.getItem(storageKey(userId));

        if(raw)
        {
            const parsed = JSON.parse(raw);

            return {
                pinned: (Array.isArray(parsed.pinned) ? parsed.pinned.filter((id: unknown) => (typeof id === 'number')) : []),
                muted: (Array.isArray(parsed.muted) ? parsed.muted.filter((id: unknown) => (typeof id === 'number')) : [])
            };
        }
    }

    catch(e) 
    {}

    return { pinned: [], muted: [] };
}

const usePhonePrefsState = () =>
{
    const [ loadedUserId, setLoadedUserId ] = useState<number>(0);
    const [ pinnedIds, setPinnedIds ] = useState<number[]>([]);
    const [ mutedIds, setMutedIds ] = useState<number[]>([]);

    const ensureLoaded = () =>
    {
        const userId = GetSessionDataManager().userId;

        if(!userId || (userId === loadedUserId)) return;

        const prefs = readPrefs(userId);

        setLoadedUserId(userId);
        setPinnedIds(prefs.pinned);
        setMutedIds(prefs.muted);
    }

    const save = (pinned: number[], muted: number[]) =>
    {
        const userId = GetSessionDataManager().userId;

        if(!userId) return;

        try
        {
            window.localStorage.setItem(storageKey(userId), JSON.stringify({ pinned, muted }));
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

            save(newValue, mutedIds);

            return newValue;
        });
    }

    const toggleMuted = (friendId: number) =>
    {
        setMutedIds(prevValue =>
        {
            const newValue = ((prevValue.indexOf(friendId) >= 0) ? prevValue.filter(id => (id !== friendId)) : [ ...prevValue, friendId ]);

            save(pinnedIds, newValue);

            return newValue;
        });
    }

    return { pinnedIds, mutedIds, setPinned, toggleMuted, ensureLoaded };
}

export const usePhonePrefs = () => useBetween(usePhonePrefsState);

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

    return { photos, photosLoaded, requestPhotos };
}

export const usePhonePhotos = () => useBetween(usePhonePhotosState);
