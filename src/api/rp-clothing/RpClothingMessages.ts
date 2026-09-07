import { IMessageComposer, IMessageDataWrapper, IMessageEvent, IMessageParser, MessageEvent } from '@nitrots/nitro-renderer';
import { GetConfiguration, GetConnection } from '../nitro';

// PixelRP Clothing Store packets - client-source, registered at runtime.
// Wire ids match the emulator's Resources/Revisions/1.6.6.json.
const RP_CLOTHING_STORE = 4018; // server -> client: the shelf
const RP_BUY_CLOTHING_RESULT = 4019; // server -> client
const RP_OPEN_CLOTHING_STORE = 4020; // server -> client (:zara)
const RP_GET_CLOTHING_STORE = 4018; // client -> server
const RP_BUY_CLOTHING = 4019; // client -> server

// Backpack item key prefix for a limited-edition token: clothing:<id>:<edition>
export const CLOTHING_TOKEN_PREFIX = 'clothing:';

export interface ClothingListing
{
    id: number;
    clothingName: string;
    displayName: string;
    // furni classname whose catalog icon is the token's art ('' when none)
    icon: string;
    price: number;
    // > 0: a limited edition of this many copies, sold as a backpack token
    ltdTotal: number;
    ltdSold: number;
    // figuredata set ids the piece unlocks
    partIds: number[];
}

export const IsLtdListing = (listing: ClothingListing) => (listing.ltdTotal > 0);
export const IsSoldOutListing = (listing: ClothingListing) => (IsLtdListing(listing) && (listing.ltdSold >= listing.ltdTotal));

// "clothing_camotank" -> "Camotank" when no display name has been set
export const TidyClothingName = (name: string) =>
{
    const words = name.replace(/^clothing_/, '').split(/[_\s]+/).filter(word => word.length);

    return words.map(word => (word.charAt(0).toUpperCase() + word.slice(1))).join(' ');
}

export const ClothingShelfName = (listing: ClothingListing) => (listing.displayName || TidyClothingName(listing.clothingName));

// the piece's catalog icon (hof_furni icons), or null when it has no furni
export const ClothingIconUrl = (listing: ClothingListing) =>
{
    if(!listing || !listing.icon) return null;

    const template = GetConfiguration<string>('furni.asset.icon.url', '');

    if(!template) return null;

    return template.replace('%libname%', listing.icon).replace('%param%', '');
}

export const ParseClothingToken = (item: string): { clothingId: number, edition: number } =>
{
    if(!item || !item.startsWith(CLOTHING_TOKEN_PREFIX)) return null;

    const fields = item.split(':');
    const clothingId = parseInt(fields[1]);

    if(!clothingId) return null;

    return { clothingId, edition: (parseInt(fields[2]) || 0) };
}

// The last shelf received, kept so the Backpack can name a token without
// the store being open.
const CATALOG: Map<number, ClothingListing> = new Map();
let catalogLoaded = false;

export const GetClothingCatalog = () => CATALOG;
export const IsClothingCatalogLoaded = () => catalogLoaded;

export class RpClothingStoreParser implements IMessageParser
{
    private _listings: ClothingListing[];

    public flush(): boolean
    {
        this._listings = [];

        return true;
    }

    public parse(wrapper: IMessageDataWrapper): boolean
    {
        if(!wrapper) return false;

        const count = wrapper.readInt();

        this._listings = [];

        for(let i = 0; i < count; i++)
        {
            const listing: ClothingListing = { id: wrapper.readInt(), clothingName: wrapper.readString(), displayName: wrapper.readString(), icon: wrapper.readString(), price: wrapper.readInt(), ltdTotal: wrapper.readInt(), ltdSold: wrapper.readInt(), partIds: [] };
            const partCount = wrapper.readInt();

            for(let j = 0; j < partCount; j++) listing.partIds.push(wrapper.readInt());

            this._listings.push(listing);
        }

        CATALOG.clear();

        for(const listing of this._listings) CATALOG.set(listing.id, listing);

        catalogLoaded = true;

        return true;
    }

    public get listings(): ClothingListing[] { return this._listings; }
}

export class RpClothingStoreEvent extends MessageEvent implements IMessageEvent
{
    constructor(callBack: Function)
    {
        super(callBack, RpClothingStoreParser);
    }

    public getParser(): RpClothingStoreParser
    {
        return this.parser as RpClothingStoreParser;
    }
}

export const BUY_CLOTHING_OK = 0;
export const BUY_CLOTHING_INSUFFICIENT = 1;
export const BUY_CLOTHING_BACKPACK_FULL = 2;
export const BUY_CLOTHING_SOLD_OUT = 3;
export const BUY_CLOTHING_NOTHING = 4;

export class RpBuyClothingResultParser implements IMessageParser
{
    private _status: number;
    private _unlocked: number;
    private _tokens: number;

    public flush(): boolean
    {
        this._status = 0;
        this._unlocked = 0;
        this._tokens = 0;

        return true;
    }

    public parse(wrapper: IMessageDataWrapper): boolean
    {
        if(!wrapper) return false;

        this._status = wrapper.readInt();
        this._unlocked = wrapper.readInt();
        this._tokens = wrapper.readInt();

        return true;
    }

    public get status(): number { return this._status; }
    public get unlocked(): number { return this._unlocked; }
    public get tokens(): number { return this._tokens; }
}

export class RpBuyClothingResultEvent extends MessageEvent implements IMessageEvent
{
    constructor(callBack: Function)
    {
        super(callBack, RpBuyClothingResultParser);
    }

    public getParser(): RpBuyClothingResultParser
    {
        return this.parser as RpBuyClothingResultParser;
    }
}

export class RpOpenClothingStoreParser implements IMessageParser
{
    public flush(): boolean
    {
        return true;
    }

    public parse(wrapper: IMessageDataWrapper): boolean
    {
        if(!wrapper) return false;

        wrapper.readInt();

        return true;
    }
}

export class RpOpenClothingStoreEvent extends MessageEvent implements IMessageEvent
{
    constructor(callBack: Function)
    {
        super(callBack, RpOpenClothingStoreParser);
    }
}

class RpClothingComposer implements IMessageComposer<(string | number)[]>
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

export class RpGetClothingStoreComposer extends RpClothingComposer
{
    constructor()
    {
        super();
    }
}

// the catalog_clothing ids on the mannequin that the player does not own yet
export class RpBuyClothingComposer extends RpClothingComposer
{
    constructor(clothingIds: number[])
    {
        super(clothingIds.length, ...clothingIds);
    }
}

let registered = false;

export const RegisterRpClothingMessages = () =>
{
    if(registered) return;

    const connection = GetConnection();

    if(!connection) return;

    connection.registerMessages({
        events: new Map<number, Function>([ [ RP_CLOTHING_STORE, RpClothingStoreEvent ], [ RP_BUY_CLOTHING_RESULT, RpBuyClothingResultEvent ], [ RP_OPEN_CLOTHING_STORE, RpOpenClothingStoreEvent ] ]),
        composers: new Map<number, Function>([ [ RP_GET_CLOTHING_STORE, RpGetClothingStoreComposer ], [ RP_BUY_CLOTHING, RpBuyClothingComposer ] ])
    });

    registered = true;
}
