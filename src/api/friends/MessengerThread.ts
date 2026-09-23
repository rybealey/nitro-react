import { GetGroupChatData } from './GetGroupChatData';
import { MessengerFriend } from './MessengerFriend';
import { MessengerGroupType } from './MessengerGroupType';
import { MessengerThreadChat } from './MessengerThreadChat';
import { MessengerThreadChatGroup } from './MessengerThreadChatGroup';

export class MessengerThread
{
    public static MESSAGE_RECEIVED: string = 'MT_MESSAGE_RECEIVED';
    public static THREAD_ID: number = 0;

    private _threadId: number;
    private _participant: MessengerFriend;
    private _groups: MessengerThreadChatGroup[];
    private _lastUpdated: Date;
    private _unreadCount: number;
    private _activity: string;

    constructor(participant: MessengerFriend)
    {
        this._threadId = ++MessengerThread.THREAD_ID;
        this._participant = participant;
        this._groups = [];
        this._lastUpdated = new Date();
        this._unreadCount = 0;
        this._activity = null;
    }

    public addMessage(senderId: number, message: string, secondsSinceSent: number = 0, extraData: string = null, type: number = 0): MessengerThreadChat
    {
        const isGroupChat = (senderId < 0 && extraData);
        const userId = isGroupChat ? GetGroupChatData(extraData).userId : senderId;

        const group = this.getLastGroup(userId);

        if(!group) return;

        if(isGroupChat) group.type = MessengerGroupType.GROUP_CHAT;

        const chat = new MessengerThreadChat(senderId, message, secondsSinceSent, extraData, type);

        group.addChat(chat);

        this._lastUpdated = new Date();

        this._activity = null;
        
        this._unreadCount++;

        return chat;
    }

    private getLastGroup(userId: number): MessengerThreadChatGroup
    {
        let group = this._groups[(this._groups.length - 1)];

        if(group && (group.userId === userId)) return group;

        group = new MessengerThreadChatGroup(userId);

        this._groups.push(group);

        return group;
    }

    // pixelrp: something that happened in the conversation without being a
    // chat line - a Pixel Cash payment. It moves the thread up and, for the
    // person on the receiving end, counts as unread exactly as a message
    // does. The text stands in for the preview until the next real message
    // replaces it, which is why it is kept on the thread rather than worked
    // out from timestamps: a payment's time is the server's clock and a
    // chat's is this one's, and the two need not agree.
    public addActivity(preview: string, unread: boolean): void
    {
        this._activity = preview;
        this._lastUpdated = new Date();

        if(unread) this._unreadCount++;
    }

    public setRead(): void
    {
        this._unreadCount = 0;
    }

    public get threadId(): number
    {
        return this._threadId;
    }

    public get participant(): MessengerFriend
    {
        return this._participant;
    }

    public get groups(): MessengerThreadChatGroup[]
    {
        return this._groups;
    }

    public get lastUpdated(): Date
    {
        return this._lastUpdated;
    }

    public get activity(): string
    {
        return this._activity;
    }

    public get unreadCount(): number
    {
        return this._unreadCount;
    }

    public get unread(): boolean
    {
        return (this._unreadCount > 0);
    }
}
