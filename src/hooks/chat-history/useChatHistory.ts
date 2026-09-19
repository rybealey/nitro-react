import { GetGuestRoomResultEvent, NewConsoleMessageEvent, RoomInviteEvent, RoomSessionEvent } from '@nitrots/nitro-renderer';
import { useState } from 'react';
import { useBetween } from 'use-between';
import { ChatEntryType, ChatHistoryCurrentDate, IChatEntry, IRoomHistoryEntry, MessengerHistoryCurrentDate } from '../../api';
import { useMessageEvent, useRoomSessionManagerEvent } from '../events';

const CHAT_HISTORY_MAX = 1000;
// Mentions live in their own list rather than being filtered out of the chat
// log on demand: the log keeps only the last CHAT_HISTORY_MAX lines, so in a
// busy room a mention would quietly age out of the tab while still unread.
const MENTIONS_MAX = 200;
// Gang chat is kept in its own list for the same reason as mentions: it is a
// conversation, and one busy room would age it out of a filtered view.
const GANG_CHAT_MAX = 200;
const ROOM_HISTORY_MAX = 10;
const MESSENGER_HISTORY_MAX = 1000;

let CHAT_HISTORY_COUNTER: number = 0;
let MENTIONS_COUNTER: number = 0;
let GANG_CHAT_COUNTER: number = 0;
let MESSENGER_HISTORY_COUNTER: number = 0;

const useChatHistoryState = () =>
{
    const [ chatHistory, setChatHistory ] = useState<IChatEntry[]>([]);
    const [ roomHistory, setRoomHistory ] = useState<IRoomHistoryEntry[]>([]);
    const [ messengerHistory, setMessengerHistory ] = useState<IChatEntry[]>([]);
    const [ mentions, setMentions ] = useState<IChatEntry[]>([]);
    const [ mentionsUnread, setMentionsUnread ] = useState(0);
    const [ gangChat, setGangChat ] = useState<IChatEntry[]>([]);
    const [ gangUnread, setGangUnread ] = useState(0);
    const [ needsRoomInsert, setNeedsRoomInsert ] = useState(false);

    const addChatEntry = (entry: IChatEntry) =>
    {
        entry.id = CHAT_HISTORY_COUNTER++;

        setChatHistory(prevValue =>
        {
            const newValue = [ ...prevValue ];

            newValue.push(entry);

            if(newValue.length > CHAT_HISTORY_MAX) newValue.shift();

            return newValue;
        });
    }

    // Given its own copy of the entry: addChatEntry stamps an id from the chat
    // counter, and the two lists number their rows separately.
    const addMention = (entry: IChatEntry) =>
    {
        entry.id = MENTIONS_COUNTER++;

        setMentions(prevValue =>
        {
            const newValue = [ ...prevValue, entry ];

            if(newValue.length > MENTIONS_MAX) newValue.shift();

            return newValue;
        });

        setMentionsUnread(prevValue => (prevValue + 1));
    }

    const clearMentionsUnread = () => setMentionsUnread(0);

    // Its own copy and its own counter, exactly as addMention does.
    const addGangEntry = (entry: IChatEntry) =>
    {
        entry.id = GANG_CHAT_COUNTER++;

        setGangChat(prevValue =>
        {
            const newValue = [ ...prevValue, entry ];

            if(newValue.length > GANG_CHAT_MAX) newValue.shift();

            return newValue;
        });

        setGangUnread(prevValue => (prevValue + 1));
    }

    const clearGangUnread = () => setGangUnread(0);

    const addRoomHistoryEntry = (entry: IRoomHistoryEntry) =>
    {
        setRoomHistory(prevValue =>
        {
            const newValue = [ ...prevValue ];

            newValue.push(entry);

            if(newValue.length > ROOM_HISTORY_MAX) newValue.shift();

            return newValue;
        });
    }

    const addMessengerEntry = (entry: IChatEntry) =>
    {
        entry.id = MESSENGER_HISTORY_COUNTER++;

        setMessengerHistory(prevValue =>
        {
            const newValue = [ ...prevValue ];

            newValue.push(entry);

            if(newValue.length > MESSENGER_HISTORY_MAX) newValue.shift();

            return newValue;
        });
    }

    useRoomSessionManagerEvent<RoomSessionEvent>(RoomSessionEvent.STARTED, event => setNeedsRoomInsert(true));

    useMessageEvent<GetGuestRoomResultEvent>(GetGuestRoomResultEvent, event =>
    {
        if(!needsRoomInsert) return;

        const parser = event.getParser();

        if(roomHistory.length)
        {
            if(roomHistory[(roomHistory.length - 1)].id === parser.data.roomId) return;
        }

        addChatEntry({ id: -1, webId: -1, entityId: -1, name: parser.data.roomName, timestamp: ChatHistoryCurrentDate(), type: ChatEntryType.TYPE_ROOM_INFO, roomId: parser.data.roomId });

        addRoomHistoryEntry({ id: parser.data.roomId, name: parser.data.roomName });

        setNeedsRoomInsert(false);
    });

    useMessageEvent<NewConsoleMessageEvent>(NewConsoleMessageEvent, event =>
    {
        const parser = event.getParser();

        addMessengerEntry({ id: -1, webId: parser.senderId, entityId: -1, name: '', message: parser.messageText, roomId: -1, timestamp: MessengerHistoryCurrentDate(parser.secondsSinceSent), type: ChatEntryType.TYPE_IM });
    });

    useMessageEvent<RoomInviteEvent>(RoomInviteEvent, event =>
    {
        const parser = event.getParser();

        addMessengerEntry({ id: -1, webId: parser.senderId, entityId: -1, name: '', message: parser.messageText, roomId: -1, timestamp: MessengerHistoryCurrentDate(), type: ChatEntryType.TYPE_IM });
    });
    
    return { addChatEntry, addMention, clearMentionsUnread, addGangEntry, clearGangUnread, chatHistory, roomHistory, messengerHistory, mentions, mentionsUnread, gangChat, gangUnread };
}

export const useChatHistory = () => useBetween(useChatHistoryState);
