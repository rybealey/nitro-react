import { IMessageComposer, IMessageDataWrapper, IMessageEvent, IMessageParser, MessageEvent } from '@nitrots/nitro-renderer';
import { GetCommunication, GetConnection, SendMessageComposer } from '../nitro';

// PixelRP: the shop search runs on the server.
//
// The stock search is client-side and cannot work here. It decides an item is
// purchasable by looking its offer id up in a map the catalog index builds -
// and every catalog row in this hotel carries offer_id -1, which the emulator
// skips when filling that map. The map is empty, every furniture match is
// thrown away for having no page behind it, and the only results left are
// category names. Typing a classname found nothing, because nothing could.
//
// So the query goes to the emulator, which has the whole catalog in memory
// with each item's real page beside it. Each hit comes back with that page,
// which is what makes it buyable: a purchase resolves an item inside a page.

// server -> client
const RP_CATALOG_SEARCH_RESULT = 4118;

// client -> server
const RP_CATALOG_SEARCH = 4121;

export interface RpCatalogHit
{
    pageId: number;
    itemId: number;
    furnitureId: number;
    className: string;
    name: string;
    isWallItem: boolean;
    costCredits: number;
    costPixels: number;
    costDiamonds: number;
}

export class RpCatalogSearchParser implements IMessageParser
{
    private _query: string = '';
    private _hits: RpCatalogHit[] = [];

    public flush(): boolean
    {
        this._query = '';
        this._hits = [];

        return true;
    }

    public parse(wrapper: IMessageDataWrapper): boolean
    {
        if(!wrapper) return false;

        this._query = wrapper.readString();

        const total = wrapper.readInt();
        const hits: RpCatalogHit[] = [];

        for(let i = 0; i < total; i++)
        {
            hits.push({
                pageId: wrapper.readInt(),
                itemId: wrapper.readInt(),
                furnitureId: wrapper.readInt(),
                className: wrapper.readString(),
                name: wrapper.readString(),
                isWallItem: wrapper.readBoolean(),
                costCredits: wrapper.readInt(),
                costPixels: wrapper.readInt(),
                costDiamonds: wrapper.readInt()
            });
        }

        this._hits = hits;

        return true;
    }

    public get query(): string
    {
        return this._query;
    }

    public get hits(): RpCatalogHit[]
    {
        return this._hits;
    }
}

export class RpCatalogSearchEvent extends MessageEvent implements IMessageEvent
{
    constructor(callBack: Function)
    {
        super(callBack, RpCatalogSearchParser);
    }

    public getParser(): RpCatalogSearchParser
    {
        return this.parser as RpCatalogSearchParser;
    }
}

export class RpCatalogSearchComposer implements IMessageComposer<(string | number)[]>
{
    private _data: (string | number)[];

    constructor(query: string)
    {
        this._data = [ query ];
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

export const SendRpCatalogSearch = (query: string): void =>
{
    SendMessageComposer(new RpCatalogSearchComposer(query));
}

let registered = false;
let handler: (query: string, hits: RpCatalogHit[]) => void = null;

/** One listener: there is one search box, and a stale one would answer for it. */
export const SubscribeRpCatalogSearch = (next: (query: string, hits: RpCatalogHit[]) => void): (() => void) =>
{
    handler = next;

    return () => { if(handler === next) handler = null; };
}

const onResult = (event: RpCatalogSearchEvent) =>
{
    const parser = event.getParser();

    if(!parser || !handler) return;

    handler(parser.query, parser.hits);
}

export const RegisterRpCatalogSearchMessages = () =>
{
    if(registered) return;

    const connection = GetConnection();

    if(!connection) return;

    connection.registerMessages({
        events: new Map<number, Function>([
            [ RP_CATALOG_SEARCH_RESULT, RpCatalogSearchEvent ]
        ]),
        composers: new Map<number, Function>([
            [ RP_CATALOG_SEARCH, RpCatalogSearchComposer ]
        ])
    });

    GetCommunication().registerMessageEvent(new RpCatalogSearchEvent(onResult));

    registered = true;
}
