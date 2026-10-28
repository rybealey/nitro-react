import { IMessageComposer, IMessageDataWrapper, IMessageEvent, IMessageParser, MessageEvent } from '@nitrots/nitro-renderer';
import { GetConnection, SendMessageComposer } from '../nitro';

// PixelRP Apartments (emulator RpApartments). Defined in client source and
// registered at runtime, like the Marketplace packets. Wire ids match the
// emulator's Resources/Revisions/1.6.6.json.
const RP_APARTMENT = 4237; // server -> client: the Apartments window as you see it
const RP_APARTMENT_ACTION = 4236; // client -> server: refresh, buy, go, sell back, list, take off sale

/** RpApartments.Refresh / Buy / Enter / SellBack / List / Unlist */
export const ApartmentAction = { Refresh: 0, Buy: 1, Enter: 2, SellBack: 3, List: 4, Unlist: 5 };

export class RpApartmentParser implements IMessageParser
{
    private _open = false;
    private _price = 0;
    private _lotPriceBase = 0;
    private _lotPriceStep = 0;
    private _sellBackPercent = 0;
    private _maxListPrice = 0;
    private _listingFee = 0;
    private _grid = 0;
    private _lotSize = 0;
    private _centreLot = 0;
    private _building = '';
    private _owns = false;
    private _roomId = 0;
    private _roomName = '';
    private _boughtAt = 0;
    private _paid = 0;
    private _listPrice = 0;
    private _lots: number[] = [];
    private _notice = '';

    public flush(): boolean
    {
        this._open = false;
        this._price = 0;
        this._lotPriceBase = 0;
        this._lotPriceStep = 0;
        this._sellBackPercent = 0;
        this._maxListPrice = 0;
        this._listingFee = 0;
        this._grid = 0;
        this._lotSize = 0;
        this._centreLot = 0;
        this._building = '';
        this._owns = false;
        this._roomId = 0;
        this._roomName = '';
        this._boughtAt = 0;
        this._paid = 0;
        this._listPrice = 0;
        this._lots = [];
        this._notice = '';

        return true;
    }

    public parse(wrapper: IMessageDataWrapper): boolean
    {
        if(!wrapper) return false;

        this._open = wrapper.readBoolean();
        this._price = wrapper.readInt();
        this._lotPriceBase = wrapper.readInt();
        this._lotPriceStep = wrapper.readInt();
        this._sellBackPercent = wrapper.readInt();
        this._maxListPrice = wrapper.readInt();
        this._listingFee = wrapper.readInt();
        this._grid = wrapper.readInt();
        this._lotSize = wrapper.readInt();
        this._centreLot = wrapper.readInt();
        this._building = wrapper.readString();
        this._owns = wrapper.readBoolean();
        this._roomId = wrapper.readInt();
        this._roomName = wrapper.readString();
        this._boughtAt = wrapper.readInt();
        this._paid = wrapper.readInt();
        this._listPrice = wrapper.readInt();

        let count = wrapper.readInt();

        while(count-- > 0) this._lots.push(wrapper.readInt());

        this._notice = wrapper.readString();

        return true;
    }

    /** True when the step onto an Apartments point asked for the window; otherwise only an open window takes it. */
    public get open(): boolean
    {
        return this._open;
    }

    /** What an apartment - its first lot - costs, cash in hand. */
    public get price(): number
    {
        return this._price;
    }

    /** What the second lot costs; each one after costs lotPriceStep more. */
    public get lotPriceBase(): number
    {
        return this._lotPriceBase;
    }

    public get lotPriceStep(): number
    {
        return this._lotPriceStep;
    }

    /** How much of everything paid selling back returns. */
    public get sellBackPercent(): number
    {
        return this._sellBackPercent;
    }

    /** The most an apartment may be listed for. */
    public get maxListPrice(): number
    {
        return this._maxListPrice;
    }

    /** What listing on the real estate board costs, cash in hand, each time. */
    public get listingFee(): number
    {
        return this._listingFee;
    }

    /** Lots along each side of the grid. */
    public get grid(): number
    {
        return this._grid;
    }

    /** Tiles along each side of one lot. */
    public get lotSize(): number
    {
        return this._lotSize;
    }

    /** The middle lot - the first one every apartment has. */
    public get centreLot(): number
    {
        return this._centreLot;
    }

    /** The building the window was opened in, e.g. "SF Apartments". */
    public get building(): string
    {
        return this._building;
    }

    public get owns(): boolean
    {
        return this._owns;
    }

    public get roomId(): number
    {
        return this._roomId;
    }

    public get roomName(): string
    {
        return this._roomName;
    }

    /** unix seconds */
    public get boughtAt(): number
    {
        return this._boughtAt;
    }

    /** Everything paid for the apartment and its lots. */
    public get paid(): number
    {
        return this._paid;
    }

    /** Its asking price on the real estate board; 0 while it is not for sale. */
    public get listPrice(): number
    {
        return this._listPrice;
    }

    /** The lots their apartment covers, left to right and top to bottom from 0. */
    public get lots(): number[]
    {
        return this._lots;
    }

    /** What to tell the player about their last action; '' for nothing. */
    public get notice(): string
    {
        return this._notice;
    }
}

export class RpApartmentEvent extends MessageEvent implements IMessageEvent
{
    constructor(callBack: Function)
    {
        super(callBack, RpApartmentParser);
    }

    public getParser(): RpApartmentParser
    {
        return this.parser as RpApartmentParser;
    }
}

export class RpApartmentActionComposer implements IMessageComposer<[ number, number ]>
{
    private _data: [ number, number ];

    /** Buy: the lot picked. List: the asking price. Otherwise 0. */
    constructor(action: number, value: number = 0)
    {
        this._data = [ action, value ];
    }

    public getMessageArray()
    {
        return this._data;
    }

    public dispose(): void
    { }
}

export const SendRpApartmentAction = (action: number, value: number = 0): void =>
    SendMessageComposer(new RpApartmentActionComposer(action, value));

let registered = false;

export const RegisterRpApartmentMessages = () =>
{
    if(registered) return;

    const connection = GetConnection();

    if(!connection) return;

    connection.registerMessages({
        events: new Map<number, Function>([
            [ RP_APARTMENT, RpApartmentEvent ]
        ]),
        composers: new Map<number, Function>([
            [ RP_APARTMENT_ACTION, RpApartmentActionComposer ]
        ])
    });

    registered = true;
}
