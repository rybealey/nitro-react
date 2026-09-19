import { IMessageComposer, IMessageDataWrapper, IMessageEvent, IMessageParser, MessageEvent } from '@nitrots/nitro-renderer';
import { GetCommunication, GetConnection, SendMessageComposer } from '../nitro';

const RP_CATALOG_LOCATE = 4143;
export interface CatalogLocation { pageId: number; itemId: number; }

class CatalogLocateParser implements IMessageParser
{
    public requestId = 0;
    public location: CatalogLocation = null;
    public flush(): boolean { this.location = null; return true; }
    public parse(wrapper: IMessageDataWrapper): boolean
    {
        this.requestId = wrapper.readInt();
        this.location = { pageId: wrapper.readInt(), itemId: wrapper.readInt() };
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
const callbacks = new Map<number, (location: CatalogLocation) => void>();

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
            const handler = callbacks.get(parser.requestId);
            callbacks.delete(parser.requestId);
            if(handler) handler(parser.location);
        }));
        registered = true;
    }
    const requestId = ++sequence;
    callbacks.set(requestId, callback);
    SendMessageComposer(new CatalogLocateComposer(requestId, spriteId, wall));
    return () => { callbacks.delete(requestId); };
};
