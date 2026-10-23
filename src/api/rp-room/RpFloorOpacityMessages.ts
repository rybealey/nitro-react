import { IMessageComposer, IMessageDataWrapper, IMessageEvent, IMessageParser, MessageEvent, RoomEngine, RoomEngineEvent, RoomObjectCategory, RoomObjectVariable } from '@nitrots/nitro-renderer';
import { GetCommunication, GetConnection, GetRoomEngine } from '../nitro';

// PixelRP: a room's floor opacity - how see-through its floor tiles are, 0 to
// 100 (emulator FloorOpacity, rooms.floor_opacity). Staff set it with
// :topacity or the Room tool's slider. The server sends it on the heels of the
// room's shape when you walk in, to everyone in the room when it changes, and
// to the Room tool with the room's settings. The renderer fades the floor
// planes (renderer patch floor-opacity). Defined in client source and
// registered at runtime, like the jail and turf packets; wire ids match the
// emulator's Resources/Revisions/1.6.6.json.
const RP_SET_FLOOR_OPACITY = 4228; // client -> server: the Room tool's slider
const RP_ROOM_FLOOR_OPACITY = 4229; // server -> client: a room's floor opacity

export class RpRoomFloorOpacityParser implements IMessageParser
{
    private _roomId = 0;
    private _opacity = 100;

    public flush(): boolean
    {
        this._roomId = 0;
        this._opacity = 100;

        return true;
    }

    public parse(wrapper: IMessageDataWrapper): boolean
    {
        if(!wrapper) return false;

        this._roomId = wrapper.readInt();
        this._opacity = wrapper.readInt();

        return true;
    }

    public get roomId(): number
    {
        return this._roomId;
    }

    public get opacity(): number
    {
        return this._opacity;
    }
}

export class RpRoomFloorOpacityEvent extends MessageEvent implements IMessageEvent
{
    constructor(callback: Function)
    {
        super(callback, RpRoomFloorOpacityParser);
    }

    public getParser(): RpRoomFloorOpacityParser
    {
        return this.parser as RpRoomFloorOpacityParser;
    }
}

/** The Room tool's slider: a room's floor opacity, 0 to 100. Staff only (Room.CanManageSettings). */
export class RpSetFloorOpacityComposer implements IMessageComposer<[ number, number ]>
{
    private _data: [ number, number ];

    constructor(roomId: number, opacity: number)
    {
        this._data = [ roomId, opacity ];
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

/**
 * Fades a room's floor tiles, 0 (gone) to 100 (solid), on this screen only -
 * the Room tool paints the slider's drag with it before the value is saved.
 * False when the room isn't built here yet.
 */
export const ApplyFloorOpacity = (roomId: number, opacity: number): boolean =>
{
    const roomObject = GetRoomEngine().getRoomObject(roomId, RoomEngine.ROOM_OBJECT_ID, RoomObjectCategory.ROOM);

    if(!roomObject || !roomObject.model) return false;

    roomObject.model.setValue(RoomObjectVariable.ROOM_FLOOR_ALPHA, (opacity / 100));

    return true;
}

// The room is built from its shape, and the opacity follows straight behind
// it (RoomEntry), so it normally finds the room there. One that arrives first
// - or the Room tool's answer for a room you are not in - waits here for the
// room to be built.
let waiting: { roomId: number, opacity: number } = null;

const onRoomFloorOpacity = (event: RpRoomFloorOpacityEvent) =>
{
    const parser = event.getParser();

    if(!parser) return;

    waiting = (ApplyFloorOpacity(parser.roomId, parser.opacity) ? null : { roomId: parser.roomId, opacity: parser.opacity });
}

const onRoomInitialized = (event: RoomEngineEvent) =>
{
    if(!waiting || (waiting.roomId !== event.roomId)) return;

    if(ApplyFloorOpacity(waiting.roomId, waiting.opacity)) waiting = null;
}

let registered = false;

// Called once from App at CONNECTION_AUTHENTICATED, with the other Rp packets.
// The handler is registered here rather than by a view: every player in the
// room has to see the floor, whether or not they ever open the Room tool.
export const RegisterRpFloorOpacityMessages = () =>
{
    if(registered) return;

    const connection = GetConnection();

    if(!connection) return;

    connection.registerMessages({
        events: new Map<number, Function>([
            [ RP_ROOM_FLOOR_OPACITY, RpRoomFloorOpacityEvent ]
        ]),
        composers: new Map<number, Function>([
            [ RP_SET_FLOOR_OPACITY, RpSetFloorOpacityComposer ]
        ])
    });

    GetCommunication().registerMessageEvent(new RpRoomFloorOpacityEvent(onRoomFloorOpacity));

    GetRoomEngine().events.addEventListener(RoomEngineEvent.INITIALIZED, onRoomInitialized);

    registered = true;
}
