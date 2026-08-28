import { NewConsoleMessageEvent, RoomInviteErrorEvent, RoomInviteEvent, RpMessengerFriendTypingEvent, RpMessengerMarkReadComposer, RpMessengerReceiptEvent, RpMessengerTypingComposer, SendMessageComposer as SendMessageComposerPacket } from '@nitrots/nitro-renderer';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useBetween } from 'use-between';
import { CloneObject, GetSessionDataManager, LocalizeText, MessengerIconState, MessengerThread, MessengerThreadChat, NotificationAlertType, PlaySound, SendMessageComposer, SoundNames } from '../../api';
import { useMessageEvent } from '../events';
import { useNotification } from '../notification';
import { useFriends } from './useFriends';

// Live delivered/read receipt per friend id (pixelrp custom packets). The
// latest receipt wins; nothing is persisted — like the threads themselves,
// receipts are session-scoped.
export interface MessengerReceipt
{
    type: number; // MESSENGER_RECEIPT_DELIVERED | MESSENGER_RECEIPT_READ
    date: Date;
}

export const MESSENGER_RECEIPT_DELIVERED: number = 1;
export const MESSENGER_RECEIPT_READ: number = 2;

const useMessengerState = () =>
{
    const [ messageThreads, setMessageThreads ] = useState<MessengerThread[]>([]);
    const [ activeThreadId, setActiveThreadId ] = useState<number>(-1);
    const [ hiddenThreadIds, setHiddenThreadIds ] = useState<number[]>([]);
    const [ iconState, setIconState ] = useState<number>(MessengerIconState.HIDDEN);
    const [ receipts, setReceipts ] = useState<Record<number, MessengerReceipt>>({});
    // Friend ids currently typing a message to us (live, pixelrp custom packet).
    const [ typingFriendIds, setTypingFriendIds ] = useState<number[]>([]);
    const typingTimers = useRef<Record<number, number>>({});
    const { getFriend = null } = useFriends();
    const { simpleAlert = null } = useNotification();

    const visibleThreads = useMemo(() => messageThreads.filter(thread => (hiddenThreadIds.indexOf(thread.threadId) === -1)), [ messageThreads, hiddenThreadIds ]);
    const activeThread = useMemo(() => ((activeThreadId > 0) && visibleThreads.find(thread => (thread.threadId === activeThreadId) || null)), [ activeThreadId, visibleThreads ]);

    const getMessageThread = (userId: number) =>
    {
        let thread = messageThreads.find(thread => (thread.participant && (thread.participant.id === userId)));

        if(!thread)
        {
            const friend = getFriend(userId);

            if(!friend) return null;
    
            thread = new MessengerThread(friend);

            thread.addMessage(null, LocalizeText('messenger.moderationinfo'), 0, null, MessengerThreadChat.SECURITY_NOTIFICATION);

            thread.setRead();
    
            setMessageThreads(prevValue =>
            {
                const newValue = [ ...prevValue ];
    
                newValue.push(thread);
    
                return newValue;
            });
        }
        else
        {
            const hiddenIndex = hiddenThreadIds.indexOf(thread.threadId);

            if(hiddenIndex >= 0)
            {
                setHiddenThreadIds(prevValue =>
                {
                    const newValue = [ ...prevValue ];
    
                    newValue.splice(hiddenIndex, 1);
    
                    return newValue;
                })
            }
        }

        return thread;
    }

    const closeThread = (threadId: number) =>
    {
        setHiddenThreadIds(prevValue =>
        {
            const newValue = [ ...prevValue ];

            if(newValue.indexOf(threadId) >= 0) return prevValue;

            newValue.push(threadId);

            return newValue;
        });

        if(activeThreadId === threadId) setActiveThreadId(-1);
    }

    // Tell the server this friend's conversation was just read, so they get
    // a live "Read at" receipt on their phone.
    const sendMarkRead = (thread: MessengerThread) =>
    {
        if(!thread || !thread.participant || (thread.participant.id <= 0)) return;

        SendMessageComposer(new RpMessengerMarkReadComposer(thread.participant.id));
    }

    // Track a friend's live typing state, with a safety timeout so the
    // indicator always clears even if a "stopped" packet never arrives.
    const setFriendTyping = (friendId: number, typing: boolean) =>
    {
        if(!friendId || (friendId <= 0)) return;

        window.clearTimeout(typingTimers.current[friendId]);

        if(typing)
        {
            setTypingFriendIds(prevValue => ((prevValue.indexOf(friendId) >= 0) ? prevValue : [ ...prevValue, friendId ]));

            typingTimers.current[friendId] = window.setTimeout(() => setFriendTyping(friendId, false), 8000);
        }
        else
        {
            delete typingTimers.current[friendId];

            setTypingFriendIds(prevValue => prevValue.filter(id => (id !== friendId)));
        }
    }

    // Tell the server we are (or stopped) typing to this friend, for their
    // live typing indicator. Direct-message friends only.
    const sendTyping = (friendId: number, typing: boolean) =>
    {
        if(!friendId || (friendId <= 0)) return;

        SendMessageComposer(new RpMessengerTypingComposer(friendId, typing));
    }

    const sendMessage = (thread: MessengerThread, senderId: number, messageText: string, secondsSinceSent: number = 0, extraData: string = null, messageType: number = MessengerThreadChat.CHAT) =>
    {
        if(!thread || !messageText || !messageText.length) return;

        const ownMessage = (senderId === GetSessionDataManager().userId);

        if(!ownMessage && (activeThreadId === thread.threadId)) sendMarkRead(thread);

        if(ownMessage && (messageText.length <= 255)) SendMessageComposer(new SendMessageComposerPacket(thread.participant.id, messageText));

        setMessageThreads(prevValue =>
        {
            const newValue = [ ...prevValue ];
            const index = newValue.findIndex(newThread => (newThread.threadId === thread.threadId));

            if(index === -1) return prevValue;

            thread = CloneObject(newValue[index]);

            if(ownMessage && (thread.groups.length === 1)) PlaySound(SoundNames.MESSENGER_NEW_THREAD);

            thread.addMessage(((messageType === MessengerThreadChat.ROOM_INVITE) ? null : senderId), messageText, secondsSinceSent, extraData, messageType);

            if(activeThreadId === thread.threadId) thread.setRead();

            newValue[index] = thread;

            if(!ownMessage && thread.unread) PlaySound(SoundNames.MESSENGER_MESSAGE_RECEIVED);

            return newValue;
        });
    }

    useMessageEvent<NewConsoleMessageEvent>(NewConsoleMessageEvent, event =>
    {
        const parser = event.getParser();
        const thread = getMessageThread(parser.senderId);

        if(!thread) return;

        // A message arriving means they've stopped typing.
        setFriendTyping(parser.senderId, false);

        sendMessage(thread, parser.senderId, parser.messageText, parser.secondsSinceSent, parser.extraData);
    });

    useMessageEvent<RoomInviteEvent>(RoomInviteEvent, event =>
    {
        const parser = event.getParser();
        const thread = getMessageThread(parser.senderId);

        if(!thread) return;

        sendMessage(thread, parser.senderId, parser.messageText, 0, null, MessengerThreadChat.ROOM_INVITE);
    });

    useMessageEvent<RpMessengerReceiptEvent>(RpMessengerReceiptEvent, event =>
    {
        const parser = event.getParser();

        if(!parser || (parser.friendId <= 0)) return;

        setReceipts(prevValue => ({ ...prevValue, [parser.friendId]: { type: parser.type, date: new Date() }}));
    });

    useMessageEvent<RpMessengerFriendTypingEvent>(RpMessengerFriendTypingEvent, event =>
    {
        const parser = event.getParser();

        if(!parser || (parser.friendId <= 0)) return;

        setFriendTyping(parser.friendId, parser.typing);
    });

    useMessageEvent<RoomInviteErrorEvent>(RoomInviteErrorEvent, event =>
    {
        const parser = event.getParser();
        
        simpleAlert(`Received room invite error: ${ parser.errorCode },recipients: ${ parser.failedRecipients }`, NotificationAlertType.DEFAULT, null, null, LocalizeText('friendlist.alert.title'));
    });

    useEffect(() =>
    {
        if(activeThreadId <= 0) return;

        sendMarkRead(messageThreads.find(thread => (thread.threadId === activeThreadId)));

        setMessageThreads(prevValue =>
        {
            const newValue = [ ...prevValue ];
            const index = newValue.findIndex(newThread => (newThread.threadId === activeThreadId));

            if(index >= 0)
            {
                newValue[index] = CloneObject(newValue[index]);

                newValue[index].setRead();
            }

            return newValue;
        });
    }, [ activeThreadId ]);

    useEffect(() =>
    {
        setIconState(prevValue =>
        {
            if(!visibleThreads.length) return MessengerIconState.HIDDEN;

            let isUnread = false;

            for(const thread of visibleThreads)
            {
                if(thread.unreadCount > 0)
                {
                    isUnread = true;

                    break;
                }
            }

            if(isUnread) return MessengerIconState.UNREAD;

            return MessengerIconState.SHOW;
        });
    }, [ visibleThreads ]);

    return { messageThreads, activeThread, iconState, visibleThreads, receipts, typingFriendIds, getMessageThread, setActiveThreadId, closeThread, sendMessage, sendTyping };
}

export const useMessenger = () => useBetween(useMessengerState);
