import { IMessageComposer, IMessageDataWrapper, IMessageEvent, IMessageParser, MessageEvent } from '@nitrots/nitro-renderer';
import { GetCommunication, GetConnection, SendMessageComposer } from '../nitro';

// PixelRP :offer / :sell - the card above the chat bar. Client-source packets,
// registered at runtime.
const RP_OFFER = 4149;        // server -> buyer: the card, or the absence of one
const RP_OFFER_REPLY = 4053;  // buyer -> server: tick or cross

export interface RpOffer
{
    id: number;
    sellerName: string;
    itemKey: string;
    label: string;
    quantity: number;
    total: number;
    secondsLeft: number;
    lifetime: number;
    queued: number;
    // Why the tick is dead, in the server's words, or '' when it is not.
    // Never worked out here: whether a backpack has room is a question about
    // rows in a table, and a client that guessed would eventually guess
    // differently from the server that decides.
    blocked: string;
}

export class RpOfferParser implements IMessageParser
{
    private _offer: RpOffer;

    public flush(): boolean
    {
        this._offer = null;

        return true;
    }

    public parse(wrapper: IMessageDataWrapper): boolean
    {
        if(!wrapper) return false;

        if(wrapper.readInt() !== 1)
        {
            this._offer = null;

            return true;
        }

        this._offer = {
            id: wrapper.readInt(),
            sellerName: wrapper.readString(),
            itemKey: wrapper.readString(),
            label: wrapper.readString(),
            quantity: wrapper.readInt(),
            total: wrapper.readInt(),
            secondsLeft: wrapper.readInt(),
            lifetime: wrapper.readInt(),
            queued: wrapper.readInt(),
            blocked: wrapper.readString()
        };

        return true;
    }

    public get offer(): RpOffer { return this._offer; }
}

export class RpOfferEvent extends MessageEvent implements IMessageEvent
{
    constructor(callBack: Function)
    {
        super(callBack, RpOfferParser);
    }

    public getParser(): RpOfferParser
    {
        return this.parser as RpOfferParser;
    }
}

class RpOfferReplyComposer implements IMessageComposer<(string | number)[]>
{
    private _data: (string | number)[];

    constructor(offerId: number, accept: boolean)
    {
        this._data = [ offerId, (accept ? 1 : 0) ];
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

// ---- the store ---------------------------------------------------------------
//
// Module scope, and deliberately: the room widgets unmount on every room
// change, and an offer made a second before you walked through a door should
// still be answerable on the other side if the server still holds it. The
// server is the one that forgets - it drops an offer when either party leaves
// the room - so the client only has to not lose it first.

let current: RpOffer = null;
const listeners = new Set<() => void>();

export const GetRpOffer = (): RpOffer => current;

export const SubscribeRpOffer = (listener: () => void): (() => void) =>
{
    listeners.add(listener);

    return () => { listeners.delete(listener); };
}

export const SendRpOfferReply = (offerId: number, accept: boolean): void =>
    SendMessageComposer(new RpOfferReplyComposer(offerId, accept));

const onOffer = (event: RpOfferEvent) =>
{
    const parser = event.getParser();

    if(!parser) return;

    current = parser.offer;
    listeners.forEach(listener => listener());
}

let registered = false;

export const RegisterRpOfferMessages = () =>
{
    if(registered) return;

    const connection = GetConnection();

    if(!connection) return;

    connection.registerMessages({
        events: new Map<number, Function>([ [ RP_OFFER, RpOfferEvent ] ]),
        composers: new Map<number, Function>([ [ RP_OFFER_REPLY, RpOfferReplyComposer ] ])
    });

    GetCommunication().registerMessageEvent(new RpOfferEvent(onOffer));

    registered = true;
}
