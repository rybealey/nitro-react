import { IMessageComposer, IMessageDataWrapper, IMessageEvent, IMessageParser, MessageEvent } from '@nitrots/nitro-renderer';
import { GetConnection, SendMessageComposer } from '../nitro';

// PixelRP Marketplace (:mp; emulator RpMarket). Defined in client source and
// registered at runtime, like the deposit box packets. Wire ids match the
// emulator's Resources/Revisions/1.6.6.json.
const RP_MARKET = 4233; // server -> client: the market as you see it
const RP_MARKET_ACTION = 4232; // client -> server: refresh, list, buy, take back

/** RpMarket.Refresh / ListItem / BuyItem / TakeBack */
export const MarketAction = { Refresh: 0, List: 1, Buy: 2, TakeBack: 3 };

/** Somebody else's listing. Anonymous: no seller. */
export interface MarketListing
{
    id: number;
    item: string;
    wear: number;
    /** 0 for an item that does not wear. */
    maxWear: number;
    /** Price of one. */
    price: number;
    /** Still for sale. */
    left: number;
    /** unix seconds */
    listedAt: number;
}

/** One of your own listings: up for sale, or ended having sold. */
export interface MarketOwnListing extends MarketListing
{
    listed: number;
    sold: number;
    /** unix seconds; 0 while it is up. */
    endedAt: number;
}

export class RpMarketParser implements IMessageParser
{
    private _open = false;
    private _canSell = false;
    private _maxListings = 0;
    private _maxPrice = 0;
    private _browse: MarketListing[] = [];
    private _mine: MarketOwnListing[] = [];
    private _notice = '';
    private _unsellable: string[] = [];
    private _now = 0;

    public flush(): boolean
    {
        this._open = false;
        this._canSell = false;
        this._maxListings = 0;
        this._maxPrice = 0;
        this._browse = [];
        this._mine = [];
        this._notice = '';
        this._unsellable = [];
        this._now = 0;

        return true;
    }

    public parse(wrapper: IMessageDataWrapper): boolean
    {
        if(!wrapper) return false;

        this._open = wrapper.readBoolean();
        this._canSell = wrapper.readBoolean();
        this._maxListings = wrapper.readInt();
        this._maxPrice = wrapper.readInt();

        let count = wrapper.readInt();

        while(count-- > 0) this._browse.push({ id: wrapper.readInt(), item: wrapper.readString(), wear: wrapper.readInt(), maxWear: wrapper.readInt(), price: wrapper.readInt(), left: wrapper.readInt(), listedAt: wrapper.readInt() });

        count = wrapper.readInt();

        while(count-- > 0)
        {
            const id = wrapper.readInt();
            const item = wrapper.readString();
            const wear = wrapper.readInt();
            const maxWear = wrapper.readInt();
            const price = wrapper.readInt();
            const listed = wrapper.readInt();
            const left = wrapper.readInt();
            const sold = wrapper.readInt();
            const listedAt = wrapper.readInt();
            const endedAt = wrapper.readInt();

            this._mine.push({ id, item, wear, maxWear, price, listed, left, sold, listedAt, endedAt });
        }

        this._notice = wrapper.readString();

        count = wrapper.readInt();

        while(count-- > 0) this._unsellable.push(wrapper.readString());

        this._now = wrapper.readInt();

        return true;
    }

    /** True when :mp asked for the window; otherwise only an open window takes it. */
    public get open(): boolean
    {
        return this._open;
    }

    /** Whether they have a bank account, which selling needs. */
    public get canSell(): boolean
    {
        return this._canSell;
    }

    /** How many listings one player may have up at once. */
    public get maxListings(): number
    {
        return this._maxListings;
    }

    /** The most one item may be listed for. */
    public get maxPrice(): number
    {
        return this._maxPrice;
    }

    public get browse(): MarketListing[]
    {
        return this._browse;
    }

    public get mine(): MarketOwnListing[]
    {
        return this._mine;
    }

    /** What to tell the player about their last action; '' for nothing. */
    public get notice(): string
    {
        return this._notice;
    }

    /** Item keys that can never be listed - police equipment. Greyed out on the Sell tab. */
    public get unsellable(): string[]
    {
        return this._unsellable;
    }

    /** The server's clock, unix seconds. */
    public get now(): number
    {
        return this._now;
    }
}

export class RpMarketEvent extends MessageEvent implements IMessageEvent
{
    constructor(callBack: Function)
    {
        super(callBack, RpMarketParser);
    }

    public getParser(): RpMarketParser
    {
        return this.parser as RpMarketParser;
    }
}

export class RpMarketActionComposer implements IMessageComposer<[ number, number, number, number ]>
{
    private _data: [ number, number, number, number ];

    /** List: slot, quantity, price each. Buy and take back: the listing id. */
    constructor(action: number, a: number = 0, b: number = 0, c: number = 0)
    {
        this._data = [ action, a, b, c ];
    }

    public getMessageArray()
    {
        return this._data;
    }

    public dispose(): void
    { }
}

export const SendRpMarketAction = (action: number, a: number = 0, b: number = 0, c: number = 0): void =>
    SendMessageComposer(new RpMarketActionComposer(action, a, b, c));

let registered = false;

export const RegisterRpMarketMessages = () =>
{
    if(registered) return;

    const connection = GetConnection();

    if(!connection) return;

    connection.registerMessages({
        events: new Map<number, Function>([
            [ RP_MARKET, RpMarketEvent ]
        ]),
        composers: new Map<number, Function>([
            [ RP_MARKET_ACTION, RpMarketActionComposer ]
        ])
    });

    registered = true;
}
