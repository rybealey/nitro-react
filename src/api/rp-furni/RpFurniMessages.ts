import { IMessageComposer, IMessageDataWrapper, IMessageEvent, IMessageParser, MessageEvent, RoomObjectCategory, RoomObjectVariable } from '@nitrots/nitro-renderer';
import { GetCommunication, GetConnection, GetRoomEngine, GetRoomSession, GetSessionDataManager, SendMessageComposer } from '../nitro';

// PixelRP furni packets - client-source, registered at runtime like the gang,
// corp and chat packets. Wire ids match the emulator's
// Resources/Revisions/1.6.6.json.
const RP_FURNI_ALPHA = 3926; // both directions
// The 39xx block is full; these continue past the highest id in use.
const RP_FURNI_FUNCTION = 4111; // both directions
const RP_REQUEST_FURNI_FUNCTION = 4112; // client -> server
const RP_DELETE_INVENTORY_FURNI = 4113; // client -> server

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

    public get items(): RpFurniAlpha[] 
    {
        return this._items; 
    }
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

// ---------------------------------------------------------------------------
// Furni function - editing a furni DEFINITION's behaviour from the infostand.
// ---------------------------------------------------------------------------

export interface RpFurniFunction
{
    definitionId: number;
    spriteId: number;
    itemName: string;
    publicName: string;
    productType: string;
    width: number;
    length: number;
    walkable: boolean;
    walkMask: string;
    seat: boolean;
    stackable: boolean;
    stackHeight: number;
    adjustableHeights: string;
    interactionType: string;
    modes: number;
    effectId: number;
    behaviourData: number;
    vendingIds: string;
    placedCopies: number;
    roomCount: number;
}

export class RpFurniFunctionParser implements IMessageParser
{
    private _data: RpFurniFunction = null;

    public flush(): boolean
    {
        this._data = null;

        return true;
    }

    public parse(wrapper: IMessageDataWrapper): boolean
    {
        if(!wrapper) return false;

        this._data = {
            definitionId: wrapper.readInt(),
            spriteId: wrapper.readInt(),
            itemName: wrapper.readString(),
            publicName: wrapper.readString(),
            productType: wrapper.readString(),
            width: wrapper.readInt(),
            length: wrapper.readInt(),
            walkable: wrapper.readBoolean(),
            walkMask: wrapper.readString(),
            seat: wrapper.readBoolean(),
            stackable: wrapper.readBoolean(),
            // hundredths on the wire, the same format the stack-height widget uses
            stackHeight: (wrapper.readInt() / 100),
            adjustableHeights: wrapper.readString(),
            interactionType: wrapper.readString(),
            modes: wrapper.readInt(),
            effectId: wrapper.readInt(),
            behaviourData: wrapper.readInt(),
            vendingIds: wrapper.readString(),
            placedCopies: wrapper.readInt(),
            roomCount: wrapper.readInt()
        };

        return true;
    }

    public get data(): RpFurniFunction 
    {
        return this._data; 
    }
}

export class RpFurniFunctionEvent extends MessageEvent implements IMessageEvent
{
    constructor(callBack: Function)
    {
        super(callBack, RpFurniFunctionParser);
    }

    public getParser(): RpFurniFunctionParser
    {
        return this.parser as RpFurniFunctionParser;
    }
}

export class RpRequestFurniFunctionComposer implements IMessageComposer<number[]>
{
    private _data: number[];

