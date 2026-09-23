import { IMessageComposer, IMessageDataWrapper, IMessageEvent, IMessageParser, MessageEvent } from '@nitrots/nitro-renderer';
import { GetCommunication, GetConnection, SendMessageComposer } from '../nitro';

// PixelRP Pixel Cash - sending money to another player from inside a
// conversation. Client-source packets, registered at runtime.
const RP_PAY_THREAD = 4146;   // server -> client: can I pay them, and what has passed between us
const RP_PAY_RECEIPT = 4147;  // server -> both ends: one payment, live
const RP_PAY_RESULT = 4148;   // server -> sender: went / did not go, and why
const RP_PAY_OPEN = 4051;
const RP_PAY_SEND = 4052;

// Matches PixelCash.Eligibility. The two failures are NOT the same failure:
// one is the player's own to fix and is shown disabled, the other is somebody
// else's business and is simply not offered.
export const PAY_OK = 0;
export const PAY_NO_ACCOUNT = 1;
export const PAY_UNAVAILABLE = 2;

export interface PayRecord
{
    id: number;
    senderId: number;
    recipientId: number;
    amount: number;
    note: string;
    createdAt: number;
}

export interface PayThreadState
{
    otherUserId: number;
    state: number;
    min: number;
    max: number;
    remainingToday: number;
}

const readRecord = (wrapper: IMessageDataWrapper): PayRecord => ({
    id: wrapper.readInt(),
    senderId: wrapper.readInt(),
    recipientId: wrapper.readInt(),
    amount: wrapper.readInt(),
    note: wrapper.readString(),
    createdAt: wrapper.readInt()
});

// ---- server -> client -------------------------------------------------------

export class RpPayThreadParser implements IMessageParser
{
    private _state: PayThreadState;
    private _records: PayRecord[];

    public flush(): boolean
    {
        this._state = { otherUserId: 0, state: PAY_UNAVAILABLE, min: 10, max: 10000, remainingToday: 0 };
        this._records = [];

        return true;
    }

    public parse(wrapper: IMessageDataWrapper): boolean
    {
        if(!wrapper) return false;

        this._state = {
            otherUserId: wrapper.readInt(),
            state: wrapper.readInt(),
            min: wrapper.readInt(),
            max: wrapper.readInt(),
            remainingToday: wrapper.readInt()
        };

        this._records = [];

        const count = wrapper.readInt();

        for(let i = 0; i < count; i++) this._records.push(readRecord(wrapper));

        return true;
    }

    public get state(): PayThreadState { return this._state; }
    public get records(): PayRecord[] { return this._records; }
}

export class RpPayThreadEvent extends MessageEvent implements IMessageEvent
{
    constructor(callBack: Function)
    {
        super(callBack, RpPayThreadParser);
    }

    public getParser(): RpPayThreadParser
    {
        return this.parser as RpPayThreadParser;
    }
}

export class RpPayReceiptParser implements IMessageParser
{
    private _record: PayRecord;

    public flush(): boolean
    {
        this._record = { id: 0, senderId: 0, recipientId: 0, amount: 0, note: '', createdAt: 0 };

        return true;
    }

    public parse(wrapper: IMessageDataWrapper): boolean
    {
        if(!wrapper) return false;

        this._record = readRecord(wrapper);

        return true;
    }

    public get record(): PayRecord { return this._record; }
}

export class RpPayReceiptEvent extends MessageEvent implements IMessageEvent
{
    constructor(callBack: Function)
    {
        super(callBack, RpPayReceiptParser);
    }

    public getParser(): RpPayReceiptParser
    {
        return this.parser as RpPayReceiptParser;
    }
}

export class RpPayResultParser implements IMessageParser
{
    private _ok: boolean;
    private _message: string;
    private _remainingToday: number;

    public flush(): boolean
    {
        this._ok = false;
        this._message = '';
        this._remainingToday = 0;

        return true;
    }

    public parse(wrapper: IMessageDataWrapper): boolean
    {
        if(!wrapper) return false;

        this._ok = (wrapper.readInt() === 1);
        this._message = wrapper.readString();
        this._remainingToday = wrapper.readInt();

        return true;
    }

    public get ok(): boolean { return this._ok; }
    public get message(): string { return this._message; }
    public get remainingToday(): number { return this._remainingToday; }
}

export class RpPayResultEvent extends MessageEvent implements IMessageEvent
{
    constructor(callBack: Function)
    {
        super(callBack, RpPayResultParser);
    }

