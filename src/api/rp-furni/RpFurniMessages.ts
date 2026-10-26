import { IMessageComposer, IMessageDataWrapper, IMessageEvent, IMessageParser, IRoomObject, MessageEvent, RoomEngineObjectEvent, RoomObjectCategory, RoomObjectVariable } from '@nitrots/nitro-renderer';
import { GetCommunication, GetConnection, GetRoomEngine, GetRoomSession, GetSessionDataManager, SendMessageComposer } from '../nitro';

// PixelRP furni packets - client-source, registered at runtime like the gang,
// corp and chat packets. Wire ids match the emulator's
// Resources/Revisions/1.6.6.json.
const RP_FURNI_ALPHA = 3926; // both directions
// The 39xx block is full; these continue past the highest id in use.
const RP_FURNI_FUNCTION = 4111; // both directions
const RP_REQUEST_FURNI_FUNCTION = 4112; // client -> server
const RP_DELETE_INVENTORY_FURNI = 4113; // client -> server
const RP_CATALOG_RENAME_FURNI = 4142; // client -> server

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
    /** Inert - see the height ring note below. Carried so a save writes back what is stored. */
    heightMarker: boolean;
    interactionType: string;
    modes: number;
    effectId: number;
    behaviourData: number;
    vendingIds: string;
    placedCopies: number;
    roomCount: number;
    /** Avatars lie across this furni instead of along it (laying furni only). */
    layAcross: boolean;
    /** Turn added to the furni's rotation for a sitter: 0, 2, 4 or 6, a quarter-turn right per 2. */
    sitRotation: number;
    /** How high a sitter sits above the furni's base, in tiles, or -1 for the stack height. */
    sitHeight: number;
}

// Hundredths on the wire; anything below 0 is "the stack height".
const sitHeightFromWire = (value: number): number => ((value < 0) ? -1 : (value / 100));

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
            roomCount: wrapper.readInt(),
            // last on the wire - see RpFurniFunctionComposer
            layAcross: wrapper.readBoolean(),
            sitRotation: wrapper.readInt(),
            sitHeight: sitHeightFromWire(wrapper.readInt())
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

/**
 * Rename a furni DEFINITION from the catalog, without owning one.
 *
 * The Function tool can only rename a piece placed in the room you are standing
 * in - that is its proof you were looking at it. In the shop the equivalent
 * proof is that the definition is on a page, which the server checks; the id
 * here is not trusted on its own.
 */
export class RpCatalogRenameFurniComposer implements IMessageComposer<(string | number)[]>
{
    private _data: (string | number)[];

