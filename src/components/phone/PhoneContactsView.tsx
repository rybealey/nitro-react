import { HabboSearchComposer, HabboSearchResultEvent, RemoveFriendComposer } from '@nitrots/nitro-renderer';
import { FC, useEffect, useMemo, useState } from 'react';
import { GetUserProfile, SendMessageComposer } from '../../api';
import { useFriends, useMessageEvent } from '../../hooks';
import { PhoneAvatar } from './PhoneAvatar';
import { PhoneIcon } from './PhoneIcon';
import { useAirplane } from './usePhone';

// Contacts app: a Friends / Requests segmented control. Friends splits into
// Online and Offline sections (each alphabetized) with an inline add-contact
// search; Requests holds incoming friend requests until they're accepted or
// declined, and drives the tab's count badge. Message jumps into the Messages
// app; call rings the (cosmetic) PixelRP Audio overlay; removing a friend
// needs a second confirming tap.

type ContactsTab = 'friends' | 'requests';

interface PhoneContactsViewProps
{
    openThreadForUser: (userId: number) => void;
    startCall: (userId: number) => void;
    onBack: () => void;
}

export const PhoneContactsView: FC<PhoneContactsViewProps> = props =>
{
    const { openThreadForUser = null, startCall = null, onBack = null } = props;
    const { friends = [], requests = [], requestResponse = null } = useFriends();
    const [ confirmRemoveId, setConfirmRemoveId ] = useState<number>(0);
    const [ tab, setTab ] = useState<ContactsTab>('friends');
    const { enabled: airplane } = useAirplane();
    // Airplane mode hides incoming friend requests until it's switched off.
    const visibleRequests = (airplane ? [] : requests);

    const sortedFriends = useMemo(() =>
    {
        return friends
            .filter(friend => (friend.id > 0))
            .sort((a, b) => (a.name || '').toLowerCase().localeCompare((b.name || '').toLowerCase()));
    }, [ friends ]);

    const onlineFriends = useMemo(() => sortedFriends.filter(friend => friend.online), [ sortedFriends ]);
    const offlineFriends = useMemo(() => sortedFriends.filter(friend => !friend.online), [ sortedFriends ]);

    useEffect(() =>
    {
        if(!confirmRemoveId) return;

        const timeout = window.setTimeout(() => setConfirmRemoveId(0), 3000);

        return () => window.clearTimeout(timeout);
    }, [ confirmRemoveId ]);

    const removeFriend = (friendId: number) =>
    {
        if(confirmRemoveId !== friendId)
        {
            setConfirmRemoveId(friendId);

            return;
        }

        SendMessageComposer(new RemoveFriendComposer(friendId));
        setConfirmRemoveId(0);
    }

    const friendRow = (friend: typeof sortedFriends[number]) =>
    {
        const confirming = (confirmRemoveId === friend.id);

        return (
            <div key={ friend.id } className="phone-contact-row">
                <div className="phone-tap" onClick={ event => GetUserProfile(friend.id) }>
                    <PhoneAvatar id={ friend.id } figure={ friend.figure } size={ 44 } online={ friend.online } />
                </div>
                <div className="phone-contact-body">
                    <div className="phone-contact-name">{ friend.name }</div>
                    <div className="phone-contact-handle">{ confirming ? 'tap again to remove' : `@${ (friend.name || '').toLowerCase() }` }</div>
                </div>
                <div className="phone-contact-actions">
                    <div className="phone-tap phone-round-btn is-message" title="Message" onClick={ event => (openThreadForUser && openThreadForUser(friend.id)) }>
                        <PhoneIcon icon="message" size={ 16 } />
                    </div>
                    <div className="phone-tap phone-round-btn is-call" title="Call" onClick={ event => (startCall && startCall(friend.id)) }>
                        <PhoneIcon icon="phone" size={ 16 } />
                    </div>
                    <div className={ `phone-tap phone-round-btn is-remove${ confirming ? ' is-confirming' : '' }` } title={ confirming ? 'Tap again to remove friend' : 'Remove friend' } onClick={ event => removeFriend(friend.id) }>
                        <PhoneIcon icon="trash" size={ 15 } />
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="phone-screen phone-app-screen phone-contacts">
            <div className="phone-app-scroll">
                <div className="phone-app-header">
                    <div className="phone-app-header-lead">
                        <div className="phone-tap phone-thread-back" onClick={ event => (onBack && onBack()) }>
                            <PhoneIcon icon="chevron-left" size={ 24 } />
                        </div>
                        <div>
                            <div className="phone-app-kicker">PIXELRP CONTACTS</div>
                            <div className="phone-app-title">Contacts</div>
                        </div>
                    </div>
                </div>
                <div className="phone-contacts-tabs">
                    <div className={ `phone-tap phone-contacts-tab${ (tab === 'friends') ? ' is-active' : '' }` } onClick={ event => setTab('friends') }>
                        Friends
                    </div>
                    <div className={ `phone-tap phone-contacts-tab${ (tab === 'requests') ? ' is-active' : '' }` } onClick={ event => setTab('requests') }>
                        <span>Requests</span>
                        { (visibleRequests.length > 0) &&
                            <span className="phone-contacts-tab-badge">{ visibleRequests.length }</span> }
                    </div>
                </div>
                { (tab === 'friends') &&
                    <>
                        { (onlineFriends.length > 0) &&
                            <>
                                <div className="phone-section-label">ONLINE</div>
                                <div>
                                    { onlineFriends.map(friendRow) }
                                </div>
                            </> }
                        { (offlineFriends.length > 0) &&
                            <>
                                <div className="phone-section-label">OFFLINE</div>
                                <div>
                                    { offlineFriends.map(friendRow) }
                                </div>
                            </> }
                        { !sortedFriends.length &&
                            <div className="phone-list-note">No contacts yet. Walk up to someone in the city and ask to be friends - or search below.</div> }
                        <PhoneAddContactView />
                    </> }
                { (tab === 'requests') &&
                    <>
                        { visibleRequests.map(request =>
                        {
                            return (
                                <div key={ request.id } className="phone-contact-row">
                                    <PhoneAvatar id={ request.requesterUserId } figure={ request.figureString } size={ 44 } />
                                    <div className="phone-contact-body">
                                        <div className="phone-contact-name">{ request.name }</div>
                                        <div className="phone-contact-handle">wants to be your friend</div>
                                    </div>
                                    <div className="phone-contact-actions">
                                        <div className="phone-tap phone-request-accept" title="Accept" onClick={ event => (requestResponse && requestResponse(request.id, true)) }>
                                            Accept
                                        </div>
                                        <div className="phone-tap phone-round-btn is-request-decline" title="Decline" onClick={ event => (requestResponse && requestResponse(request.id, false)) }>
                                            <PhoneIcon icon="close" size={ 16 } />
                                        </div>
                                    </div>
                                </div>
                            );
                        }) }
                        { !visibleRequests.length &&
                            <div className="phone-requests-empty">
                                <div className="phone-requests-empty-title">No pending requests</div>
                                <div className="phone-requests-empty-text">Friend requests from other players show up here.</div>
                            </div> }
                    </> }
                <div className="phone-scroll-spacer" />
            </div>
        </div>
    );
}

// Inline "add contact" search at the foot of Contacts — the phone-era
// replacement for the classic friends-list search accordion.
const PhoneAddContactView: FC<{}> = props =>
{
    const { canRequestFriend = null, requestFriend = null } = useFriends();
    const [ searchValue, setSearchValue ] = useState('');
    const [ results, setResults ] = useState<{ id: number, name: string, online: boolean }[]>(null);

    useMessageEvent<HabboSearchResultEvent>(HabboSearchResultEvent, event =>
    {
        const parser = event.getParser();

        setResults([ ...parser.friends, ...parser.others ].map(result => ({ id: result.avatarId, name: result.avatarName, online: result.isAvatarOnline })));
    });

    useEffect(() =>
    {
        const query = searchValue.trim();

        if(!query.length)
        {
            setResults(null);

            return;
        }

        const timeout = window.setTimeout(() => SendMessageComposer(new HabboSearchComposer(query)), 500);

        return () => window.clearTimeout(timeout);
    }, [ searchValue ]);

    return (
        <>
            <div className="phone-section-label">ADD CONTACT</div>
            <div className="phone-search phone-search--inset">
                <PhoneIcon icon="search" size={ 16 } />
                <input type="text" spellCheck={ false } placeholder="Search players" value={ searchValue } onChange={ event => setSearchValue(event.target.value) } />
            </div>
            { results && searchValue.trim().length > 0 &&
                <div>
                    { results.map(result =>
                    {
                        const requestable = (canRequestFriend && canRequestFriend(result.id));

                        return (
                            <div key={ result.id } className="phone-contact-row">
                                <div className="phone-contact-body">
                                    <div className="phone-contact-name">{ result.name }</div>
                                    <div className="phone-contact-handle">{ result.online ? 'online' : 'offline' }</div>
                                </div>
                                <div className="phone-contact-actions">
                                    { requestable &&
                                        <div className="phone-tap phone-round-btn is-accept" title="Send friend request" onClick={ event => (requestFriend && requestFriend(result.id, result.name)) }>
                                            <PhoneIcon icon="user-plus" size={ 16 } />
                                        </div> }
                                    { !requestable &&
                                        <div className="phone-contact-handle">added</div> }
                                </div>
                            </div>
                        );
                    }) }
                    { !results.length &&
                        <div className="phone-list-note">Nobody found by that name.</div> }
                </div> }
        </>
    );
}
