import { NewConsoleMessageEvent, RpAlbumListEvent, RpAlbumListItem } from '@nitrots/nitro-renderer';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useBetween } from 'use-between';
import { GetSessionDataManager } from '../../api';
import { HotelDate } from '../../api/prefs/HotelTime';
import { FormatClock } from '../../api/prefs/UnitsStore';
import { CalendarEvent, RpCalendarEvent } from '../../api/rp-phone/RpCalendarMessages';
import { NewsPost, RpNewsEvent } from '../../api/rp-phone/RpNewsMessages';
import { NotifyApp, NotifyKind, NotifyPush, RpNotificationEvent } from '../../api/rp-phone/RpNotificationMessages';
import { useFriends, useMessageEvent, useMessenger } from '../../hooks';
import { ParsePhotoMessage, PhoneNotify, useAirplane, usePhoneBadges, usePhonePrefs } from './usePhone';

// The phone's notifications.
//
// Four of the six apps are told by the server the moment something happens
// (RpNotificationEvent). The other two need nobody: Messages and Contacts
// already track unread threads and pending requests, so this hook watches
// those and raises its own.
//
// Nothing is kept on the server. The list lives here, persisted per account
// like the rest of the phone's preferences, which is what lets a badge
// survive a page reload and what makes "seen" a purely local idea.

// Which app tile each notification belongs to, in the home screen's spelling.
export const NOTIFY_APP_TILES: Record<NotifyApp, string> = {
    photos: 'Photos',
    contacts: 'Contacts',
    calendar: 'Calendar',
    notes: 'Notes',
    news: 'News',
    messages: 'Messages'
};

export interface PhoneNotification
{
    // local, monotonic - the order things arrived in
    id: number;
    app: NotifyApp;
    kind: NotifyKind;
    subject: string;
    actor: string;
    targetId: number;
    extra: number;
    // when it arrived, epoch ms
    at: number;
    seen: boolean;
    // how many of the same thing collapsed into this one ("3 new photos")
    count: number;
}

// The Center holds a day or two of history, not a lifetime.
const MAX_KEPT: number = 40;
// How many banners stack before the rest are only in the Center.
const MAX_BANNERS: number = 3;
// How long a banner sits there before it leaves, matching iOS.
const BANNER_MS: number = 5000;

const storageKey = (userId: number) => `pixelrp.phone.notifications.${ userId }`;

const read = (userId: number): PhoneNotification[] =>
{
    try
    {
        const raw = window.localStorage.getItem(storageKey(userId));

        if(!raw) return [];

        const parsed = JSON.parse(raw);

        if(!Array.isArray(parsed)) return [];

        return parsed
            .filter(item => (item && (typeof item.id === 'number') && (typeof item.app === 'string') && (typeof item.kind === 'string')))
            .map((item): PhoneNotification => ({
                id: item.id,
                app: item.app,
                kind: item.kind,
                subject: ((typeof item.subject === 'string') ? item.subject : ''),
                actor: ((typeof item.actor === 'string') ? item.actor : ''),
                targetId: ((typeof item.targetId === 'number') ? item.targetId : 0),
                extra: ((typeof item.extra === 'number') ? item.extra : 0),
                at: ((typeof item.at === 'number') ? item.at : Date.now()),
                seen: (item.seen === true),
                count: ((typeof item.count === 'number') && (item.count > 0)) ? item.count : 1
            }))
            .slice(0, MAX_KEPT);
    }

    catch(e)
    {
        return [];
    }
}

// ---- wording ----------------------------------------------------------
// Every line the player reads is written here. The server sends facts, so
// this is the only place a notification's copy exists - and the only place
// that has to know how several of one thing read as one.

export interface NotifyContext
{
    events: Record<number, CalendarEvent>;
    posts: Record<number, NewsPost>;
    albums: Record<number, RpAlbumListItem>;
}