    constructor(itemId: number)
    {
        this._data = [ itemId ];
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

// A count, then that many item ids. Ids rather than a furni type: the stack the
// player is binning is a CLIENT-side grouping (nitro groups by type AND stuff
// data, so two colours of one sofa are two stacks), and the emulator has no
// notion of it. Naming every id leaves no room for the two sides to disagree
// about what "this stack" means.
export class RpDeleteInventoryFurniComposer implements IMessageComposer<number[]>
{
    private _data: number[];

    constructor(itemIds: number[])
    {
        this._data = [ itemIds.length, ...itemIds ];
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

// The constructor arguments ARE the wire payload, in order - and that order
// has to match RpFurniFunctionEvent.Parse on the emulator exactly.
export class RpSetFurniFunctionComposer implements IMessageComposer<(number | string | boolean)[]>
{
    private _data: (number | string | boolean)[];

    constructor(definitionId: number, walkable: boolean, walkMask: string, seat: boolean,
        stackable: boolean, stackHeight: number, adjustableHeights: string, interactionType: string,
        modes: number, effectId: number, behaviourData: number, vendingIds: string)
    {
        this._data = [ definitionId, walkable, walkMask, seat, stackable, Math.round(stackHeight * 100),
            adjustableHeights, interactionType, modes, effectId, behaviourData, vendingIds ];
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

// Anyone online gets the new record when a change is applied, not just the
// staff member who made it: nitro keeps its OWN copy of these flags in
// FurnitureData, and RoomObjectEventHandler refuses to compute a walk target
// for a furni whose canStandOn/canSitOn/canLayOn are all false. Leave the
// client's copy stale and the server will happily path onto a tile that
// clicking the furni cannot reach.
//
// FurnitureData exposes those three as getters with no setters, so the private
// fields are written directly. Patching the shipped class here beats forking
// nitro-renderer for three booleans.
const PatchFurnitureData = (data: RpFurniFunction) =>
{
    const furniData = ((data.productType === 'i')
        ? GetSessionDataManager().getWallItemData(data.spriteId)
        : GetSessionDataManager().getFloorItemData(data.spriteId));

    if(!furniData) return;

    const writable = (furniData as any);

    writable._canStandOn = data.walkable;
    writable._canSitOn = data.seat;
    // Laying has no column of its own - the emulator reads it off the
    // behaviour, so the client has to derive it the same way.
    writable._canLayOn = ((data.interactionType === 'bed') || (data.interactionType === 'tent_small'));
}

type FurniFunctionListener = (data: RpFurniFunction) => void;

const functionListeners = new Set<FurniFunctionListener>();

export const AddFurniFunctionListener = (listener: FurniFunctionListener) =>
{
    functionListeners.add(listener);

    return () => 
    {
        functionListeners.delete(listener); 
    };
}

const onFurniFunction = (event: RpFurniFunctionEvent) =>
{
    const data = event.getParser().data;

    if(!data) return;

    PatchFurnitureData(data);

    for(const listener of Array.from(functionListeners)) listener(data);
}

export const RequestFurniFunction = (itemId: number) =>
{
    SendMessageComposer(new RpRequestFurniFunctionComposer(itemId));
}

// Matches MaximumItems in RpDeleteInventoryFurniEvent. A stack bigger than one
// message is split rather than refused - a builder with 3,000 blocks still bins
// them in one press.
const DELETE_CHUNK_SIZE = 1000;

// Destroys the listed items outright: no refund, nothing to restore. Everything
// that makes this safe lives on the emulator, which checks every id against the
// sender's own inventory - the confirmation dialog is a courtesy, not a guard.
export const DeleteInventoryFurni = (itemIds: number[]) =>
{
    if(!itemIds || !itemIds.length) return;

    for(let i = 0; i < itemIds.length; i += DELETE_CHUNK_SIZE)
    {
        SendMessageComposer(new RpDeleteInventoryFurniComposer(itemIds.slice(i, (i + DELETE_CHUNK_SIZE))));
    }
}

let registered = false;

export const RegisterRpFurniMessages = () =>
{
    if(registered) return;

    const connection = GetConnection();

    if(!connection) return;

    connection.registerMessages({
        events: new Map<number, Function>([
            [ RP_FURNI_ALPHA, RpFurniAlphaEvent ],
            [ RP_FURNI_FUNCTION, RpFurniFunctionEvent ]
        ]),
        composers: new Map<number, Function>([
            [ RP_FURNI_ALPHA, RpSetFurniAlphaComposer ],
            [ RP_FURNI_FUNCTION, RpSetFurniFunctionComposer ],
            [ RP_REQUEST_FURNI_FUNCTION, RpRequestFurniFunctionComposer ],
            [ RP_DELETE_INVENTORY_FURNI, RpDeleteInventoryFurniComposer ]
        ])
    });

    // Registered here rather than from a widget: the faded items land with the
    // room's objects, well before any infostand mounts, and every viewer has to
    // see them whether or not they ever open the tools.
    GetCommunication().registerMessageEvent(new RpFurniAlphaEvent(onFurniAlpha));

    // Same reasoning: a behaviour change reaches everyone in the hotel, and
    // every client has to patch its furnidata whether or not it ever opens the
    // Function window.
    GetCommunication().registerMessageEvent(new RpFurniFunctionEvent(onFurniFunction));

    registered = true;
}
