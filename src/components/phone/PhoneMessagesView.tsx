import { FC, PointerEvent, useMemo, useRef, useState } from 'react';
import { GetGroupChatData, MessengerFriend, MessengerThread, MessengerThreadChat } from '../../api';
import { useFriends, useMessenger } from '../../hooks';
import { PhoneAvatar } from './PhoneAvatar';
import { PhoneIcon } from './PhoneIcon';
import { ParsePhotoMessage, usePhonePrefs } from './usePhone';

// Messages app: pinned contacts grid on top, every conversation below.
// Rows swipe left (drag) to reveal pin / mute / delete; pinned tiles hold
// a long-press menu. Pin + mute persist per account via usePhonePrefs.

const SWIPE_WIDTH: number = 192; // 3 actions x 64px
const LONG_PRESS_MS: number = 420;

export const FormatThreadTime = (date: Date): string =>
{
    if(!date) return '';

    const now = new Date();
    const startOfDay = (value: Date) => new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
    const dayDiff = Math.round((startOfDay(now) - startOfDay(date)) / 86400000);

    if(dayDiff <= 0) return `${ date.getHours().toString().padStart(2, '0') }:${ date.getMinutes().toString().padStart(2, '0') }`;

    if(dayDiff === 1) return 'Yesterday';

    if(dayDiff < 7) return date.toLocaleDateString(undefined, { weekday: 'short' });

    return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

export const ThreadPreview = (thread: MessengerThread): string =>
{
    if(!thread) return '';

    for(let i = (thread.groups.length - 1); i >= 0; i--)
    {
        const group = thread.groups[i];

        for(let j = (group.chats.length - 1); j >= 0; j--)
        {
            const chat = group.chats[j];

            if(chat.type === MessengerThreadChat.SECURITY_NOTIFICATION) continue;

            if(chat.type === MessengerThreadChat.ROOM_INVITE) return 'Room invite';

            const isPhoto = !!ParsePhotoMessage(chat.message);

            if((thread.participant.id <= 0) && chat.extraData)
            {
                const data = GetGroupChatData(chat.extraData);

                if(data && data.username) return (isPhoto ? `${ data.username } shared a photo` : `${ data.username }: ${ chat.message }`);
            }

            return (isPhoto ? 'Shared a photo' : chat.message);
        }
    }

    return 'Say hi!';
}

interface PhoneMessagesViewProps
{
    openThread: (thread: MessengerThread) => void;
    openThreadForUser: (userId: number) => void;
    openCompose: () => void;
}

export const PhoneMessagesView: FC<PhoneMessagesViewProps> = props =>
{
    const { openThread = null, openThreadForUser = null, openCompose = null } = props;
    const { visibleThreads = [], closeThread = null } = useMessenger();
    const { getFriend = null } = useFriends();
    const { pinnedIds, mutedIds, setPinned, reorderPinned, toggleMuted } = usePhonePrefs();
    const [ searchValue, setSearchValue ] = useState('');
    const [ openRowId, setOpenRowId ] = useState<number>(0);
    const [ dragState, setDragState ] = useState<{ threadId: number, startOffset: number, dx: number }>(null);
    const [ menuFriendId, setMenuFriendId ] = useState<number>(0);
    const [ dragPin, setDragPin ] = useState<{ friendId: number, x: number, y: number, offX: number, offY: number }>(null);
    const dragMoved = useRef(false);
    const dragStartX = useRef(0);
    const longPressTimer = useRef<number>(0);
    const longPressFired = useRef(false);
    const pinMoved = useRef(false);
    const pinStart = useRef<{ friendId: number, x: number, y: number, left: number, top: number }>(null);
    const screenRef = useRef<HTMLDivElement>(null);

    const threadForFriend = (friendId: number) => visibleThreads.find(thread => (thread.participant && (thread.participant.id === friendId)));

    const pinnedEntries = useMemo(() =>
    {
        const entries: { friend: MessengerFriend, thread: MessengerThread }[] = [];

        if(!getFriend) return entries;

        for(const friendId of pinnedIds)
        {
            const friend = getFriend(friendId);

            if(!friend) continue;

            entries.push({ friend, thread: threadForFriend(friendId) });
        }

        return entries;
    }, [ pinnedIds, getFriend, visibleThreads ]); // eslint-disable-line react-hooks/exhaustive-deps

    const recentThreads = useMemo(() =>
    {
        const query = searchValue.toLowerCase().trim();

        return visibleThreads
            .filter(thread => (thread.participant && ((thread.participant.id <= 0) || (pinnedIds.indexOf(thread.participant.id) === -1))))
            .filter(thread => (!query || ((thread.participant.name || '').toLowerCase().indexOf(query) >= 0)))
            .sort((a, b) => (b.lastUpdated.getTime() - a.lastUpdated.getTime()));
    }, [ visibleThreads, pinnedIds, searchValue ]);

    const isEmpty = (!pinnedEntries.length && !visibleThreads.length);

    const offsetFor = (threadId: number) =>
    {
        if(dragState && (dragState.threadId === threadId)) return Math.max(-SWIPE_WIDTH - 8, Math.min(8, (dragState.startOffset + dragState.dx)));

        return ((openRowId === threadId) ? -SWIPE_WIDTH : 0);
    }

    const onRowDown = (event: PointerEvent<HTMLDivElement>, threadId: number) =>
    {
        try 
        {
            event.currentTarget.setPointerCapture(event.pointerId); 
        }
        catch(e) 
        {}

        dragMoved.current = false;
        dragStartX.current = event.clientX;

        setDragState({ threadId, startOffset: ((openRowId === threadId) ? -SWIPE_WIDTH : 0), dx: 0 });
    }

    const onRowMove = (event: PointerEvent<HTMLDivElement>) =>
    {
        if(!dragState) return;

        const dx = (event.clientX - dragStartX.current);

        if(Math.abs(dx) > 6) dragMoved.current = true;

        setDragState({ ...dragState, dx });
    }

    const onRowUp = () =>
    {
        if(!dragState) return;

        const offset = (dragState.startOffset + dragState.dx);

        setOpenRowId((offset < (-SWIPE_WIDTH / 2)) ? dragState.threadId : 0);
        setDragState(null);
    }

    const onRowTap = (thread: MessengerThread) =>
    {
        if(dragMoved.current)
        {
            dragMoved.current = false;

            return;
        }

        if(openRowId === thread.threadId)
        {
            setOpenRowId(0);

            return;
        }

        if(openThread) openThread(thread);
    }

    const onPinDown = (event: PointerEvent<HTMLDivElement>, friendId: number) =>
    {
        try
        {
            event.currentTarget.setPointerCapture(event.pointerId);
        }
        catch(e)
        {}

        const rect = event.currentTarget.getBoundingClientRect();

        longPressFired.current = false;
        pinMoved.current = false;
        pinStart.current = { friendId, x: event.clientX, y: event.clientY, left: rect.left, top: rect.top };

        window.clearTimeout(longPressTimer.current);

        longPressTimer.current = window.setTimeout(() =>
        {
            if(pinMoved.current) return;

            longPressFired.current = true;

            setMenuFriendId(friendId);
        }, LONG_PRESS_MS);
    }

    const onPinMove = (event: PointerEvent<HTMLDivElement>) =>
    {
        const start = pinStart.current;

        if(!start || longPressFired.current) return;

        if(!dragPin)
        {
            if((Math.abs(event.clientX - start.x) <= 8) && (Math.abs(event.clientY - start.y) <= 8)) return;

            window.clearTimeout(longPressTimer.current);

            pinMoved.current = true;

            setDragPin({ friendId: start.friendId, x: event.clientX, y: event.clientY, offX: (start.x - start.left), offY: (start.y - start.top) });

            return;
        }

        // Reorder only while the pointer sits over another tile — this is
        // the design's anti-jitter rule.
        if(screenRef.current && reorderPinned)
        {
            const tiles = Array.from(screenRef.current.querySelectorAll('[data-pin-id]'));

            for(const tile of tiles)
            {
                const pinId = parseInt(tile.getAttribute('data-pin-id'));

                if(pinId === dragPin.friendId) continue;

                const rect = tile.getBoundingClientRect();

                if((event.clientX < rect.left) || (event.clientX > rect.right) || (event.clientY < rect.top) || (event.clientY > rect.bottom)) continue;

                const order = [ ...pinnedIds ];
                const from = order.indexOf(dragPin.friendId);
                const to = order.indexOf(pinId);

                if((from >= 0) && (to >= 0) && (from !== to))
                {
                    order.splice(from, 1);
                    order.splice(to, 0, dragPin.friendId);
                    reorderPinned(order);
                }

                break;
            }
        }

        setDragPin({ ...dragPin, x: event.clientX, y: event.clientY });
    }

    const onPinUp = () =>
    {
        window.clearTimeout(longPressTimer.current);

        pinStart.current = null;

        setDragPin(null);
    }

    const onPinTap = (friendId: number) =>
    {
        if(longPressFired.current || pinMoved.current)
        {
            longPressFired.current = false;
            pinMoved.current = false;

            return;
        }

        if(openThreadForUser) openThreadForUser(friendId);
    }

    const menuFriend = (menuFriendId ? (getFriend && getFriend(menuFriendId)) : null);
    const menuThread = (menuFriendId ? threadForFriend(menuFriendId) : null);
    const dragPinFriend = ((dragPin && getFriend) ? getFriend(dragPin.friendId) : null);

    // Ghost coordinates in the (possibly transform-scaled) screen's local
    // space: convert visual pixels back through the scale factor.
    let pinGhostStyle = null;

    if(dragPin && screenRef.current)
    {
        const rect = screenRef.current.getBoundingClientRect();
        const scale = (rect.width ? (screenRef.current.offsetWidth / rect.width) : 1);

        pinGhostStyle = {
            left: (((dragPin.x - dragPin.offX) - rect.left) * scale),
            top: (((dragPin.y - dragPin.offY) - rect.top) * scale)
        };
    }

    return (
        <div ref={ screenRef } className="phone-screen phone-app-screen phone-messages">
            <div className="phone-app-scroll">
                <div className="phone-app-header">
                    <div>
                        <div className="phone-app-kicker">PIXELRP MESSENGER</div>
                        <div className="phone-app-title">Messages</div>
                    </div>
                    <div className="phone-tap phone-fab" title="New message" onClick={ event => (openCompose && openCompose()) }>
                        <PhoneIcon icon="pencil" size={ 20 } />
                    </div>
                </div>
                { !isEmpty &&
                    <>
                        <div className="phone-search">
                            <PhoneIcon icon="search" size={ 16 } />
                            <input type="text" spellCheck={ false } placeholder="Search" value={ searchValue } onChange={ event => setSearchValue(event.target.value) } />
                        </div>
                        { (pinnedEntries.length > 0) &&
                            <>
                                <div className="phone-section-label">PINNED</div>
                                <div className="phone-pinned-grid">
                                    { pinnedEntries.map(entry =>
                                    {
                                        const unread = (entry.thread ? entry.thread.unreadCount : 0);
                                        const muted = (mutedIds.indexOf(entry.friend.id) >= 0);

                                        return (
                                            <div key={ entry.friend.id } data-pin-id={ entry.friend.id } className={ `phone-tap phone-pinned-tile${ (dragPin && (dragPin.friendId === entry.friend.id)) ? ' is-drag-source' : '' }` } onClick={ event => onPinTap(entry.friend.id) } onPointerDown={ event => onPinDown(event, entry.friend.id) } onPointerMove={ onPinMove } onPointerUp={ onPinUp } onPointerCancel={ onPinUp }>
                                                <div className="phone-pinned-avatar">
                                                    <PhoneAvatar id={ entry.friend.id } figure={ entry.friend.figure } size={ 60 } online={ entry.friend.online } unmasked={ true } />
                                                    { (unread > 0) &&
                                                        <div className="phone-unread-badge">{ unread }</div> }
                                                    { muted &&
                                                        <div className="phone-muted-badge"><PhoneIcon icon="volume-x" size={ 12 } /></div> }
                                                </div>
                                                <div className="phone-pinned-name">{ entry.friend.name }</div>
                                            </div>
                                        );
                                    }) }
                                </div>
                            </> }
                        <div className="phone-section-label">ALL MESSAGES</div>
                        <div className="phone-thread-rows">
                            { recentThreads.map(thread =>
                            {
                                const participant = thread.participant;
                                const isGroup = (participant.id <= 0);
                                const muted = (!isGroup && (mutedIds.indexOf(participant.id) >= 0));
                                const unread = thread.unreadCount;
                                const offset = offsetFor(thread.threadId);
                                const dragging = (dragState && (dragState.threadId === thread.threadId));

                                return (
                                    <div key={ thread.threadId } className="phone-thread-row-wrap">
                                        <div className="phone-thread-actions">
                                            { !isGroup &&
                                                <div className="phone-tap phone-thread-action is-pin" onClick={ event => 
                                                {
                                                    setPinned(participant.id, true); setOpenRowId(0); 
                                                } }>
                                                    <PhoneIcon icon="bookmark" size={ 18 } />
                                                    <span>PIN</span>
                                                </div> }
                                            { !isGroup &&
                                                <div className="phone-tap phone-thread-action is-mute" onClick={ event => 
                                                {
                                                    toggleMuted(participant.id); setOpenRowId(0); 
                                                } }>
                                                    <PhoneIcon icon="volume-x" size={ 18 } />
                                                    <span>{ muted ? 'UNMUTE' : 'MUTE' }</span>
                                                </div> }
                                            <div className="phone-tap phone-thread-action is-delete" onClick={ event => 
                                            {
                                                (closeThread && closeThread(thread.threadId)); setOpenRowId(0); 
                                            } }>
                                                <PhoneIcon icon="trash" size={ 18 } />
                                                <span>DELETE</span>
                                            </div>
                                        </div>
                                        <div className={ `phone-thread-row${ dragging ? ' is-dragging' : '' }` } style={ { transform: `translateX(${ offset }px)` } } onClick={ event => onRowTap(thread) } onPointerDown={ event => onRowDown(event, thread.threadId) } onPointerMove={ onRowMove } onPointerUp={ onRowUp } onPointerCancel={ onRowUp }>
                                            <div className={ `phone-thread-dot${ (unread > 0) ? ' is-unread' : '' }` } />
                                            <PhoneAvatar id={ participant.id } figure={ participant.figure } size={ 48 } online={ isGroup ? undefined : getFriend && !!getFriend(participant.id)?.online } />
                                            <div className="phone-thread-row-body">
                                                <div className="phone-thread-row-top">
                                                    <span className="phone-thread-name">{ participant.name }</span>
                                                    { isGroup &&
                                                        <PhoneIcon icon="users" size={ 14 } className="phone-thread-flag" /> }
                                                    { muted &&
                                                        <PhoneIcon icon="volume-x" size={ 13 } className="phone-thread-flag" /> }
                                                    <span className="phone-thread-time">{ FormatThreadTime(thread.lastUpdated) }</span>
                                                </div>
                                                <div className="phone-thread-row-bottom">
                                                    <span className={ `phone-thread-preview${ (unread > 0) ? ' is-unread' : '' }` }>{ ThreadPreview(thread) }</span>
                                                    { (unread > 0) &&
                                                        <div className="phone-unread-pill">{ unread }</div> }
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            }) }
                            { (!recentThreads.length && searchValue) &&
                                <div className="phone-list-note">No conversations match &quot;{ searchValue }&quot;</div> }
                        </div>
                    </> }
                { isEmpty &&
                    <div className="phone-messages-empty">
                        { /* Invisible stand-in for the removed P mark: keeps the
                             title/text/button exactly where they sat in the
                             center-justified column. */ }
                        <div className="phone-messages-empty-spacer" />
                        <div className="phone-messages-empty-title">No messages yet</div>
                        <div className="phone-messages-empty-text">Join friends, form gangs, run the city.<br />Start a conversation to see it here.</div>
                        <div className="phone-tap phone-cta" onClick={ event => (openCompose && openCompose()) }>NEW MESSAGE</div>
                    </div> }
                <div className="phone-scroll-spacer" />
            </div>
            { menuFriend &&
                <div className="phone-pin-menu" onClick={ event => setMenuFriendId(0) }>
                    <PhoneAvatar id={ menuFriend.id } figure={ menuFriend.figure } size={ 96 } />
                    <div className="phone-pin-menu-name">{ menuFriend.name }</div>
                    <div className="phone-pin-menu-card" onClick={ event => event.stopPropagation() }>
                        <div className="phone-tap phone-pin-menu-item" onClick={ event => 
                        {
                            setPinned(menuFriend.id, false); setMenuFriendId(0); 
                        } }>
                            <span>Unpin</span>
                            <PhoneIcon icon="bookmark" size={ 18 } />
                        </div>
                        <div className="phone-tap phone-pin-menu-item" onClick={ event => 
                        {
                            toggleMuted(menuFriend.id); setMenuFriendId(0); 
                        } }>
                            <span>{ (mutedIds.indexOf(menuFriend.id) >= 0) ? 'Unmute' : 'Mute' }</span>
                            <PhoneIcon icon="volume-x" size={ 18 } />
                        </div>
                        { menuThread &&
                            <div className="phone-tap phone-pin-menu-item is-danger" onClick={ event => 
                            {
                                (closeThread && closeThread(menuThread.threadId)); setMenuFriendId(0); 
                            } }>
                                <span>Delete conversation</span>
                                <PhoneIcon icon="trash" size={ 18 } />
                            </div> }
                    </div>
                    <div className="phone-pin-menu-hint">TAP OUTSIDE TO CLOSE</div>
                </div> }
            { dragPin && dragPinFriend && pinGhostStyle &&
                <div className="phone-pinned-ghost" style={ pinGhostStyle }>
                    <PhoneAvatar id={ dragPinFriend.id } figure={ dragPinFriend.figure } size={ 60 } unmasked={ true } />
                    <div className="phone-pinned-name">{ dragPinFriend.name }</div>
                </div> }
        </div>
    );
}

// Compose: pick a friend to start (or resume) a conversation.
interface PhoneComposeViewProps
{
    openThreadForUser: (userId: number) => void;
    onCancel: () => void;
}

export const PhoneComposeView: FC<PhoneComposeViewProps> = props =>
{
    const { openThreadForUser = null, onCancel = null } = props;
    const { friends = [] } = useFriends();
    const [ searchValue, setSearchValue ] = useState('');

    const suggested = useMemo(() =>
    {
        const query = searchValue.toLowerCase().trim();

        return friends
            .filter(friend => (friend.id > 0))
            .filter(friend => (!query || ((friend.name || '').toLowerCase().indexOf(query) >= 0)))
            .sort((a, b) =>
            {
                if(a.online !== b.online) return (a.online ? -1 : 1);

                return (a.name || '').toLowerCase().localeCompare((b.name || '').toLowerCase());
            });
    }, [ friends, searchValue ]);

    return (
        <div className="phone-screen phone-app-screen phone-compose">
            <div className="phone-compose-header">
                <div className="phone-tap phone-compose-cancel" onClick={ event => (onCancel && onCancel()) }>Cancel</div>
                <div className="phone-compose-title">New Message</div>
                <div className="phone-compose-spacer" />
            </div>
            <div className="phone-compose-to">
                <span>To:</span>
                <input type="text" spellCheck={ false } autoFocus={ true } value={ searchValue } onChange={ event => setSearchValue(event.target.value) } />
            </div>
            <div className="phone-section-label">{ searchValue ? 'RESULTS' : 'SUGGESTED' }</div>
            <div className="phone-app-scroll">
                { suggested.map(friend =>
                {
                    return (
                        <div key={ friend.id } className="phone-tap phone-compose-row" onClick={ event => (openThreadForUser && openThreadForUser(friend.id)) }>
                            <PhoneAvatar id={ friend.id } figure={ friend.figure } size={ 44 } online={ friend.online } />
                            <div className="phone-compose-row-body">
                                <div className="phone-compose-row-name">{ friend.name }</div>
                                <div className="phone-compose-row-handle">@{ (friend.name || '').toLowerCase() }</div>
                            </div>
                        </div>
                    );
                }) }
                { !suggested.length &&
                    <div className="phone-list-note">{ friends.length ? 'No friends match your search.' : 'Add some friends to message them here.' }</div> }
                <div className="phone-scroll-spacer" />
            </div>
        </div>
    );
}
