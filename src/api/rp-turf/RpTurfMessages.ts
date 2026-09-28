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
const RP_TURF_CLAIM = 4153; // client -> server

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
    // The turf panel's half (TurfManager.Describe), after the four fields Room
    // settings > Zoning reads. Colours are hex without '#'.
    private _ownerColourA: string;
    private _ownerColourB: string;
    private _heldForSeconds: number;
    private _capturing: boolean;
    private _claimerName: string;
    private _claimGangId: number;
    private _claimGangName: string;
    private _claimColourA: string;
    private _elapsedSeconds: number;
    private _totalSeconds: number;
    private _contested: boolean;
    private _contestedBy: string;
    private _failReason: string;
    private _viewerGangId: number;

    public flush(): boolean
    {
        this._roomId = 0;
        this._isTurf = false;
        this._ownerGangId = 0;
        this._ownerName = '';
        this._ownerColourA = 'b8b8b8';
        this._ownerColourB = '444444';
        this._heldForSeconds = 0;
        this._capturing = false;
        this._claimerName = '';
        this._claimGangId = 0;
        this._claimGangName = '';
        this._claimColourA = 'b8b8b8';
        this._elapsedSeconds = 0;
        this._totalSeconds = 300;
        this._contested = false;
        this._contestedBy = '';
        this._failReason = '';
        this._viewerGangId = 0;

        return true;
    }

    public parse(wrapper: IMessageDataWrapper): boolean
    {
        if(!wrapper) return false;

        this._roomId = wrapper.readInt();
        this._isTurf = wrapper.readBoolean();
        this._ownerGangId = wrapper.readInt();
        this._ownerName = wrapper.readString();

        // An emulator from before the panel sends only the four above.
        if(!wrapper.bytesAvailable) return true;

        this._ownerColourA = wrapper.readString();
        this._ownerColourB = wrapper.readString();
        this._heldForSeconds = wrapper.readInt();
        this._capturing = wrapper.readBoolean();
        this._claimerName = wrapper.readString();
        this._claimGangId = wrapper.readInt();
        this._claimGangName = wrapper.readString();
        this._claimColourA = wrapper.readString();
        this._elapsedSeconds = wrapper.readInt();
        this._totalSeconds = wrapper.readInt();
        this._contested = wrapper.readBoolean();
        this._contestedBy = wrapper.readString();
        this._failReason = wrapper.readString();
        this._viewerGangId = wrapper.readInt();

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

    /** Everything the turf panel draws, as one plain object it can keep. */
    public get view(): RoomTurfView
    {
        return {
            roomId: this._roomId, isTurf: this._isTurf,
            ownerGangId: this._ownerGangId, ownerName: this._ownerName,
            ownerColourA: this._ownerColourA, ownerColourB: this._ownerColourB, heldForSeconds: this._heldForSeconds,
            capturing: this._capturing, claimerName: this._claimerName,
            claimGangId: this._claimGangId, claimGangName: this._claimGangName, claimColourA: this._claimColourA,
            elapsedSeconds: this._elapsedSeconds, totalSeconds: this._totalSeconds,
            contested: this._contested, contestedBy: this._contestedBy,
            failReason: this._failReason, viewerGangId: this._viewerGangId
        };
    }
}

export interface RoomTurfView
{
    roomId: number;
    isTurf: boolean;
    ownerGangId: number;
    ownerName: string;
    ownerColourA: string;
    ownerColourB: string;
    heldForSeconds: number;
    capturing: boolean;
    claimerName: string;
    claimGangId: number;
    claimGangName: string;
    claimColourA: string;
    /** Held, uncontested seconds; count on from it while not contested. */
    elapsedSeconds: number;
    totalSeconds: number;
    contested: boolean;
    contestedBy: string;
    /** A failure to show once; '' otherwise. */
    failReason: string;
    /** The viewer's own gang, 0 for none - it words the Claim button. */
    viewerGangId: number;
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

/** The turf panel's Claim button - the same as typing :claim. No payload: the room you are in. */
export class RpTurfClaimComposer implements IMessageComposer<[]>
{
    private _data: [];

    constructor()
    {
        this._data = [];
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
            [ RP_ROOM_ZONE_TYPE_SAVE, RpRoomZoneTypeSaveComposer ],
            [ RP_TURF_CLAIM, RpTurfClaimComposer ]
        ])
    });

    registered = true;
}