    public getParser(): RpPayResultParser
    {
        return this.parser as RpPayResultParser;
    }
}

// ---- client -> server -------------------------------------------------------

class RpPayComposerBase implements IMessageComposer<(string | number)[]>
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

export class RpPayOpenComposer extends RpPayComposerBase
{
    constructor(otherUserId: number)
    {
        super(otherUserId);
    }
}

export class RpPaySendComposer extends RpPayComposerBase
{
    constructor(recipientId: number, amount: number, note: string)
    {
        super(recipientId, amount, note);
    }
}

// What a payment says where a message would - the conversation list and the
// phone's banner - from the side of whoever is reading it.
export const DescribeRpPay = (record: PayRecord, viewerId: number): string =>
{
    const amount = `$${ Math.max(0, (record?.amount || 0)).toLocaleString('en-US') }`;

    return ((record?.senderId === viewerId) ? `You sent ${ amount }` : `Sent you ${ amount }`);
}

// ---- the store --------------------------------------------------------------
//
// Keyed by the OTHER person, because a receipt can arrive while you are
// reading a different conversation and must land in the right one. The thread
// view reads whatever is filed under the person it is showing.

const states = new Map<number, PayThreadState>();
const records = new Map<number, PayRecord[]>();
const listeners = new Set<() => void>();
const resultListeners = new Set<(ok: boolean, message: string) => void>();

const announce = () => listeners.forEach(listener => listener());

export const GetRpPayState = (otherUserId: number): PayThreadState =>
    (states.get(otherUserId) ?? null);

export const GetRpPayRecords = (otherUserId: number): PayRecord[] =>
    (records.get(otherUserId) ?? []);

export const SubscribeRpPay = (listener: () => void): (() => void) =>
{
    listeners.add(listener);

    return () => { listeners.delete(listener); };
}

export const SubscribeRpPayResult = (listener: (ok: boolean, message: string) => void): (() => void) =>
{
    resultListeners.add(listener);

    return () => { resultListeners.delete(listener); };
}

export const SendRpPayOpen = (otherUserId: number): void =>
    SendMessageComposer(new RpPayOpenComposer(otherUserId));

export const SendRpPay = (recipientId: number, amount: number, note: string): void =>
    SendMessageComposer(new RpPaySendComposer(recipientId, amount, note));

const onThread = (event: RpPayThreadEvent) =>
{
    const parser = event.getParser();

    if(!parser) return;

    states.set(parser.state.otherUserId, parser.state);
    records.set(parser.state.otherUserId, parser.records);
    announce();
}

const onReceipt = (event: RpPayReceiptEvent) =>
{
    const parser = event.getParser();

    if(!parser) return;

    const record = parser.record;
    // Whichever of the two is not us is the conversation it belongs to. We do
    // not know our own id here, so file it under both and let the thread read
    // the one it is showing - a payment always has exactly one of these two as
    // the other party, and the entry under our own id is never read.
    for(const key of [ record.senderId, record.recipientId ])
    {
        const existing = (records.get(key) ?? []);

        if(existing.some(entry => (entry.id === record.id))) continue;

        records.set(key, [ ...existing, record ]);
    }

    announce();
}

const onResult = (event: RpPayResultEvent) =>
{
    const parser = event.getParser();

    if(!parser) return;

    // The allowance moves with every send, so every open conversation's copy
    // of it is stale the moment one goes through.
    states.forEach(state => { state.remainingToday = parser.remainingToday; });
    announce();

    resultListeners.forEach(listener => listener(parser.ok, parser.message));
}

let registered = false;

export const RegisterRpPayMessages = () =>
{
    if(registered) return;

    const connection = GetConnection();

    if(!connection) return;

    connection.registerMessages({
        events: new Map<number, Function>([
            [ RP_PAY_THREAD, RpPayThreadEvent ],
            [ RP_PAY_RECEIPT, RpPayReceiptEvent ],
            [ RP_PAY_RESULT, RpPayResultEvent ]
        ]),
        composers: new Map<number, Function>([
            [ RP_PAY_OPEN, RpPayOpenComposer ],
            [ RP_PAY_SEND, RpPaySendComposer ]
        ])
    });

    GetCommunication().registerMessageEvent(new RpPayThreadEvent(onThread));
    GetCommunication().registerMessageEvent(new RpPayReceiptEvent(onReceipt));
    GetCommunication().registerMessageEvent(new RpPayResultEvent(onResult));

    registered = true;
}