const dayAndTime = (unix: number): string =>
{
    const date = HotelDate(unix * 1000);
    const today = HotelDate();
    const weekday = [ 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday' ][date.getDay()];
    const sameDay = ((date.getFullYear() === today.getFullYear()) && (date.getMonth() === today.getMonth()) && (date.getDate() === today.getDate()));

    return `${ sameDay ? 'Today' : weekday } ${ FormatClock(unix * 1000) }`;
}

// "Sky Lounge" when the event has a room, nothing when it does not - so the
// separator never dangles.
const withRoom = (lead: string, event: CalendarEvent): string => ((event && event.roomName) ? `${ lead } · ${ event.roomName }` : lead);

export const NotificationText = (notification: PhoneNotification, context: NotifyContext): { title: string, body: string } =>
{
    const { kind, subject, actor, targetId, extra, count } = notification;
    const event = context.events[targetId];
    const post = context.posts[targetId];
    const album = context.albums[targetId];

    switch(kind)
    {
        case 'album_invite':
            return {
                title: `${ actor } invited you to ${ subject }`,
                body: (album ? `Shared album · ${ album.photoCount } ${ (album.photoCount === 1) ? 'photo' : 'photos' }` : 'Shared album')
            };
        case 'album_photo':
            return {
                title: ((count > 1) ? `${ count } new photos in ${ subject }` : `A new photo in ${ subject }`),
                body: `Added by ${ actor }`
            };
        case 'note_shared':
            return { title: `${ actor } shared a note with you`, body: (subject || 'Untitled note') };
        case 'note_updated':
            return { title: `${ subject || 'A note' } was updated`, body: `Edited by ${ actor }` };
        case 'event_new':
            return { title: `New event: ${ subject }`, body: (event ? withRoom(dayAndTime(event.startsAt), event) : `Posted by ${ actor }`) };
        case 'event_soon':
            return { title: `${ subject } starts in 10 minutes`, body: (event ? withRoom(FormatClock(event.startsAt * 1000), event) : '') };
        case 'event_changed':
            // extra carries the time it moved FROM; 0 means something else
            // about it changed and there is no "was" to report.
            return ((extra > 0) && event)
                ? { title: `${ subject } moved to ${ FormatClock(event.startsAt * 1000) }`, body: withRoom(`Was ${ FormatClock(extra * 1000) }`, event) }
                : { title: `${ subject } was changed`, body: (event ? withRoom(dayAndTime(event.startsAt), event) : 'Open Calendar for the details') };
        case 'event_cancelled':
            return { title: `${ subject } was cancelled`, body: 'Taken off the calendar' };
        case 'story':
            return { title: subject, body: (post ? `${ post.category } · by ${ actor }` : `PixelRP News · by ${ actor }`) };
        case 'message':
            // the sender is the headline and the message is the line under it,
            // the way a phone shows a text
            return { title: actor, body: subject };
        case 'friend_request':
            return { title: `${ subject } sent you a friend request`, body: 'Accept or ignore in Contacts' };
        case 'friend_on':
            return { title: `${ subject } is online`, body: '' };
        case 'friend_off':
            return { title: `${ subject } went offline`, body: '' };
        default:
            return { title: subject, body: '' };
    }
}

/// Whether a notification of this kind is something the player asked to see.
const wanted = (app: NotifyApp, kind: NotifyKind, notify: PhoneNotify): boolean =>
{
    if(!notify.allow) return false;
    if((kind === 'event_soon') && !notify.reminders) return false;
    if(((kind === 'friend_on') || (kind === 'friend_off')) && !notify.friends) return false;

    return notify[app];
}

/// A push as it is kept: `transient` says how a push behaves on arrival, so
/// it has no place in the list itself.
const asNotification = (push: NotifyPush, id: number, seen: boolean, count: number): PhoneNotification =>
    ({ id, app: push.app, kind: push.kind, subject: push.subject, actor: push.actor, targetId: push.targetId, extra: push.extra, at: Date.now(), seen, count });

// Kinds that are a banner and nothing more: there is no album to open, no
// note to read - by the time you look, the fact has already changed.
const TRANSIENT_KINDS: NotifyKind[] = [ 'friend_on', 'friend_off' ];

const usePhoneNotificationsState = () =>
{
    const { notify, ensureLoaded } = usePhonePrefs();
    const { enabled: airplaneOn = false } = useAirplane();
    const { requests = [], friends = [], getFriend = null } = useFriends();
    const { getMessageThread = null } = useMessenger();
    const [ notifications, setNotifications ] = useState<PhoneNotification[]>([]);
    const [ loadedUserId, setLoadedUserId ] = useState<number>(0);
    // ids currently on screen as banners, newest last
    const [ bannerIds, setBannerIds ] = useState<number[]>([]);
    // the calendar / feed / album list, purely so a notification can be
    // worded precisely ("moved to 22:00 · Sky Lounge")
    const [ events, setEvents ] = useState<Record<number, CalendarEvent>>({});
    const [ posts, setPosts ] = useState<Record<number, NewsPost>>({});
    const [ albums, setAlbums ] = useState<Record<number, RpAlbumListItem>>({});
    // The list as it stands right now. Arrivals have to decide whether they
    // are a repeat of something already there BEFORE they can queue a banner
    // for it, and a state updater is the wrong place to start another state
    // update from - so the list is kept here too and read synchronously.
    const listRef = useRef<PhoneNotification[]>([]);
    const nextId = useRef<number>(1);
    const userIdRef = useRef<number>(0);
    // The packet handlers live as long as the session, so they read the
    // current preferences through refs rather than through whatever they
    // closed over when they were created.
    const notifyRef = useRef<PhoneNotify>(notify);
    const airplaneRef = useRef<boolean>(airplaneOn);

    notifyRef.current = notify;
    airplaneRef.current = airplaneOn;

    /// The one way the list changes: ref, state and storage together.
    const commit = useCallback((list: PhoneNotification[]) =>
    {
        listRef.current = list;

        setNotifications(list);

        if(!userIdRef.current) return;

        try
        {
            // Transient banners are on screen and nowhere else - they must
            // never come back from storage after a reload.
            window.localStorage.setItem(storageKey(userIdRef.current), JSON.stringify(list.filter(entry => (TRANSIENT_KINDS.indexOf(entry.kind) === -1))));
        }

        catch(e)
        {}
    }, []);

    const load = useCallback(() =>
    {
        const userId = GetSessionDataManager().userId;

        if(!userId || (userId === loadedUserId)) return;

        const stored = read(userId);

        userIdRef.current = userId;
        listRef.current = stored;
        nextId.current = (stored.reduce((highest, item) => Math.max(highest, item.id), 0) + 1);

        setLoadedUserId(userId);
        setNotifications(stored);
        ensureLoaded();
    }, [ loadedUserId, ensureLoaded ]);

    useEffect(() => load(), [ load ]);

    /// Puts a banner on screen for a while. A repeat replaces its own banner
    /// rather than stacking a second one.
    const raise = useCallback((id: number) =>
    {
        setBannerIds(prevValue => [ ...prevValue.filter(entry => (entry !== id)), id ].slice(-MAX_BANNERS));

        window.setTimeout(() => setBannerIds(prevValue => prevValue.filter(entry => (entry !== id))), BANNER_MS);
    }, []);

    // ---- arrival ------------------------------------------------------

    const add = useCallback((push: NotifyPush) =>
    {
        if(!wanted(push.app, push.kind, notifyRef.current)) return;

        const transient = (push.transient || (TRANSIENT_KINDS.indexOf(push.kind) >= 0));
        // Airplane mode silences the banner. A kept notification still lands,
        // so the badge and the Center have it when the player looks.
        const silent = airplaneRef.current;

        if(transient)
        {
            // Nothing to go back and read, so it is a banner and no more: it
            // joins the list only for as long as it is on screen, and never
            // reaches storage or a badge.
            if(silent) return;

            const id = nextId.current++;

            commit([ asNotification(push, id, true, 1), ...listRef.current ]);
            raise(id);

            window.setTimeout(() => commit(listRef.current.filter(entry => (entry.id !== id))), BANNER_MS);

            return;
        }

        // Several of the same thing about the same thing are one notification
        // with a count, not a pile: three photos dropped into one album reads
        // as "3 new photos in Rooftop Nights". Only while it is still unseen -
        // once read, the next one starts afresh.
        const existing = listRef.current.find(entry => (!entry.seen && (entry.app === push.app) && (entry.kind === push.kind) && (entry.targetId === push.targetId)));
        const id = (existing ? existing.id : nextId.current++);
        const arrival = asNotification(push, id, false, (existing ? (existing.count + 1) : 1));

        commit([ arrival, ...listRef.current.filter(entry => (entry.id !== id)) ].slice(0, MAX_KEPT));

        if(!silent) raise(id);
    }, [ commit, raise ]);

    // ---- what the server tells us -------------------------------------

    useMessageEvent<RpNotificationEvent>(RpNotificationEvent, event =>
    {
        const push = event.getParser()?.push;

        if(!push || !push.app) return;

        load();
        add(push);
    });

    // The calendar, the feed and the album list arrive here anyway (the
    // server broadcasts all three); keeping them by id is what lets a banner
    // name a time and a room.
    useMessageEvent<RpCalendarEvent>(RpCalendarEvent, event =>
    {
        const parser = event.getParser();

        if(!parser) return;

        setEvents(Object.fromEntries(parser.events.map(item => [ item.id, item ])));
    });

    useMessageEvent<RpNewsEvent>(RpNewsEvent, event =>
    {
        const parser = event.getParser();

        if(!parser) return;

        setPosts(Object.fromEntries(parser.posts.map(item => [ item.id, item ])));
    });

    useMessageEvent<RpAlbumListEvent>(RpAlbumListEvent, event =>
    {
        const parser = event.getParser();

        if(!parser) return;

        setAlbums(Object.fromEntries(parser.albums.map(item => [ item.id, item ])));
    });

    // ---- what we notice ourselves -------------------------------------

    // A direct message needs no packet of its own: the messenger already
    // delivers it. The badge stays the messenger's unread count, so this is
    // purely the banner and the row in the Center.
    useMessageEvent<NewConsoleMessageEvent>(NewConsoleMessageEvent, event =>
    {
        const parser = event.getParser();

        if(!parser || (parser.senderId <= 0)) return;

        const thread = (getMessageThread ? getMessageThread(parser.senderId) : null);
        const friend = (getFriend ? getFriend(parser.senderId) : null);
        const name = (thread?.participant?.name || friend?.name || 'Someone');
        // A photo arrives as a marker plus a URL; say what it is rather than
        // showing the player the plumbing.
        const photo = ParsePhotoMessage(parser.messageText);

        load();
        add({ app: 'messages', kind: 'message', subject: (photo ? 'Sent you a photo' : parser.messageText), actor: name, targetId: parser.senderId, extra: 0, transient: false });
    });

    // Friend requests: the list is already live, so a new id in it is the
    // notification. The first list of a session is the baseline - a player
    // logging in to four pending requests should not get four banners.
    const seenRequestIds = useRef<number[]>(null);

    useEffect(() =>
    {
        const ids = requests.map(request => request.id);

        if(seenRequestIds.current === null)
        {
            seenRequestIds.current = ids;

            return;
        }

        for(const request of requests)
        {
            if(seenRequestIds.current.indexOf(request.id) >= 0) continue;

            add({ app: 'contacts', kind: 'friend_request', subject: request.name, actor: request.name, targetId: request.id, extra: 0, transient: false });
        }

        seenRequestIds.current = ids;
    }, [ requests, add ]);

    // Friends coming and going. Off by default (see PhoneNotify) because it
    // is the one trigger that fires all day.
    //
    // Only a friend we have already seen can have CHANGED: the friend list
    // arrives in fragments, so a friend showing up in the roster for the
    // first time is the baseline, not someone who just logged in. Without
    // that, logging in announced everyone in the second fragment.
    const friendState = useRef<Record<number, boolean>>({});

    useEffect(() =>
    {
        for(const friend of friends)
        {
            const known = friendState.current;
            const was = known[friend.id];

            known[friend.id] = friend.online;

            if((was === undefined) || (was === friend.online)) continue;

            add({ app: 'contacts', kind: (friend.online ? 'friend_on' : 'friend_off'), subject: friend.name, actor: '', targetId: friend.id, extra: 0, transient: true });
        }
    }, [ friends, add ]);

    // ---- reading ------------------------------------------------------

    /// Clears one thing: the thread, album, note, event or story just opened.
    const markSeen = useCallback((app: NotifyApp, targetId: number) =>
    {
        if(!listRef.current.some(entry => (!entry.seen && (entry.app === app) && (entry.targetId === targetId)))) return;

        commit(listRef.current.map(entry => (((entry.app === app) && (entry.targetId === targetId)) ? { ...entry, seen: true } : entry)));
    }, [ commit ]);

    /// Clears a whole app - the Center's sweep, not something opening an app
    /// does on its own.
    const markAppSeen = useCallback((app: NotifyApp) =>
    {
        if(!listRef.current.some(entry => (!entry.seen && (entry.app === app)))) return;

        commit(listRef.current.map(entry => ((entry.app === app) ? { ...entry, seen: true } : entry)));
    }, [ commit ]);

    const markAllSeen = useCallback(() =>
    {
        if(!listRef.current.some(entry => !entry.seen)) return;

        commit(listRef.current.map(entry => ({ ...entry, seen: true })));
    }, [ commit ]);

    const clearAll = useCallback(() =>
    {
        setBannerIds([]);
        commit([]);
    }, [ commit ]);

    const dismissBanner = useCallback((id: number) => setBannerIds(prevValue => prevValue.filter(entry => (entry !== id))), []);

    // ---- what the views read ------------------------------------------

    const context = useMemo<NotifyContext>(() => ({ events, posts, albums }), [ events, posts, albums ]);

    const banners = useMemo(() => bannerIds.map(id => notifications.find(entry => (entry.id === id))).filter((entry): entry is PhoneNotification => !!entry), [ bannerIds, notifications ]);

    // The Center shows only what is kept; a transient banner is in the list
    // for as long as it is on screen and has no place there.
    const kept = useMemo(() => notifications.filter(entry => (TRANSIENT_KINDS.indexOf(entry.kind) === -1)), [ notifications ]);

    const unseen = useMemo(() =>
    {
        const counts: Record<string, number> = {};

        for(const entry of kept)
        {
            if(entry.seen) continue;

            counts[entry.app] = ((counts[entry.app] ?? 0) + 1);
        }

        return counts;
    }, [ kept ]);

    return { notifications: kept, banners, unseen, context, notify, markSeen, markAppSeen, markAllSeen, clearAll, dismissBanner };
}

export const usePhoneNotifications = () => useBetween(usePhoneNotificationsState);

/// Every app tile's badge, keyed the way the home screen names its apps.
///
/// Messages and Contacts keep counting the way they always have - unread
/// threads and pending requests are already the right number, and they clear
/// themselves. The other four count unread notifications.
export const usePhoneAppBadges = () =>
{
    const { unreadMessages = 0, requestCount = 0 } = usePhoneBadges();
    const { unseen } = usePhoneNotifications();
    const { notify } = usePhonePrefs();

    return useMemo(() =>
    {
        // Turning an app off hides its badge as well as its banners: a number
        // whose reason the player has switched off is worse than no number.
        // It also zeroes anything counted before the switch was flipped.
        const on = (key: keyof PhoneNotify) => (notify.allow && notify[key]);
        const counts: Record<string, number> = {
            Messages: on('messages') ? unreadMessages : 0,
            Contacts: on('contacts') ? requestCount : 0,
            Photos: on('photos') ? (unseen.photos ?? 0) : 0,
            Calendar: on('calendar') ? (unseen.calendar ?? 0) : 0,
            Notes: on('notes') ? (unseen.notes ?? 0) : 0,
            News: on('news') ? (unseen.news ?? 0) : 0
        };

        return { counts, total: Object.values(counts).reduce((sum, count) => (sum + count), 0) };
    }, [ unreadMessages, requestCount, unseen, notify ]);
}
