import { FC, KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react';
import { GetGroupChatData, GetSessionDataManager, GetUserProfile, MessengerThread, MessengerThreadChat, ReportType } from '../../api';
import { MESSENGER_RECEIPT_NOT_DELIVERED, MESSENGER_RECEIPT_READ, useFriends, useHelp, useMessenger } from '../../hooks';
import { PhoneAvatar } from './PhoneAvatar';
import { PhoneIcon } from './PhoneIcon';
import { MakePhotoMessage, ParsePhotoMessage, usePhonePhotos, usePhonePrefs } from './usePhone';

// One conversation: chat bubbles + composer. The header's speaker icon
// mutes the conversation (drops it from badge counts); the overflow menu
// carries the classic messenger actions (follow, profile, report, delete).
// The composer's + button opens the attach menu — Share Photo for now —
// which multi-selects from the player's library and sends each shot as a
// photo bubble.

// Enough for a good dump, few enough to stay clear of the messenger's
// server-side flood counter.
const MAX_SHARED_PHOTOS: number = 6;

interface PhoneThreadViewProps
{
    thread: MessengerThread;
    onBack: () => void;
    onDeleted: () => void;
}

export const PhoneThreadView: FC<PhoneThreadViewProps> = props =>
{
    const { thread = null, onBack = null, onDeleted = null } = props;
    const { sendMessage = null, closeThread = null, receipts = {}, typingFriendIds = [], sendTyping = null } = useMessenger();
    const { getFriend = null, followFriend = null } = useFriends();
    const { mutedIds, toggleMuted } = usePhonePrefs();
    const { photos = [], requestPhotos = null, saveScreenshot = null } = usePhonePhotos();
    const { report = null } = useHelp();
    const [ messageText, setMessageText ] = useState('');
    const [ menuOpen, setMenuOpen ] = useState(false);
    const [ attachOpen, setAttachOpen ] = useState(false);
    const [ pickerOpen, setPickerOpen ] = useState(false);
    const [ selectedPhotoIds, setSelectedPhotoIds ] = useState<number[]>([]);
    const [ photoViewer, setPhotoViewer ] = useState<{ url: string, mine: boolean }>(null);
    const [ toastText, setToastText ] = useState<string>(null);
    const messagesBox = useRef<HTMLDivElement>(null);
    const toastTimer = useRef<number>(0);
    const typingSentRef = useRef(false);
    const typingStopTimer = useRef<number>(0);

    const participant = (thread ? thread.participant : null);
    const isGroup = (participant && (participant.id <= 0));
    const friend = ((participant && !isGroup && getFriend) ? getFriend(participant.id) : null);
    const online = (friend ? friend.online : false);
    const muted = ((participant && !isGroup) ? (mutedIds.indexOf(participant.id) >= 0) : false);
    const ownUserId = GetSessionDataManager().userId;
    const isTyping = (!!participant && !isGroup && (typingFriendIds.indexOf(participant.id) >= 0));

    const chatCount = useMemo(() =>
    {
        if(!thread) return 0;

        return thread.groups.reduce((total, group) => (total + group.chats.length), 0);
    }, [ thread ]);

    useEffect(() =>
    {
        if(messagesBox.current) messagesBox.current.scrollTop = messagesBox.current.scrollHeight;
    }, [ chatCount, thread, isTyping ]);

    // Leaving the conversation (thread switch or unmount) tells the friend we
    // stopped typing. The receiver also auto-expires the indicator on its own.
    useEffect(() =>
    {
        return () =>
        {
            window.clearTimeout(typingStopTimer.current);

            if(typingSentRef.current && participant && !isGroup && sendTyping) sendTyping(participant.id, false);

            typingSentRef.current = false;
        }
    }, [ participant?.id ]); // eslint-disable-line react-hooks/exhaustive-deps

    if(!thread || !participant) return null;

    // Receipt line under the newest message, when that message is our own:
    // Sent -> Delivered -> "Read at HH:MM". Receipts are live (pixelrp
    // packets); one older than the newest own message means only "Sent".
    const findLastChat = (): { mine: boolean, date: Date } =>
    {
        for(let i = (thread.groups.length - 1); i >= 0; i--)
        {
            const group = thread.groups[i];

            for(let j = (group.chats.length - 1); j >= 0; j--)
            {
                const chat = group.chats[j];

                if(chat.type !== MessengerThreadChat.CHAT) continue;

                return { mine: (group.userId === ownUserId), date: chat.date };
            }
        }

        return null;
    }

    let receiptText: string = null;
    let receiptError = false;

    if(!isGroup)
    {
        const lastChat = findLastChat();

        if(lastChat && lastChat.mine)
        {
            receiptText = 'Sent';

            const receipt = receipts[participant.id];

            if(receipt && (receipt.date >= lastChat.date))
            {
                if(receipt.type === MESSENGER_RECEIPT_NOT_DELIVERED)
                {
                    receiptText = 'Not Delivered';
                    receiptError = true;
                }
                else
                {
                    receiptText = ((receipt.type === MESSENGER_RECEIPT_READ) ? `Read at ${ receipt.date.getHours().toString().padStart(2, '0') }:${ receipt.date.getMinutes().toString().padStart(2, '0') }` : 'Delivered');
                }
            }
        }
    }

    // Tell the friend we stopped typing (on send, cleared input, or leaving).
    const stopTyping = () =>
    {
        window.clearTimeout(typingStopTimer.current);

        if(typingSentRef.current && participant && !isGroup && sendTyping) sendTyping(participant.id, false);

        typingSentRef.current = false;
    }

    // One "typing" per burst; a 3s idle timer sends the "stopped".
    const notifyTyping = () =>
    {
        if(!participant || isGroup || !sendTyping) return;

        if(!typingSentRef.current)
        {
            sendTyping(participant.id, true);

            typingSentRef.current = true;
        }

        window.clearTimeout(typingStopTimer.current);

        typingStopTimer.current = window.setTimeout(stopTyping, 3000);
    }

    const onMessageChange = (value: string) =>
    {
        setMessageText(value);

        if(value.trim().length) notifyTyping();
        else stopTyping();
    }

    const send = () =>
    {
        const text = messageText.trim();

        if(!text.length || !sendMessage) return;

        sendMessage(thread, ownUserId, text);
        setMessageText('');
        stopTyping();
    }

    const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) =>
    {
        if(event.key !== 'Enter') return;

        send();
    }

    const openPhotoPicker = () =>
    {
        setAttachOpen(false);
        setSelectedPhotoIds([]);
        setPickerOpen(true);

        if(requestPhotos) requestPhotos();
    }

    const togglePhotoSelection = (photoId: number) =>
    {
        setSelectedPhotoIds(prevValue =>
        {
            if(prevValue.indexOf(photoId) >= 0) return prevValue.filter(id => (id !== photoId));

            if(prevValue.length >= MAX_SHARED_PHOTOS) return prevValue;

            return [ ...prevValue, photoId ];
        });
    }

    const showToast = (text: string) =>
    {
        window.clearTimeout(toastTimer.current);

        setToastText(text);

        toastTimer.current = window.setTimeout(() => setToastText(null), 1800);
    }

    // Save a received photo into the player's own library: fetch the
    // same-origin image and file it through the screenshot save path (new
    // file pair + camera_web row — their copy stays theirs, this one is
    // yours).
    const savePhotoToLibrary = (url: string) =>
    {
        if(!saveScreenshot) return;

        fetch(url)
            .then(response => response.blob())
            .then(blob => new Promise<string>((resolve, reject) =>
            {
                const reader = new FileReader();

                reader.onload = () => resolve(reader.result as string);
                reader.onerror = reject;
                reader.readAsDataURL(blob);
            }))
            .then(dataUrl =>
            {
                saveScreenshot(dataUrl, 'saved');
                showToast('Saved to Photos');
            })
            .catch(() => showToast('Couldn\'t save the photo'));
    }

    const shareSelectedPhotos = () =>
    {
        if(!selectedPhotoIds.length || !sendMessage) return;

        // Send in selection order, one photo bubble per message.
        for(const photoId of selectedPhotoIds)
        {
            const photo = photos.find(entry => (entry.id === photoId));

            if(photo) sendMessage(thread, ownUserId, MakePhotoMessage(photo.url));
        }

        setPickerOpen(false);
        setSelectedPhotoIds([]);
    }

    const firstDate = ((thread.groups.length && thread.groups[0].chats.length) ? thread.groups[0].chats[0].date : null);

    return (
        <div className="phone-screen phone-app-screen phone-thread">
            <div className="phone-thread-header">
                <div className="phone-tap phone-thread-back" onClick={ event => (onBack && onBack()) }>
                    <PhoneIcon icon="chevron-left" size={ 24 } />
                </div>
                <PhoneAvatar id={ participant.id } figure={ participant.figure } size={ 38 } />
                <div className="phone-thread-header-body">
                    <div className="phone-thread-header-name">{ participant.name }</div>
                    <div className={ `phone-thread-header-status${ online ? ' is-online' : '' }` }>{ isGroup ? 'Group chat' : (online ? 'Active now' : 'Offline') }</div>
                </div>
                { !isGroup &&
                    <div className={ `phone-tap phone-thread-header-icon${ muted ? ' is-muted' : '' }` } title={ muted ? 'Unmute conversation' : 'Mute conversation' } onClick={ event => toggleMuted(participant.id) }>
                        <PhoneIcon icon={ muted ? 'volume-x' : 'volume-2' } size={ 20 } />
                    </div> }
                <div className="phone-tap phone-thread-header-icon" title="More" onClick={ event => setMenuOpen(!menuOpen) }>
                    <PhoneIcon icon="more-vertical" size={ 20 } />
                </div>
            </div>
            <div ref={ messagesBox } className="phone-app-scroll phone-thread-messages">
                { firstDate &&
                    <div className="phone-thread-daystamp">{ `${ firstDate.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }).toUpperCase() } ${ firstDate.getHours().toString().padStart(2, '0') }:${ firstDate.getMinutes().toString().padStart(2, '0') }` }</div> }
                { thread.groups.map((group, groupIndex) =>
                {
                    const mine = (group.userId === ownUserId);

                    return group.chats.map((chat, chatIndex) =>
                    {
                        const key = `${ groupIndex }-${ chatIndex }`;

                        if(chat.type === MessengerThreadChat.SECURITY_NOTIFICATION)
                        {
                            return <div key={ key } className="phone-thread-system">{ chat.message }</div>;
                        }

                        if(chat.type === MessengerThreadChat.ROOM_INVITE)
                        {
                            return (
                                <div key={ key } className="phone-thread-invite">
                                    <PhoneIcon icon="map-pin-home" size={ 16 } />
                                    <span>{ chat.message }</span>
                                </div>
                            );
                        }

                        const groupChatData = ((isGroup && chat.extraData) ? GetGroupChatData(chat.extraData) : null);
                        const groupMine = (groupChatData ? (groupChatData.userId === ownUserId) : mine);
                        const showSender = (isGroup && !groupMine && groupChatData && (chatIndex === 0));
                        const photoUrl = ParsePhotoMessage(chat.message);

                        return (
                            <div key={ key } className={ `phone-thread-bubble-row${ groupMine ? ' is-mine' : '' }` }>
                                <div className="phone-thread-bubble-stack">
                                    { showSender &&
                                        <div className="phone-thread-sender">{ groupChatData.username }</div> }
                                    { photoUrl &&
                                        <div className="phone-thread-photo-wrap">
                                            <div className={ `phone-tap phone-thread-photo${ groupMine ? ' is-mine' : '' }` } title="View photo" onClick={ event => setPhotoViewer({ url: photoUrl, mine: groupMine }) }>
                                                <img src={ photoUrl } alt="Shared photo" loading="lazy" />
                                            </div>
                                            { !groupMine &&
                                                <div className="phone-tap phone-thread-photo-save" title="Save to Photos" onClick={ event => savePhotoToLibrary(photoUrl) }>
                                                    <PhoneIcon icon="download" size={ 14 } />
                                                </div> }
                                        </div> }
                                    { !photoUrl &&
                                        <div className={ `phone-thread-bubble${ groupMine ? ' is-mine' : '' }` }>{ chat.message }</div> }
                                </div>
                            </div>
                        );
                    });
                }) }
                { receiptText && !isTyping &&
                    <div className={ `phone-thread-receipt${ receiptError ? ' is-error' : '' }` }>{ receiptText }</div> }
                { isTyping &&
                    <div className="phone-thread-typing">
                        <span />
                        <span />
                        <span />
                    </div> }
            </div>
            <div className="phone-thread-input">
                <div className={ `phone-tap phone-thread-attach${ attachOpen ? ' is-open' : '' }` } title="Attach" onClick={ event => setAttachOpen(!attachOpen) }>
                    <PhoneIcon icon="plus" size={ 22 } />
                </div>
                <input type="text" spellCheck={ false } maxLength={ 255 } placeholder="Message" value={ messageText } onChange={ event => onMessageChange(event.target.value) } onKeyDown={ onKeyDown } />
                <div className={ `phone-tap phone-thread-send${ messageText.trim().length ? ' is-ready' : '' }` } title="Send" onClick={ send }>
                    <PhoneIcon icon="arrow-up" size={ 20 } />
                </div>
            </div>
            { attachOpen &&
                <div className="phone-thread-menu-backdrop" onClick={ event => setAttachOpen(false) }>
                    <div className="phone-thread-attach-menu" onClick={ event => event.stopPropagation() }>
                        <div className="phone-tap phone-pin-menu-item" onClick={ openPhotoPicker }>
                            <span>Share Photo</span>
                            <PhoneIcon icon="image" size={ 18 } />
                        </div>
                    </div>
                </div> }
            { pickerOpen &&
                <div className="phone-photo-picker">
                    <div className="phone-photo-picker-top">
                        <div className="phone-tap phone-photos-edit-action" onClick={ event => setPickerOpen(false) }>Cancel</div>
                        <div className="phone-photos-viewer-meta">
                            <div className="phone-photos-viewer-date">Share Photo</div>
                            <div className="phone-photos-viewer-sub">{ selectedPhotoIds.length ? `${ selectedPhotoIds.length } of ${ MAX_SHARED_PHOTOS } selected` : 'Tap to select' }</div>
                        </div>
                        <div className="phone-photos-edit-action" />
                    </div>
                    <div className="phone-app-scroll phone-photo-picker-scroll">
                        { (photos.length > 0) &&
                            <div className="phone-photos-grid">
                                { photos.map(photo =>
                                {
                                    const selectedIndex = selectedPhotoIds.indexOf(photo.id);

                                    return (
                                        <div key={ photo.id } className="phone-tap phone-photos-cell" onClick={ event => togglePhotoSelection(photo.id) }>
                                            <img src={ photo.url } alt="" loading="lazy" />
                                            <div className={ `phone-photo-picker-check${ (selectedIndex >= 0) ? ' is-selected' : '' }` }>
                                                { (selectedIndex >= 0) && (selectedIndex + 1) }
                                            </div>
                                        </div>
                                    );
                                }) }
                            </div> }
                        { !photos.length &&
                            <div className="phone-list-note">No photos in your library yet - take some with the Camera first.</div> }
                        <div className="phone-scroll-spacer" />
                    </div>
                    <div className="phone-photo-picker-bottom">
                        <div className={ `phone-tap phone-cta phone-photo-picker-send${ !selectedPhotoIds.length ? ' is-disabled' : '' }` } onClick={ shareSelectedPhotos }>
                            { selectedPhotoIds.length ? `SHARE ${ selectedPhotoIds.length } ${ (selectedPhotoIds.length === 1) ? 'PHOTO' : 'PHOTOS' }` : 'SHARE' }
                        </div>
                    </div>
                </div> }
            { photoViewer &&
                <div className="phone-chat-photo-viewer">
                    <img src={ photoViewer.url } alt="" onClick={ event => setPhotoViewer(null) } />
                    <div className="phone-photos-viewer-top">
                        <div className="phone-tap phone-photos-viewer-back" onClick={ event => setPhotoViewer(null) }>
                            <PhoneIcon icon="chevron-left" size={ 22 } />
                        </div>
                        <div className="phone-photos-viewer-meta">
                            <div className="phone-photos-viewer-date">{ photoViewer.mine ? 'Your photo' : `From ${ participant.name }` }</div>
                        </div>
                        <div className="phone-photos-viewer-spacer" />
                    </div>
                    { !photoViewer.mine &&
                        <div className="phone-chat-photo-viewer-bottom">
                            <div className="phone-tap phone-chat-photo-save-pill" onClick={ event => savePhotoToLibrary(photoViewer.url) }>
                                <PhoneIcon icon="download" size={ 15 } />
                                <span>Save to Photos</span>
                            </div>
                        </div> }
                </div> }
            { toastText &&
                <div className="phone-camera-toast phone-thread-toast">
                    <PhoneIcon icon="check" size={ 14 } />
                    <span>{ toastText }</span>
                </div> }
            { menuOpen &&
                <div className="phone-thread-menu-backdrop" onClick={ event => setMenuOpen(false) }>
                    <div className="phone-thread-menu" onClick={ event => event.stopPropagation() }>
                        { !isGroup && friend && friend.followingAllowed && online &&
                            <div className="phone-tap phone-pin-menu-item" onClick={ event => 
                            {
                                (followFriend && followFriend(friend)); setMenuOpen(false); 
                            } }>
                                <span>Follow to room</span>
                                <PhoneIcon icon="map-pin-home" size={ 18 } />
                            </div> }
                        { !isGroup &&
                            <div className="phone-tap phone-pin-menu-item" onClick={ event => 
                            {
                                GetUserProfile(participant.id); setMenuOpen(false); 
                            } }>
                                <span>View profile</span>
                                <PhoneIcon icon="user" size={ 18 } />
                            </div> }
                        { !isGroup &&
                            <div className="phone-tap phone-pin-menu-item" onClick={ event => 
                            {
                                (report && report(ReportType.IM, { reportedUserId: participant.id })); setMenuOpen(false); 
                            } }>
                                <span>Report</span>
                                <PhoneIcon icon="megaphone" size={ 18 } />
                            </div> }
                        <div className="phone-tap phone-pin-menu-item is-danger" onClick={ event => 
                        {
                            (closeThread && closeThread(thread.threadId)); setMenuOpen(false); (onDeleted && onDeleted()); 
                        } }>
                            <span>Delete conversation</span>
                            <PhoneIcon icon="trash" size={ 18 } />
                        </div>
                    </div>
                </div> }
        </div>
    );
}
