import { IMessageComposer, IMessageDataWrapper, IMessageEvent, IMessageParser, MessageEvent } from '@nitrots/nitro-renderer';
import { GetConnection, SendMessageComposer } from '../nitro';

// PixelRP real estate board (emulator RpRealEstate), and the picture of an
// apartment its owner's client sends walking out of it (RpApartments). Defined
// in client source and registered at runtime, like the Apartments packets.
// Wire ids match the emulator's Resources/Revisions/1.6.6.json.
const RP_REAL_ESTATE = 4239; // server -> client: the board as you see it
const RP_REAL_ESTATE_ACTION = 4238; // client -> server: refresh, buy, visit
const RP_APARTMENT_SNAPSHOT = 4240; // client -> server: a picture of your apartment, as a PNG

/** RpRealEstate.Refresh / Buy / Visit */
export const RealEstateAction = { Refresh: 0, Buy: 1, Visit: 2 };

/** One apartment listed for sale. */
export interface RealEstateListing
{
    roomId: number;
    ownerName: string;
    roomName: string;
    building: string;
    price: number;
    furnished: boolean;
    /** Yours, or one of your own account's characters' - shown, never sold to you. */
    mine: boolean;
    lots: number[];
}

export class RpRealEstateParser implements IMessageParser
{
    private _open = false;
    private _ownsOne = false;
    private _grid = 0;
    private _lotSize = 0;
    private _listings: RealEstateListing[] = [];
    private _notice = '';

    public flush(): boolean
    {
        this._open = false;
        this._ownsOne = false;
        this._grid = 0;
        this._lotSize = 0;
        this._listings = [];
        this._notice = '';

        return true;
    }

    public parse(wrapper: IMessageDataWrapper): boolean
    {
        if(!wrapper) return false;

        this._open = wrapper.readBoolean();
        this._ownsOne = wrapper.readBoolean();
        this._grid = wrapper.readInt();
        this._lotSize = wrapper.readInt();

        let count = wrapper.readInt();

        while(count-- > 0)
        {
            const roomId = wrapper.readInt();
            const ownerName = wrapper.readString();
            const roomName = wrapper.readString();
            const building = wrapper.readString();
            const price = wrapper.readInt();
            const furnished = wrapper.readBoolean();
            const mine = wrapper.readBoolean();
            const lots: number[] = [];

            let lotCount = wrapper.readInt();

            while(lotCount-- > 0) lots.push(wrapper.readInt());

            this._listings.push({ roomId, ownerName, roomName, building, price, furnished, mine, lots });
        }

        this._notice = wrapper.readString();

        return true;
    }

    /** True when the step onto a Real Estate point asked for the board; otherwise only an open board takes it. */
    public get open(): boolean
    {
        return this._open;
    }

    /** Whether you own an apartment already - one each, so you cannot buy. */
    public get ownsOne(): boolean
    {
        return this._ownsOne;
    }

    public get grid(): number
    {
        return this._grid;
    }

    public get lotSize(): number
    {
        return this._lotSize;
    }

    /** Newest first. */
    public get listings(): RealEstateListing[]
    {
        return this._listings;
    }

    /** What to tell the player about their last action; '' for nothing. */
    public get notice(): string
    {
        return this._notice;
    }
}

export class RpRealEstateEvent extends MessageEvent implements IMessageEvent
{
    constructor(callBack: Function)
    {
        super(callBack, RpRealEstateParser);
    }

    public getParser(): RpRealEstateParser
    {
        return this.parser as RpRealEstateParser;
    }
}

export class RpRealEstateActionComposer implements IMessageComposer<[ number, number, number ]>
{
    private _data: [ number, number, number ];

    /** Buy and visit: the listing's room id, and the price shown. */
    constructor(action: number, roomId: number = 0, price: number = 0)
    {
        this._data = [ action, roomId, price ];
    }

    public getMessageArray()
    {
        return this._data;
    }

    public dispose(): void
    { }
}

/** A PNG, length first - as the renderer sends a room thumbnail (RenderRoomMessageComposer). */
export class RpApartmentSnapshotComposer implements IMessageComposer<any[]>
{
    private _data: any[] = [];

    constructor(dataUrl: string)
    {
        const base64 = (dataUrl || '').split(',')[1];

        if(!base64) return;

        const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));

        this._data = [ bytes.byteLength, bytes.buffer ];
    }

    public getMessageArray()
    {
        return this._data;
    }

    public dispose(): void
    {
        this._data = [];
    }
}

export const SendRpRealEstateAction = (action: number, roomId: number = 0, price: number = 0): void =>
    SendMessageComposer(new RpRealEstateActionComposer(action, roomId, price));

export const SendRpApartmentSnapshot = (dataUrl: string): void =>
{
    const composer = new RpApartmentSnapshotComposer(dataUrl);

    if(composer.getMessageArray().length) SendMessageComposer(composer);
}

let registered = false;

export const RegisterRpRealEstateMessages = () =>
{
    if(registered) return;

    const connection = GetConnection();

    if(!connection) return;

    connection.registerMessages({
        events: new Map<number, Function>([
            [ RP_REAL_ESTATE, RpRealEstateEvent ]
        ]),
        composers: new Map<number, Function>([
            [ RP_REAL_ESTATE_ACTION, RpRealEstateActionComposer ],
            [ RP_APARTMENT_SNAPSHOT, RpApartmentSnapshotComposer ]
        ])
    });

    registered = true;
}