    constructor(definitionId: number, publicName: string)
    {
        this._data = [ definitionId, publicName ];
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

export const SendRpCatalogRenameFurni = (definitionId: number, publicName: string): void =>
    SendMessageComposer(new RpCatalogRenameFurniComposer(definitionId, publicName));

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

    /**
     * scopeItemId 0 edits the DEFINITION, hotel-wide, as this tool always has.
     * Anything else is the one placed item to scope the change to - and then
     * only the five fields the client does not mirror take effect, because
     * FurnitureData is keyed by furni class rather than by item. See
     * 136_ItemFunctionOverrides.
     */
    constructor(definitionId: number, publicName: string, walkable: boolean, walkMask: string,
        seat: boolean, stackable: boolean, stackHeight: number, adjustableHeights: string,
        heightMarker: boolean, interactionType: string, modes: number, effectId: number,
        behaviourData: number, vendingIds: string, scopeItemId: number = 0, layAcross: boolean = false,
        width: number = 0, length: number = 0, sitRotation: number = 0, sitHeight: number = -1)
    {
        // layAcross rides LAST, after scopeItemId, so the emulator can tell a
        // client that never sent it from one that sent false. The size, Sit
        // facing and Sit height follow it for the same reason; a size of 0
        // keeps the size the furni has, a sit height of -1 is the stack height.
        this._data = [ definitionId, publicName, walkable, walkMask, seat, stackable,
            Math.round(stackHeight * 100), adjustableHeights, heightMarker, interactionType, modes,
            effectId, behaviourData, vendingIds, scopeItemId, layAcross, width, length, sitRotation,
            ((sitHeight < 0) ? -1 : Math.round(sitHeight * 100)) ];
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
const PatchFurnitureData = (data: RpFurniFunction): boolean =>
{
    const furniData = ((data.productType === 'i')
        ? GetSessionDataManager().getWallItemData(data.spriteId)
        : GetSessionDataManager().getFloorItemData(data.spriteId));

    if(!furniData) return false;

    const writable = (furniData as any);

    // The displayed name is client-side too - FurnitureData carries it, loaded
    // from gamedata on disk - so a rename that stopped at the database would
    // change nothing anybody could see.
    if(data.publicName) writable._localizedName = data.publicName;

    writable._canStandOn = data.walkable;
    writable._canSitOn = data.seat;
    // Laying has no column of its own - the emulator reads it off the
    // behaviour, so the client has to derive it the same way.
    writable._canLayOn = ((data.interactionType === 'bed') || (data.interactionType === 'tent_small') || (data.interactionType === 'medical_bed'));

    return true;
}

// Records that land before FurnitureData has loaded. The emulator sends every
// edited furni at login (SSOTicketEvent) so a rename shows in the backpack and
// the infostand too, not only in rooms that re-send it - and the file is big
// enough to still be on its way then. Held per furni, so a newer record
// replaces an older one, and applied once the data is there; given up on after
// two minutes, for a sprite this client build does not have at all.
const pendingPatches = new Map<string, RpFurniFunction>();
const PENDING_PATCH_GIVE_UP_MS = 120000;
let pendingPatchTimer: ReturnType<typeof setInterval> = null;
let pendingPatchSince = 0;

const PendingPatchKey = (data: RpFurniFunction) => `${ data.productType }:${ data.spriteId }`;

const FlushPendingPatches = () =>
{
    for(const [ key, data ] of Array.from(pendingPatches.entries()))
    {
        if(!PatchFurnitureData(data)) continue;

        pendingPatches.delete(key);
    }

    if(pendingPatches.size && ((Date.now() - pendingPatchSince) < PENDING_PATCH_GIVE_UP_MS)) return;

    pendingPatches.clear();
    clearInterval(pendingPatchTimer);
    pendingPatchTimer = null;
}

const HoldPatch = (data: RpFurniFunction) =>
{
    pendingPatches.set(PendingPatchKey(data), data);

    if(pendingPatchTimer) return;

    pendingPatchSince = Date.now();
    pendingPatchTimer = setInterval(FlushPendingPatches, 1000);
}

// ---------------------------------------------------------------------------
// Furni size - the squares a floor furni covers
// ---------------------------------------------------------------------------
//
// nitro reads a furni's size from its ARTWORK (FurnitureLogic.initialize, the
// bundle's logic dimensions), never from the server, and checks against it
// whether a furni can be moved or turned to a spot. Once the Function tool
// gives a furni a size the artwork does not have, the server blocks the new
// squares while the move preview still shows the old ones - so every copy in
// the room takes the server's size instead. Keyed by sprite id, as
// FurnitureData is. Wall furni cover no squares and are left alone.

const floorSizes = new Map<number, { width: number; length: number }>();

const ApplyFurniSize = (roomObject: IRoomObject) =>
{
    if(!roomObject || !roomObject.model) return;

    const size = floorSizes.get(roomObject.model.getValue<number>(RoomObjectVariable.FURNITURE_TYPE_ID));

    if(!size) return;

    roomObject.model.setValue(RoomObjectVariable.FURNITURE_SIZE_X, size.width);
    roomObject.model.setValue(RoomObjectVariable.FURNITURE_SIZE_Y, size.length);
    roomObject.model.setValue(RoomObjectVariable.FURNITURE_CENTER_X, (size.width / 2));
    roomObject.model.setValue(RoomObjectVariable.FURNITURE_CENTER_Y, (size.length / 2));
}

const RememberFurniSize = (data: RpFurniFunction) =>
{
    if((data.productType === 'i') || (data.width < 1) || (data.length < 1)) return;

    floorSizes.set(data.spriteId, { width: data.width, length: data.length });

    const roomSession = GetRoomSession();

    if(!roomSession) return;

    for(const roomObject of GetRoomEngine().getRoomObjects(roomSession.roomId, RoomObjectCategory.FLOOR))
    {
        if(roomObject?.model?.getValue<number>(RoomObjectVariable.FURNITURE_TYPE_ID) === data.spriteId) ApplyFurniSize(roomObject);
    }
}

// ADDED for a furni whose artwork was already loaded; CONTENT_UPDATED for one
// that was still loading, whose logic has only just read the artwork's size
// over whatever it had. Both fire after the logic has set its size.
const onFloorObjectReady = (event: RoomEngineObjectEvent) =>
{
    if(!floorSizes.size || (event.category !== RoomObjectCategory.FLOOR)) return;

    ApplyFurniSize(GetRoomEngine().getRoomObject(event.roomId, event.objectId, RoomObjectCategory.FLOOR));
}

// ---------------------------------------------------------------------------
// The tile cursor's height ring
// ---------------------------------------------------------------------------
//
// Gone for every furni - in the renderer, not here: over a furni you can
// stand, sit or lie on whose top is above 0.8 (RoomObjectEventHandler.
// handleMouseOverObject), the tile cursor's raised state no longer draws its
// floating blue ring, so the cursor is the white diamond on the floor of the
// tile everywhere (TileCursorVisualization, renderer patch no-height-ring).
//
// The variable-height flag the Height marker field was meant for is only read
// on a path that never runs here (where-you-click-is-where-you-go is always
// on), so the field changes nothing you can see. Its switch is gone from the
// Function tool; the value still rides the wire in its old place, and every
// save sends back whatever is stored.

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

    // Applied now, or held until FurnitureData loads. Either way a record
    // still waiting for this furni is older than this one and must not land
    // on top of it later.
    if(PatchFurnitureData(data)) pendingPatches.delete(PendingPatchKey(data));
    else HoldPatch(data);

    RememberFurniSize(data);

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
            [ RP_DELETE_INVENTORY_FURNI, RpDeleteInventoryFurniComposer ],
            [ RP_CATALOG_RENAME_FURNI, RpCatalogRenameFurniComposer ]
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

    GetRoomEngine().events.addEventListener(RoomEngineObjectEvent.ADDED, onFloorObjectReady);
    GetRoomEngine().events.addEventListener(RoomEngineObjectEvent.CONTENT_UPDATED, onFloorObjectReady);

    registered = true;
}
