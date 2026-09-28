import { IMessageComposer, IMessageDataWrapper, IMessageEvent, IMessageParser, MessageEvent } from '@nitrots/nitro-renderer';
import { GetConnection } from '../nitro';

// PixelRP turfs - an unsafe room a gang can claim with :claim (emulator
// TurfManager). Defined in client source and registered at runtime, like the
// gang packets (see RpGangMessages.ts). Wire ids match the emulator's
// Resources/Revisions/1.6.6.json.
//
// The zone's safe/unsafe half still arrives on RpRoomZoneEvent, which lives in
// the patched renderer; this packet adds the turf half beside it rather than
// changing that one.
const RP_ROOM_TURF = 4151; // server -> client
const RP_ROOM_ZONE_TYPE_SAVE = 4150; // client -> server

/** The zone type the Zoning page saves: RpRoomZoneTypeSaveEvent on the emulator. */
export const ROOM_ZONE_UNSAFE = 0;
export const ROOM_ZONE_SAFE = 1;
export const ROOM_ZONE_TURF = 2;

export class RpRoomTurfParser implements IMessageParser
{
    private _roomId: number;
    private _isTurf: boolean;
    private _ownerGangId: number;
    private _ownerName: string;

    public flush(): boolean
    {
        this._roomId = 0;
        this._isTurf = false;
        this._ownerGangId = 0;
        this._ownerName = '';

        return true;
    }

    public parse(wrapper: IMessageDataWrapper): boolean
    {
        if(!wrapper) return false;

        this._roomId = wrapper.readInt();
        this._isTurf = wrapper.readBoolean();
        this._ownerGangId = wrapper.readInt();
        this._ownerName = wrapper.readString();

        return true;
    }

    public get roomId(): number
    {
        return this._roomId;
    }

    public get isTurf(): boolean
    {
        return this._isTurf;
    }

    /** 0 while nobody holds the turf. */
    public get ownerGangId(): number
    {
        return this._ownerGangId;
    }

    public get ownerName(): string
    {
        return this._ownerName;
    }
}

export class RpRoomTurfEvent extends MessageEvent implements IMessageEvent
{
    constructor(callBack: Function)
    {
        super(callBack, RpRoomTurfParser);
    }

    public getParser(): RpRoomTurfParser
    {
        return this.parser as RpRoomTurfParser;
    }
}

/** Set the room's zone type: ROOM_ZONE_UNSAFE, ROOM_ZONE_SAFE or ROOM_ZONE_TURF. Owner only. */
export class RpRoomZoneTypeSaveComposer implements IMessageComposer<[ number ]>
{
    private _data: [ number ];

    constructor(zoneType: number)
    {
        this._data = [ zoneType ];
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

// Called once from App at CONNECTION_AUTHENTICATED, with the other Rp
// packets, before the room settings view can mount its listener.
export const RegisterRpTurfMessages = () =>
{
    if(registered) return;

    const connection = GetConnection();

    if(!connection) return;

    connection.registerMessages({
        events: new Map<number, Function>([
            [ RP_ROOM_TURF, RpRoomTurfEvent ]
        ]),
        composers: new Map<number, Function>([
            [ RP_ROOM_ZONE_TYPE_SAVE, RpRoomZoneTypeSaveComposer ]
        ])
    });

    registered = true;
}
