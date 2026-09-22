import { IMessageComposer, IMessageDataWrapper, IMessageEvent, IMessageParser, MessageEvent } from '@nitrots/nitro-renderer';
import { GetConnection } from '../nitro';

// PixelRP phone Support packets - client-source, registered at runtime.
const RP_SUPPORT = 4144;        // server -> player: their threads, as Trina
const RP_SUPPORT_QUEUE = 4145;  // server -> staff: the real queue
const RP_SUPPORT_OPEN = 4046;
const RP_SUPPORT_START = 4047;
const RP_SUPPORT_SEND = 4048;
const RP_SUPPORT_STAFF = 4049;
const RP_SUPPORT_AVAILABILITY = 4050;

export const SUPPORT_CATEGORIES: { id: string; label: string; hint: string }[] = [
    { id: 'report', label: 'Report a player', hint: 'Harassment, scamming, cheating' },
    { id: 'broken', label: 'Something is broken', hint: 'Stuck, lost furni, a room fault' },
    { id: 'appeal', label: 'Appeal a ban or mute', hint: 'A moderation decision' },
    { id: 'other', label: 'Something else', hint: 'A question about the hotel' }
];

export const SupportCategoryLabel = (id: string) =>
    SUPPORT_CATEGORIES.find(c => (c.id === id))?.label ?? 'Support';

export interface SupportMessage
{
    id: number;
    fromStaff: boolean;
    body: string;
    createdAt: number;
    // staff view only - the real author. 0 in a player's view, which has no
    // field for it on the wire at all.
    authorId?: number;
}

export interface SupportThread
{
    id: number;
    category: string;
    // A PLAYER only ever sees waiting / open / resolved: 'offered' is folded
    // into waiting server-side, so being held for one staff member and
    // waiting for anyone look the same. Staff additionally see 'offered'.
    status: string;
    createdAt: number;
    updatedAt: number;
    lastBody: string;
    lastFromStaff: boolean;
    // staff view only
    playerId?: number;
    playerName?: string;
    staffId?: number;
    staffName?: string;
    offeredUntil?: number;
    offers?: number;
}

export interface SupportByline
{
    id: number;
    name: string;
    figure: string;
}

// ---- server -> player -------------------------------------------------------

export class RpSupportParser implements IMessageParser
{
    private _byline: SupportByline;
    private _online: boolean;
    private _threads: SupportThread[];
    private _openThreadId: number;
    private _messages: SupportMessage[];

    public flush(): boolean
    {
        this._byline = { id: 0, name: 'Trina', figure: '' };
        this._online = false;
        this._threads = [];
        this._openThreadId = 0;
        this._messages = [];

        return true;
    }

    public parse(wrapper: IMessageDataWrapper): boolean
    {
        if(!wrapper) return false;

        this._byline = { id: wrapper.readInt(), name: wrapper.readString(), figure: wrapper.readString() };
        this._online = (wrapper.readInt() === 1);

        this._threads = [];

        const threadCount = wrapper.readInt();

        for(let i = 0; i < threadCount; i++)
        {
            this._threads.push({
                id: wrapper.readInt(),
                category: wrapper.readString(),
                status: wrapper.readString(),
                createdAt: wrapper.readInt(),
                updatedAt: wrapper.readInt(),
                lastBody: wrapper.readString(),
                lastFromStaff: (wrapper.readInt() === 1)
            });
        }

        this._openThreadId = wrapper.readInt();
        this._messages = [];

        const messageCount = wrapper.readInt();

        for(let i = 0; i < messageCount; i++)
        {
            this._messages.push({
                id: wrapper.readInt(),
                fromStaff: (wrapper.readInt() === 1),
                body: wrapper.readString(),
                createdAt: wrapper.readInt()
            });
        }

        return true;
    }

    public get byline(): SupportByline { return this._byline; }
    public get online(): boolean { return this._online; }
    public get threads(): SupportThread[] { return this._threads; }
    public get openThreadId(): number { return this._openThreadId; }
    public get messages(): SupportMessage[] { return this._messages; }
}

export class RpSupportEvent extends MessageEvent implements IMessageEvent
{
    constructor(callBack: Function)
    {
        super(callBack, RpSupportParser);
    }

    public getParser(): RpSupportParser
    {
        return this.parser as RpSupportParser;
    }
}

// ---- server -> staff --------------------------------------------------------

