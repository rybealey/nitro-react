import { cloneElement, FC, KeyboardEvent, ReactElement, ReactNode, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { CreateLinkEvent, GetGroupChatData, GetSessionDataManager, GetUserProfile, MessengerThread, MessengerThreadChat, ReportType } from '../../api';
import { MESSENGER_RECEIPT_NOT_DELIVERED, MESSENGER_RECEIPT_READ, useFriends, useHelp, useMessenger } from '../../hooks';
import { HotelDate } from '../../api/prefs/HotelTime';
import { PhoneAvatar } from './PhoneAvatar';
import { JoinJam, ParseJamInvite } from '../music-player/JamStore';
import { PhoneIcon } from './PhoneIcon';
import { MakePhotoMessage, ParsePhotoMessage, usePhonePhotos, usePhonePrefs } from './usePhone';
import { GetRpPayRecords, GetRpPayState, PAY_OK, PAY_UNAVAILABLE, PayRecord, SendRpPay, SendRpPayOpen, SubscribeRpPay, SubscribeRpPayResult } from '../../api/rp-phone/RpPayMessages';

// One conversation: chat bubbles + composer. The header's speaker icon
// mutes the conversation (drops it from badge counts); the overflow menu
// carries the classic messenger actions (follow, profile, report, delete).
// The composer's + button opens the attach menu — Share Photo, and Send
// Money when both people bank with Mercury — which multi-selects from the
// player's library and sends each shot as a photo bubble.
//
// PIXEL CASH IS NOT A MESSAGE. A payment card is drawn from the server's own
// record of the payment, never from text in the thread, because a card that
// can be typed is a card that can be faked. So the cards are merged into the
// conversation here by time rather than living inside it.

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
    // Which arrivals have already been drawn once, so only the NEW ones play
    // their entrance. Identity is the item's own time rather than its index:
    // indices shift when the messenger regroups, and a bubble replaying its
    // arrival because something above it moved is the exact noise this is
    // meant to avoid. Times only ever go up, so "newer than the newest I have
    // drawn" is the whole test.
    const seenTimeRef = useRef<number>(0);
    const seenThreadRef = useRef<number>(0);
    // Pixel Cash. `paySheet` is null when closed, 'amount' or 'confirm' when
    // open; `payBusy` is the window between the tap and the server's answer,
    // which is what stops a double tap paying twice.
    const [ paySheet, setPaySheet ] = useState<'amount' | 'confirm'>(null);
    const [ payAmount, setPayAmount ] = useState('');
    const [ payNote, setPayNote ] = useState('');
    const [ payBusy, setPayBusy ] = useState(false);
    const [ payError, setPayError ] = useState<string>(null);
    const [ payTick, setPayTick ] = useState(0);

    const participant = (thread ? thread.participant : null);
    const isGroup = (participant && (participant.id <= 0));
    const friend = ((participant && !isGroup && getFriend) ? getFriend(participant.id) : null);
    const online = (friend ? friend.online : false);
    const muted = ((participant && !isGroup) ? (mutedIds.indexOf(participant.id) >= 0) : false);
    const ownUserId = GetSessionDataManager().userId;
    const isTyping = (!!participant && !isGroup && (typingFriendIds.indexOf(participant.id) >= 0));

    // ---- Pixel Cash ------------------------------------------------------

    // Whether money is possible in THIS conversation is a question only the
    // server can answer: the client knows whether it banks anywhere and
    // nothing at all about whether the other person does.
    useEffect(() =>
    {
        if(!participant || isGroup || (participant.id <= 0)) return;

        SendRpPayOpen(participant.id);
    }, [ participant, isGroup ]);

    useEffect(() => SubscribeRpPay(() => setPayTick(value => (value + 1))), []);

    useEffect(() => SubscribeRpPayResult((ok, message) =>
    {
        setPayBusy(false);

        if(!ok)
        {
            // Stay on the sheet with the amount kept: being thrown out and
            // made to type it again is the worst way to be told no.
            setPayError(message);
            setPaySheet('amount');

            return;
        }

        setPaySheet(null);
        setPayAmount('');
        setPayNote('');
        setPayError(null);
    }), []);

    // After the paint, not during it: the render above reads these to decide
    // what is new, so they can only move once it has.
    useLayoutEffect(() =>
    {
        const otherId = (participant?.id ?? 0);
        let newest = 0;

        // Reduced rather than spread into Math.max: a long conversation is
        // more arguments than a call frame wants.
        if(thread) for(const group of thread.groups)
        {
            for(const chat of group.chats) newest = Math.max(newest, (chat.date.getTime() - (chat.secondsSinceSent * 1000)));
        }

        for(const record of GetRpPayRecords(otherId)) newest = Math.max(newest, (record.createdAt * 1000));

        seenTimeRef.current = Math.max(((seenThreadRef.current === otherId) ? seenTimeRef.current : 0), newest);
        seenThreadRef.current = otherId;
    });

    const payState = useMemo(() =>
        ((participant && !isGroup) ? GetRpPayState(participant.id) : null),
    [ participant, isGroup, payTick ]);

    const payRecords = useMemo(() =>
        ((participant && !isGroup) ? GetRpPayRecords(participant.id) : []),
    [ participant, isGroup, payTick ]);

    const payOffered = (!!payState && (payState.state !== PAY_UNAVAILABLE));
    const payReady = (!!payState && (payState.state === PAY_OK));

    const payValue = useMemo(() =>
    {
        const digits = payAmount.replace(/[^0-9]/g, '');

        return (digits.length ? parseInt(digits, 10) : 0);
    }, [ payAmount ]);

    // Clamped as they type rather than refused after the fact.
    const payCeiling = Math.min((payState?.max ?? 10000), (payState?.remainingToday ?? 0));
    const payValid = (payReady && (payValue >= (payState?.min ?? 10)) && (payValue > 0) && (payValue <= payCeiling));

    const openPaySheet = () =>
    {
        setAttachOpen(false);

        if(!payReady)
        {
            CreateLinkEvent('phone/mercury');

            return;
        }

        setPayError(null);
        setPayAmount('');
        setPayNote('');
        setPaySheet('amount');
    }

    const confirmPay = () =>
    {
        if(!payValid || payBusy || !participant) return;

        setPayBusy(true);
        setPayError(null);
        SendRpPay(participant.id, payValue, payNote.trim());
    }

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
                    receiptText = ((receipt.type === MESSENGER_RECEIPT_READ) ? `Read at ${ HotelDate(receipt.date).getHours().toString().padStart(2, '0') }:${ HotelDate(receipt.date).getMinutes().toString().padStart(2, '0') }` : 'Delivered');
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
                    <div className="phone-thread-daystamp">{ `${ HotelDate(firstDate).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }).toUpperCase() } ${ HotelDate(firstDate).getHours().toString().padStart(2, '0') }:${ HotelDate(firstDate).getMinutes().toString().padStart(2, '0') }` }</div> }
                { /* Chats and payments are two different sources for one
                     timeline, so they are collected with a time each and
                     merged, rather than one being appended after the other.
                     A chat's own `date` is when this client BUILT it, which
                     for replayed history is the moment you opened the app -
                     `secondsSinceSent` is what makes it the moment it was
                     sent. */ }
                { (() =>
                {
                    const timeline: { key: string, time: number, node: ReactNode }[] = [];

                    thread.groups.forEach((group, groupIndex) =>
                    {
                        const mine = (group.userId === ownUserId);

                        group.chats.forEach((chat, chatIndex) =>
                        {
                            const key = `${ groupIndex }-${ chatIndex }`;
                            const time = (chat.date.getTime() - (chat.secondsSinceSent * 1000));
                            const push = (node: ReactNode) => timeline.push({ key, time, node });

                            if(chat.type === MessengerThreadChat.SECURITY_NOTIFICATION)
                            {
                                push(<div key={ key } className="phone-thread-system">{ chat.message }</div>);

                                return;
                            }

                            if(chat.type === MessengerThreadChat.ROOM_INVITE)
                            {
                                push(
                                    <div key={ key } className="phone-thread-invite">
                                        <PhoneIcon icon="map-pin-home" size={ 16 } />
                                        <span>{ chat.message }</span>
                                    </div>
                                );

                                return;
                            }

                            // A JAM INVITE. It travels as an ordinary message so it
                            // lands in the thread like anything else that person
                            // sent - the marker in its text is what turns it back
                            // into something pressable here. A client that did not
                            // know the marker would still show a readable sentence,
                            // which is why the sentence is in there.
                            const jamInvite = ParseJamInvite(chat.message);

                            if(jamInvite)
                            {
                                push(
                                    <div key={ key } className="phone-thread-jam">
                                        <div className="phone-thread-jam-badge">
                                            <PhoneIcon icon="music" size={ 15 } />
                                        </div>
                                        <div className="phone-thread-jam-text">
                                            <div className="phone-thread-jam-title">Jam session</div>
                                            <div className="phone-thread-jam-sub">{ jamInvite.text }</div>
                                        </div>
                                        <div className="phone-tap phone-thread-jam-join" onClick={ event => { JoinJam(jamInvite.jamId); CreateLinkEvent('phone/music-jam'); } }>Join</div>
                                    </div>
                                );

                                return;
                            }

                            const groupChatData = ((isGroup && chat.extraData) ? GetGroupChatData(chat.extraData) : null);
                            const groupMine = (groupChatData ? (groupChatData.userId === ownUserId) : mine);
                            const showSender = (isGroup && !groupMine && groupChatData && (chatIndex === 0));
                            const photoUrl = ParsePhotoMessage(chat.message);

                            push(
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
                    });

                    payRecords.forEach((record: PayRecord) =>
                    {
                        const outgoing = (record.senderId === ownUserId);
                        const key = `pay-${ record.id }`;

                        timeline.push({
                            key,
                            time: (record.createdAt * 1000),
                            node: (
                                <div key={ key } className={ `phone-pay-card-row${ outgoing ? ' is-mine' : '' }` }>
                                    <div className="phone-pay-kicker">{ outgoing ? 'YOU SENT' : `${ (participant?.name ?? 'THEY').toUpperCase() } SENT YOU` }</div>
                                    <div className={ `phone-pay-card${ outgoing ? ' is-out' : ' is-in' }` }>
                                        <div className="phone-pay-amount">
                                            <span className="phone-pay-unit">$</span>
                                            <span className="phone-pay-figure">{ record.amount.toLocaleString() }</span>
                                        </div>
                                        { !!record.note.length &&
                                            <div className="phone-pay-note">&ldquo;{ record.note }&rdquo;</div> }
                                        <div className="phone-pay-foot">
                                            <PhoneIcon icon={ outgoing ? 'check' : 'arrow-down' } size={ 12 } />
                                            <span className="phone-pay-status">{ outgoing ? 'PAID' : 'IN CHECKING' }</span>
                                            <span className="phone-pay-time">{ HotelDate(record.createdAt * 1000).getHours().toString().padStart(2, '0') }:{ HotelDate(record.createdAt * 1000).getMinutes().toString().padStart(2, '0') }</span>
                                        </div>
                                    </div>
                                </div>
                            )
                        });
                    });

                    timeline.sort((a, b) => (a.time - b.time));

                    // Opening a conversation is not forty things arriving at
                    // once. On the first paint of a thread nothing animates;
                    // after that, anything newer than the newest already drawn
                    // does.
                    const sameThread = (seenThreadRef.current === (participant?.id ?? 0));
                    const drawnUpTo = (sameThread ? seenTimeRef.current : Number.MAX_SAFE_INTEGER);

                    return timeline.map(entry =>
                    {
                        if(entry.time <= drawnUpTo) return entry.node;

                        const element = (entry.node as ReactElement);

                        return cloneElement(element, {
                            className: `${ element.props.className ?? '' } is-arriving`
                        });
                    });
                })() }
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
                        { /* Money is the heavier action, so it sits on top.
                             It is absent entirely when the other person has no
                             account: saying why would tell you something about
                             their finances that they did not. */ }
                        { payOffered &&
                            <div className={ `phone-tap phone-pin-menu-item phone-pay-item${ payReady ? '' : ' is-locked' }` } onClick={ openPaySheet }>
                                <span>
                                    Send Money
                                    { !payReady &&
                                        <em className="phone-pay-item-hint">Open an account with Mercury</em> }
                                </span>
                                <PhoneIcon icon="money-card" size={ 18 } />
                            </div> }
                        <div className="phone-tap phone-pin-menu-item" onClick={ openPhotoPicker }>
                            <span>Share Photo</span>
                            <PhoneIcon icon="image" size={ 18 } />
                        </div>
                    </div>
                </div> }
            { !!paySheet && !!payState &&
                <div className="phone-pay-backdrop" onClick={ event => (!payBusy && setPaySheet(null)) }>
                    <div className="phone-pay-sheet" onClick={ event => event.stopPropagation() }>
                        <div className="phone-pay-grab" />

                        { (paySheet === 'amount') &&
                            <>
                                <div className="phone-pay-head">
                                    <div className="phone-pay-badge"><PhoneIcon icon="money-card" size={ 17 } /></div>
                                    <div className="phone-pay-head-text">
                                        <div className="phone-pay-kicker">SEND MONEY</div>
                                        <div className="phone-pay-head-title">To { participant?.name }</div>
                                    </div>
                                    <button type="button" aria-label="Close" className="phone-pay-close" onClick={ event => setPaySheet(null) }>
                                        <PhoneIcon icon="close" size={ 14 } />
                                    </button>
                                </div>

                                <label className="phone-pay-label" htmlFor="phone-pay-amount">AMOUNT</label>
                                <div className="phone-pay-entry">
                                    <span className="phone-pay-entry-unit">$</span>
                                    <input id="phone-pay-amount" type="text" inputMode="numeric" autoComplete="off" value={ payAmount } placeholder="0"
                                        onChange={ event => setPayAmount(event.target.value.replace(/[^0-9]/g, '').substring(0, 6)) } />
                                </div>

                                <div className="phone-pay-chips">
                                    { [ 50, 100, 250, 500 ].map(chip => (
                                        <button key={ chip } type="button" className={ `phone-pay-chip${ (payValue === chip) ? ' is-on' : '' }` }
                                            disabled={ chip > payCeiling } onClick={ event => setPayAmount(chip.toString()) }>{ chip }</button>
                                    )) }
                                </div>

                                <label className="phone-pay-label" htmlFor="phone-pay-note">NOTE (OPTIONAL)</label>
                                <input id="phone-pay-note" type="text" className="phone-pay-note-input" maxLength={ 64 } value={ payNote }
                                    placeholder="What's it for?" onChange={ event => setPayNote(event.target.value) } />

                                <div className="phone-pay-allowance">
                                    <span>Left to send today</span>
                                    <strong>${ payState.remainingToday.toLocaleString() }</strong>
                                </div>

                                { !!payError &&
                                    <div className="phone-pay-error">{ payError }</div> }

                                <button type="button" className="phone-pay-go" disabled={ !payValid } onClick={ event => setPaySheet('confirm') }>
                                    { payValue > 0 ? `Send $${ payValue.toLocaleString() }` : 'Send' }
                                </button>
                                <div className="phone-pay-small">Comes out of checking. Sent money cannot be taken back.</div>
                            </> }

                        { (paySheet === 'confirm') &&
                            <>
                                <div className="phone-pay-kicker phone-pay-centre">CONFIRM</div>
                                <div className="phone-pay-entry is-static">
                                    <span className="phone-pay-entry-unit">$</span>
                                    <span className="phone-pay-entry-figure">{ payValue.toLocaleString() }</span>
                                </div>
                                <div className="phone-pay-to">to <strong>{ participant?.name }</strong></div>
                                { !!payNote.trim().length &&
                                    <div className="phone-pay-to-note">&ldquo;{ payNote.trim() }&rdquo;</div> }

                                <div className="phone-pay-rows">
                                    <div className="phone-pay-row"><span>From</span><strong>Checking</strong></div>
                                    <div className="phone-pay-row"><span>Fee</span><strong className="is-good">None</strong></div>
                                    <div className="phone-pay-row"><span>Left to send today</span><strong>${ Math.max(0, payState.remainingToday - payValue).toLocaleString() }</strong></div>
                                </div>

                                { /* The sheet closes on the SERVER's answer, never on
                                     the tap - that is how a player ends up believing
                                     money moved when it did not. */ }
                                <button type="button" className="phone-pay-go" disabled={ payBusy } onClick={ event => confirmPay() }>
                                    { payBusy ? 'Sending…' : `Send $${ payValue.toLocaleString() }` }
                                </button>
                                <button type="button" className="phone-pay-back" disabled={ payBusy } onClick={ event => setPaySheet('amount') }>Back</button>
                            </> }
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
