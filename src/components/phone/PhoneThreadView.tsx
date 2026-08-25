import { FC, KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react';
import { GetGroupChatData, GetSessionDataManager, GetUserProfile, MessengerThread, MessengerThreadChat, ReportType } from '../../api';
import { MESSENGER_RECEIPT_READ, useFriends, useHelp, useMessenger } from '../../hooks';
import { PhoneAvatar } from './PhoneAvatar';
import { PhoneIcon } from './PhoneIcon';
import { usePhonePrefs } from './usePhone';

// One conversation: chat bubbles + composer. The header's speaker icon
// mutes the conversation (drops it from badge counts); the overflow menu
// carries the classic messenger actions (follow, profile, report, delete).

interface PhoneThreadViewProps
{
    thread: MessengerThread;
    onBack: () => void;
    onDeleted: () => void;
}

export const PhoneThreadView: FC<PhoneThreadViewProps> = props =>
{
    const { thread = null, onBack = null, onDeleted = null } = props;
    const { sendMessage = null, closeThread = null, receipts = {}} = useMessenger();
    const { getFriend = null, followFriend = null } = useFriends();
    const { mutedIds, toggleMuted } = usePhonePrefs();
    const { report = null } = useHelp();
    const [ messageText, setMessageText ] = useState('');
    const [ menuOpen, setMenuOpen ] = useState(false);
    const messagesBox = useRef<HTMLDivElement>(null);

    const participant = (thread ? thread.participant : null);
    const isGroup = (participant && (participant.id <= 0));
    const friend = ((participant && !isGroup && getFriend) ? getFriend(participant.id) : null);
    const online = (friend ? friend.online : false);
    const muted = ((participant && !isGroup) ? (mutedIds.indexOf(participant.id) >= 0) : false);
    const ownUserId = GetSessionDataManager().userId;

    const chatCount = useMemo(() =>
    {
        if(!thread) return 0;

        return thread.groups.reduce((total, group) => (total + group.chats.length), 0);
    }, [ thread ]);

    useEffect(() =>
    {
        if(messagesBox.current) messagesBox.current.scrollTop = messagesBox.current.scrollHeight;
    }, [ chatCount, thread ]);

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

    if(!isGroup)
    {
        const lastChat = findLastChat();

        if(lastChat && lastChat.mine)
        {
            receiptText = 'Sent';

            const receipt = receipts[participant.id];

            if(receipt && (receipt.date >= lastChat.date))
            {
                receiptText = ((receipt.type === MESSENGER_RECEIPT_READ) ? `Read at ${ receipt.date.getHours().toString().padStart(2, '0') }:${ receipt.date.getMinutes().toString().padStart(2, '0') }` : 'Delivered');
            }
        }
    }

    const send = () =>
    {
        const text = messageText.trim();

        if(!text.length || !sendMessage) return;

        sendMessage(thread, ownUserId, text);
        setMessageText('');
    }

    const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) =>
    {
        if(event.key !== 'Enter') return;

        send();
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

                        return (
                            <div key={ key } className={ `phone-thread-bubble-row${ groupMine ? ' is-mine' : '' }` }>
                                <div className="phone-thread-bubble-stack">
                                    { showSender &&
                                        <div className="phone-thread-sender">{ groupChatData.username }</div> }
                                    <div className={ `phone-thread-bubble${ groupMine ? ' is-mine' : '' }` }>{ chat.message }</div>
                                </div>
                            </div>
                        );
                    });
                }) }
                { receiptText &&
                    <div className="phone-thread-receipt">{ receiptText }</div> }
            </div>
            <div className="phone-thread-input">
                <input type="text" spellCheck={ false } maxLength={ 255 } placeholder="Message" value={ messageText } onChange={ event => setMessageText(event.target.value) } onKeyDown={ onKeyDown } />
                <div className={ `phone-tap phone-thread-send${ messageText.trim().length ? ' is-ready' : '' }` } title="Send" onClick={ send }>
                    <PhoneIcon icon="arrow-up" size={ 20 } />
                </div>
            </div>
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