export class RpSupportQueueParser implements IMessageParser
{
    private _available: boolean;
    private _availableStaff: number;
    private _viewerId: number;
    private _threads: SupportThread[];
    private _openThreadId: number;
    private _messages: SupportMessage[];

    public flush(): boolean
    {
        this._available = false;
        this._availableStaff = 0;
        this._viewerId = 0;
        this._threads = [];
        this._openThreadId = 0;
        this._messages = [];

        return true;
    }

    public parse(wrapper: IMessageDataWrapper): boolean
    {
        if(!wrapper) return false;

        this._available = (wrapper.readInt() === 1);
        this._availableStaff = wrapper.readInt();
        this._viewerId = wrapper.readInt();

        this._threads = [];

        const threadCount = wrapper.readInt();

        for(let i = 0; i < threadCount; i++)
        {
            this._threads.push({
                id: wrapper.readInt(),
                playerId: wrapper.readInt(),
                playerName: wrapper.readString(),
                category: wrapper.readString(),
                status: wrapper.readString(),
                staffId: wrapper.readInt(),
                staffName: wrapper.readString(),
                offeredUntil: wrapper.readInt(),
                offers: wrapper.readInt(),
                createdAt: wrapper.readInt(),
                updatedAt: wrapper.readInt(),
                lastBody: wrapper.readString(),
                lastFromStaff: (wrapper.readInt() === 1)
            });
        }

        this._openThreadId = wrapper.readInt();
        this._messages = [];

        const messageCount = wrapper.readInt();

        for(let i = 0; i < messageCount; i++)
        {
            this._messages.push({
                id: wrapper.readInt(),
                fromStaff: (wrapper.readInt() === 1),
                authorId: wrapper.readInt(),
                body: wrapper.readString(),
                createdAt: wrapper.readInt()
            });
        }

        return true;
    }

    public get available(): boolean { return this._available; }
    public get availableStaff(): number { return this._availableStaff; }
    public get viewerId(): number { return this._viewerId; }
    public get threads(): SupportThread[] { return this._threads; }
    public get openThreadId(): number { return this._openThreadId; }
    public get messages(): SupportMessage[] { return this._messages; }
}

export class RpSupportQueueEvent extends MessageEvent implements IMessageEvent
{
    constructor(callBack: Function)
    {
        super(callBack, RpSupportQueueParser);
    }

    public getParser(): RpSupportQueueParser
    {
        return this.parser as RpSupportQueueParser;
    }
}

// ---- client -> server -------------------------------------------------------

class RpSupportComposerBase implements IMessageComposer<(string | number)[]>
{
    private _data: (string | number)[];

    constructor(...data: (string | number)[])
    {
        this._data = data;
    }

    public getMessageArray()
    {
        return this._data;
    }

    public dispose(): void
    {
        return;
    }
}

// 0 = just the list; a thread id also fetches that thread's messages
export class RpSupportOpenComposer extends RpSupportComposerBase
{
    constructor(threadId: number = 0)
    {
        super(threadId);
    }
}

export class RpSupportStartComposer extends RpSupportComposerBase
{
    constructor(category: string, body: string)
    {
        super(category, body);
    }
}

export class RpSupportSendComposer extends RpSupportComposerBase
{
    constructor(threadId: number, body: string)
    {
        super(threadId, body);
    }
}

// 0 take, 1 close
export class RpSupportStaffComposer extends RpSupportComposerBase
{
    constructor(action: number, threadId: number)
    {
        super(action, threadId);
    }
}

export class RpSupportAvailabilityComposer extends RpSupportComposerBase
{
    constructor(available: boolean)
    {
        super(available ? 1 : 0);
    }
}

let registered = false;

export const RegisterRpSupportMessages = () =>
{
    if(registered) return;

    const connection = GetConnection();

    if(!connection) return;

    connection.registerMessages({
        events: new Map<number, Function>([ [ RP_SUPPORT, RpSupportEvent ], [ RP_SUPPORT_QUEUE, RpSupportQueueEvent ] ]),
        composers: new Map<number, Function>([
            [ RP_SUPPORT_OPEN, RpSupportOpenComposer ],
            [ RP_SUPPORT_START, RpSupportStartComposer ],
            [ RP_SUPPORT_SEND, RpSupportSendComposer ],
            [ RP_SUPPORT_STAFF, RpSupportStaffComposer ],
            [ RP_SUPPORT_AVAILABILITY, RpSupportAvailabilityComposer ]
        ])
    });

    registered = true;
}
