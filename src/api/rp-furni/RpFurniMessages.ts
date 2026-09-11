import { IMessageComposer, IMessageDataWrapper, IMessageEvent, IMessageParser, IRoomObject, MessageEvent, RoomObjectCategory, RoomObjectVariable } from '@nitrots/nitro-renderer';
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
    /** Whether the tile cursor may show its raised height ring over this furni. */
    heightMarker: boolean;
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
            heightMarker: wrapper.readBoolean(),
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

    constructor(definitionId: number, publicName: string, walkable: boolean, walkMask: string,
        seat: boolean, stackable: boolean, stackHeight: number, adjustableHeights: string,
        heightMarker: boolean, interactionType: string, modes: number, effectId: number,
        behaviourData: number, vendingIds: string)
    {
        this._data = [ definitionId, publicName, walkable, walkMask, seat, stackable,
            Math.round(stackHeight * 100), adjustableHeights, heightMarker, interactionType, modes,
            effectId, behaviourData, vendingIds ];
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

    // The displayed name is client-side too - FurnitureData carries it, loaded
    // from gamedata on disk - so a rename that stopped at the database would
    // change nothing anybody could see.
    if(data.publicName) writable._localizedName = data.publicName;

    writable._canStandOn = data.walkable;
    writable._canSitOn = data.seat;
    // Laying has no column of its own - the emulator reads it off the
    // behaviour, so the client has to derive it the same way.
    writable._canLayOn = ((data.interactionType === 'bed') || (data.interactionType === 'tent_small'));

    if(data.heightMarker) heightMarkerOn.add(data.spriteId);
    else heightMarkerOn.delete(data.spriteId);
}

// ---------------------------------------------------------------------------
// The tile cursor's height ring
// ---------------------------------------------------------------------------
//
// Hovering a tile normally draws the white diamond on the floor. But
// RoomObjectEventHandler.handleMouseOverTile looks at the TOP object on that
// tile for `furniture_is_variable_height`, and when it finds it, sends the
// tile's stack height along with the cursor instead of zero. TileCursorLogic
// then flips the cursor to state 6 for any height over 0.8, and
// TileCursorVisualization raises the cursor's second layer by height * 32 -
// which is the blue ring, hanging at the height a dropped item would land on.
//
// Nothing in the database decides that. FurnitureMultiHeightLogic sets the
// flag on initialize, and a furni only gets that logic because its own .nitro
// bundle asks for `furniture_multiheight`. So the marker belongs to the ASSET,
// and switching it off would otherwise mean rebuilding the bundle.
//
// The ring is OFF for everything by default, and a furni has to be opted in.
// It is a builder's readout that shows for anyone walking past any furni whose
// artwork happens to name `furniture_multiheight`, which is almost never a
// furni somebody stacks on deliberately.
//
// Suppressing by default rather than listing what to suppress also keeps the
// wire quiet: a furni nobody has opted in is never mentioned at all, and the
// opted-in set arrives by the same two routes as the rest of the Function
// record.
//
// The original value is stashed on the object before it is overwritten, so
// opting a furni in restores exactly what its asset asked for rather than
// handing the ring to furni that never had it.
const HEIGHT_MARKER_ORIGINAL = 'pixelrp_height_marker_original';

const heightMarkerOn = new Set<number>();

const ApplyHeightMarker = (object: IRoomObject) =>
{
    if(!object || !object.model) return;

    const spriteId = object.model.getValue<number>(RoomObjectVariable.FURNITURE_TYPE_ID);

    if(!spriteId) return;

    let original = object.model.getValue<number>(HEIGHT_MARKER_ORIGINAL);

    if((original === undefined) || (original === null))
    {
        original = (object.model.getValue<number>(RoomObjectVariable.FURNITURE_IS_VARIABLE_HEIGHT) || 0);

        object.model.setValue(HEIGHT_MARKER_ORIGINAL, original);
    }

    // Never had the flag, so there is nothing to suppress and nothing to give
    // back. That is the overwhelming majority of furni, and it is why this can
    // run over every floor object in a room without costing anything.
    if(!original) return;

    object.model.setValue(RoomObjectVariable.FURNITURE_IS_VARIABLE_HEIGHT, heightMarkerOn.has(spriteId) ? original : 0);
}

/** One object, as the room adds it. */
export const ApplyHeightMarkerToObject = (roomId: number, objectId: number) =>
{
    ApplyHeightMarker(GetRoomEngine().getRoomObject(roomId, objectId, RoomObjectCategory.FLOOR));
}

// Every floor object in the room the player is standing in. Needed twice: a
// staff member applying a change should see it without walking out, and the
// room-entry re-send of edited definitions arrives AFTER the objects it
// describes.
const ApplyHeightMarkerToRoom = () =>
{
    // activeRoomId first: on room ENTRY the definitions arrive right after the
    // objects they describe, and the room session is not always set by then -
    // which would leave exactly the furni this exists for unsuppressed until
    // something else happened to sweep.
    const roomId = (GetRoomEngine()?.activeRoomId || GetRoomSession()?.roomId);

    if(!roomId) return;

    const objects = GetRoomEngine().getRoomObjects(roomId, RoomObjectCategory.FLOOR);

    if(!objects) return;

    for(const object of objects) ApplyHeightMarker(object);
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
    ApplyHeightMarkerToRoom();

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
