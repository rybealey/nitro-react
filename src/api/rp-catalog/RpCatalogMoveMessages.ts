import { IMessageComposer, IMessageDataWrapper, IMessageEvent, IMessageParser, MessageEvent } from '@nitrots/nitro-renderer';
import { GetCommunication, GetConnection, SendMessageComposer } from '../nitro';

// PixelRP: staff move a shop listing to another category (RpCatalogMoveFurniEvent).
// The emulator answers every move, refused or not, so the category picker can
// say why a choice did not take.

// client -> server
const RP_CATALOG_MOVE_FURNI = 4200;

// server -> client
const RP_CATALOG_MOVE_FURNI_RESULT = 4201;

// How long to wait before calling an answer lost.
const REPLY_TIMEOUT = 10000;

export interface CatalogMoveResult { moved: boolean; catalogItemId: number; pageId: number; message: string; }

class CatalogMoveResultParser implements IMessageParser
{
    public result: CatalogMoveResult = null;

    public flush(): boolean
    {
        this.result = null;

        return true;
    }

    public parse(wrapper: IMessageDataWrapper): boolean
    {
        this.result = { moved: wrapper.readBoolean(), catalogItemId: wrapper.readInt(), pageId: wrapper.readInt(), message: wrapper.readString() };

        return true;
    }
}

class CatalogMoveResultEvent extends MessageEvent implements IMessageEvent
{
    constructor(callback: Function)
    {
        super(callback, CatalogMoveResultParser);
    }

    public getParser(): CatalogMoveResultParser
    {
        return this.parser as CatalogMoveResultParser;
    }
}

// The constructor arguments ARE the wire payload, in order.
class CatalogMoveFurniComposer implements IMessageComposer<number[]>
{
    private _data: number[];

    constructor(catalogItemId: number, pageId: number)
    {
        this._data = [ catalogItemId, pageId ];
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

let registered = false;
let pending: { catalogItemId: number; pageId: number; handler: (result: CatalogMoveResult) => void; timeout: ReturnType<typeof setTimeout> } = null;

const settle = (result: CatalogMoveResult) =>
{
    if(!pending || (pending.catalogItemId !== result.catalogItemId) || (pending.pageId !== result.pageId)) return;

    const { handler, timeout } = pending;

    clearTimeout(timeout);
    pending = null;
    handler(result);
}

// One move at a time - the picker waits on each. Returns a cancel, so a picker
// closed mid-move does not act on the answer.
export const MoveCatalogFurni = (catalogItemId: number, pageId: number, callback: (result: CatalogMoveResult) => void): (() => void) =>
{
    if(!registered)
    {
        const connection = GetConnection();

        if(!connection) return () => null;

        connection.registerMessages({
            events: new Map<number, Function>([ [ RP_CATALOG_MOVE_FURNI_RESULT, CatalogMoveResultEvent ] ]),
            composers: new Map<number, Function>([ [ RP_CATALOG_MOVE_FURNI, CatalogMoveFurniComposer ] ])
        });
        GetCommunication().registerMessageEvent(new CatalogMoveResultEvent((event: CatalogMoveResultEvent) => settle(event.getParser().result)));
        registered = true;
    }

    if(pending) clearTimeout(pending.timeout);

    pending = { catalogItemId, pageId, handler: callback, timeout: setTimeout(() =>
        settle({ moved: false, catalogItemId, pageId, message: 'No answer from the server. Try again.' }), REPLY_TIMEOUT) };

    SendMessageComposer(new CatalogMoveFurniComposer(catalogItemId, pageId));

    return () =>
    {
        if(pending?.catalogItemId !== catalogItemId) return;

        clearTimeout(pending.timeout);
        pending = null;
    };
}
