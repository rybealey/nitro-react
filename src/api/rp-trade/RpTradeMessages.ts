import { IMessageComposer, IMessageDataWrapper, IMessageEvent, IMessageParser, MessageEvent } from '@nitrots/nitro-renderer';
import { GetConnection } from '../nitro';

// PixelRP backpack trading (emulator RpTrades). Defined in client source and
// registered at runtime, like the deposit box packets. Wire ids match the
// emulator's Resources/Revisions/1.6.6.json.
const RP_TRADE = 4190; // server -> client: the trade window, open or ended
const RP_TRADE_ACTION = 4191; // client -> server: one press in it

/** RpTrades.Action* */
export const TradeAction = { Offer: 1, TakeBack: 2, Ready: 3, Confirm: 4, Cancel: 5 };

/** RpTrades.Result* */
export const TradeResult = { Cancelled: 0, Complete: 1 };

export interface TradeOfferEntry
{
    item: string;
    count: number;
}

export interface TradeSide
{
    offer: TradeOfferEntry[];
    ready: boolean;
    confirmed: boolean;
}

export interface TradeState
{
    id: number;
    partnerId: number;
    partnerName: string;
    mine: TradeSide;
    theirs: TradeSide;
    /** Whether your offer fits their backpack, once their own offer has left it. */
    mineFits: boolean;
    /** Whether their offer fits yours. */
    theirsFits: boolean;
}

export class RpTradeParser implements IMessageParser
{
    private _open = false;
    private _state: TradeState = null;
    private _result = TradeResult.Cancelled;
    private _notice = '';

    public flush(): boolean
    {
        this._open = false;
        this._state = null;
        this._result = TradeResult.Cancelled;
        this._notice = '';

        return true;
    }

    public parse(wrapper: IMessageDataWrapper): boolean
    {
        if(!wrapper) return false;

        this._open = wrapper.readBoolean();

        if(!this._open)
        {
            this._result = wrapper.readInt();
            this._notice = wrapper.readString();

            return true;
        }

        const id = wrapper.readInt();
        const partnerId = wrapper.readInt();
        const partnerName = wrapper.readString();
        const readSide = (): TradeSide =>
        {
            const offer: TradeOfferEntry[] = [];
            let count = wrapper.readInt();

            while(count-- > 0) offer.push({ item: wrapper.readString(), count: wrapper.readInt() });

            return { offer, ready: wrapper.readBoolean(), confirmed: wrapper.readBoolean() };
        };
        const mine = readSide();
        const theirs = readSide();

        this._state = { id, partnerId, partnerName, mine, theirs, mineFits: wrapper.readBoolean(), theirsFits: wrapper.readBoolean() };
        this._notice = wrapper.readString();

        return true;
    }

    public get open(): boolean
    {
        return this._open;
    }

    public get state(): TradeState
    {
        return this._state;
    }

    /** How it ended, when closed. */
    public get result(): number
    {
        return this._result;
    }

    /** Open: about your last press. Closed: how it ended. '' for nothing. */
    public get notice(): string
    {
        return this._notice;
    }
}

export class RpTradeEvent extends MessageEvent implements IMessageEvent
{
    constructor(callBack: Function)
    {
        super(callBack, RpTradeParser);
    }

    public getParser(): RpTradeParser
    {
        return this.parser as RpTradeParser;
    }
}

export class RpTradeActionComposer implements IMessageComposer<[ number, number, boolean, string ]>
{
    private _data: [ number, number, boolean, string ];

    /** Offering names a backpack slot (and whether the whole stack); taking back names the item. */
    constructor(action: number, slot: number = 0, all: boolean = false, item: string = '')
    {
        this._data = [ action, slot, all, item ];
    }

    public getMessageArray()
    {
        return this._data;
    }

    public dispose(): void
    { }
}

let registered = false;

export const RegisterRpTradeMessages = () =>
{
    if(registered) return;

    const connection = GetConnection();

    if(!connection) return;

    connection.registerMessages({
        events: new Map<number, Function>([
            [ RP_TRADE, RpTradeEvent ]
        ]),
        composers: new Map<number, Function>([
            [ RP_TRADE_ACTION, RpTradeActionComposer ]
        ])
    });

    registered = true;
}
