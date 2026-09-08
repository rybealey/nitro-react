import { IMessageComposer, IMessageDataWrapper, IMessageEvent, IMessageParser, MessageEvent, RoomObjectCategory, RoomObjectVariable } from '@nitrots/nitro-renderer';
import { GetCommunication, GetConnection, GetRoomEngine, GetRoomSession } from '../nitro';

// PixelRP furni packets - client-source, registered at runtime like the gang,
// corp and chat packets. Wire ids match the emulator's
// Resources/Revisions/1.6.6.json.
const RP_FURNI_ALPHA = 3926; // both directions

export interface RpFurniAlpha
{
    itemId: number;
    alpha: number;
}

// One shape either way: a count, then a pair per item. A slider drag is a
// count of one; room entry is every faded item in the room at once.
export class RpFurniAlphaParser implements IMessageParser
{
    private _items: RpFurniAlpha[] = [];

    public flush(): boolean
    {
        this._items = [];

        return true;
    }

    public parse(wrapper: IMessageDataWrapper): boolean
    {
        if(!wrapper) return false;

        this._items = [];

        let count = wrapper.readInt();

        while(count > 0)
        {
            this._items.push({ itemId: wrapper.readInt(), alpha: wrapper.readInt() });

            count--;
        }

        return true;
    }

    public get items(): RpFurniAlpha[] { return this._items; }
}

export class RpFurniAlphaEvent extends MessageEvent implements IMessageEvent
{
    constructor(callBack: Function)
    {
        super(callBack, RpFurniAlphaParser);
    }

    public getParser(): RpFurniAlphaParser
    {
        return this.parser as RpFurniAlphaParser;
    }
}

// The constructor arguments ARE the wire payload, in order.
export class RpSetFurniAlphaComposer implements IMessageComposer<number[]>
{
    private _data: number[];

    constructor(itemId: number, alpha: number)
    {
        this._data = [ itemId, alpha ];
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

export const ApplyFurniAlpha = (itemId: number, alpha: number): boolean =>
{
    const roomSession = GetRoomSession();

    if(!roomSession) return false;

    const roomObject = (GetRoomEngine().getRoomObject(roomSession.roomId, itemId, RoomObjectCategory.FLOOR)
        || GetRoomEngine().getRoomObject(roomSession.roomId, itemId, RoomObjectCategory.WALL));

    if(!roomObject || !roomObject.model) return false;

    roomObject.model.setValue(RoomObjectVariable.FURNITURE_ALPHA_MULTIPLIER, (alpha / 100));

    return true;
}

// The room's faded items arrive on the heels of the objects packet, and the
// engine builds those objects over the next few ticks - so an item that is not
// there yet is retried rather than dropped.
const RETRY_INTERVAL = 250;
const RETRY_LIMIT = 24;

const pending = new Map<number, number>();
let retries = 0;
let retryTimer: ReturnType<typeof setInterval> = null;

const drainPending = () =>
{
    for(const [ itemId, alpha ] of Array.from(pending))
    {
        if(ApplyFurniAlpha(itemId, alpha)) pending.delete(itemId);
    }

    if(!pending.size || (++retries >= RETRY_LIMIT))
    {
        pending.clear();
        retries = 0;

        clearInterval(retryTimer);

        retryTimer = null;
    }
}

const onFurniAlpha = (event: RpFurniAlphaEvent) =>
{
    for(const item of event.getParser().items)
    {
        if(ApplyFurniAlpha(item.itemId, item.alpha)) continue;

        pending.set(item.itemId, item.alpha);
    }

    if(!pending.size || retryTimer) return;

    retries = 0;
    retryTimer = setInterval(drainPending, RETRY_INTERVAL);
}

let registered = false;

export const RegisterRpFurniMessages = () =>
{
    if(registered) return;

    const connection = GetConnection();

    if(!connection) return;

    connection.registerMessages({
        events: new Map<number, Function>([ [ RP_FURNI_ALPHA, RpFurniAlphaEvent ] ]),
        composers: new Map<number, Function>([ [ RP_FURNI_ALPHA, RpSetFurniAlphaComposer ] ])
    });

    // Registered here rather than from a widget: the faded items land with the
    // room's objects, well before any infostand mounts, and every viewer has to
    // see them whether or not they ever open the tools.
    GetCommunication().registerMessageEvent(new RpFurniAlphaEvent(onFurniAlpha));

    registered = true;
}
