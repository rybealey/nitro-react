import { IMessageComposer, IMessageDataWrapper, IMessageEvent, IMessageParser, MessageEvent } from '@nitrots/nitro-renderer';
import { GetCommunication, GetConnection, SendMessageComposer } from '../nitro';

const RP_CATALOG_LOCATE = 4143;

// How long to wait before calling a reply lost. Generous: this only has to
// beat a human wondering why the button never appeared.
const REPLY_TIMEOUT = 10000;

/// Why a furni has no Buy link. The first four mirror the emulator's
/// CatalogLocateStatus; NO_REPLY is the client's own, for an answer that never
/// came - without it a lost packet and "not for sale" look identical.
export enum CatalogLocateStatus
{
    FOUND = 0,
    NOT_SOLD = 1,
    NOT_REACHABLE = 2,
    NOT_PERMITTED = 3,
    NO_REPLY = 4
}

export interface CatalogLocation { pageId: number; itemId: number; status: CatalogLocateStatus; }

class CatalogLocateParser implements IMessageParser
{
    public requestId = 0;
    public location: CatalogLocation = null;
    public flush(): boolean { this.location = null; return true; }
    public parse(wrapper: IMessageDataWrapper): boolean
    {
        this.requestId = wrapper.readInt();
        this.location = { pageId: wrapper.readInt(), itemId: wrapper.readInt(), status: wrapper.readInt() };
        return true;
    }
}

class CatalogLocateEvent extends MessageEvent implements IMessageEvent
{
    constructor(callback: Function) { super(callback, CatalogLocateParser); }
    public getParser(): CatalogLocateParser { return this.parser as CatalogLocateParser; }
}

class CatalogLocateComposer implements IMessageComposer<(number | boolean)[]>
{
    constructor(private readonly requestId: number, private readonly spriteId: number, private readonly wall: boolean) {}
    public getMessageArray() { return [ this.requestId, this.spriteId, this.wall ]; }
    public dispose(): void {}
}

let registered = false;
let sequence = 0;
const callbacks = new Map<number, { handler: (location: CatalogLocation) => void; timeout: ReturnType<typeof setTimeout> }>();

const settle = (requestId: number, location: CatalogLocation) =>
{
    const pending = callbacks.get(requestId);

    if(!pending) return;

    clearTimeout(pending.timeout);
    callbacks.delete(requestId);
    pending.handler(location);
};

// Each selection owns its request; cancelling it prevents an old room item's
// reply from attaching a Buy link to the next item selected.
export const LocateCatalogFurniture = (spriteId: number, wall: boolean, callback: (location: CatalogLocation) => void): (() => void) =>
{
    if(!registered)
    {
        const connection = GetConnection();
        if(!connection) return () => {};
        connection.registerMessages({
            events: new Map<number, Function>([[ RP_CATALOG_LOCATE, CatalogLocateEvent ]]),
            composers: new Map<number, Function>([[ RP_CATALOG_LOCATE, CatalogLocateComposer ]])
        });
        GetCommunication().registerMessageEvent(new CatalogLocateEvent((event: CatalogLocateEvent) =>
        {
            const parser = event.getParser();
            settle(parser.requestId, parser.location);
        }));
        registered = true;
    }
    const requestId = ++sequence;
    // A request that is never answered has to end somewhere. Silence used to
    // leave the Buy button hidden forever with nothing to show for it.
    const timeout = setTimeout(() => settle(requestId,
        { pageId: -1, itemId: -1, status: CatalogLocateStatus.NO_REPLY }), REPLY_TIMEOUT);
    callbacks.set(requestId, { handler: callback, timeout });
    SendMessageComposer(new CatalogLocateComposer(requestId, spriteId, wall));
    return () =>
    {
        const pending = callbacks.get(requestId);

        if(!pending) return;

        clearTimeout(pending.timeout);
        callbacks.delete(requestId);
    };
};
