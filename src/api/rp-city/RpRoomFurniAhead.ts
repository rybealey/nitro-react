import { IMessageDataWrapper, IMessageEvent, IMessageParser, MessageEvent } from '@nitrots/nitro-renderer';
import { GetCommunication, GetConnection } from '../nitro';
import { DownloadFurniTypes, FurniTypesFor } from './RpCityFurniPreload';

// PixelRP (Twist, 2026-10-28): the furni of the room behind an arrow the player
// is walking to (emulator ArrowAhead), downloaded on the way - so the room draws
// its furni as it arrives instead of grey placeholders while they download.
// Sent while they are still heading for the arrow, as sprite ids (the room,
// then floor, then wall), at most once a room every few minutes. Anything
// already here or on its way is skipped (DownloadFurniTypes); a room they never
// enter just leaves its furni in the browser's cache.
const RP_ROOM_FURNI_AHEAD = 4235; // server -> client

// A moment for the room they are in to finish what it is asking for, and two
// at a time after that: the room they are still standing in comes first.
const START_DELAY_MS = 250;
const AT_ONCE = 2;

export class RpRoomFurniAheadParser implements IMessageParser
{
    private _roomId = 0;
    private _floorSpriteIds: number[] = [];
    private _wallSpriteIds: number[] = [];

    public flush(): boolean
    {
        this._roomId = 0;
        this._floorSpriteIds = [];
        this._wallSpriteIds = [];

        return true;
    }

    public parse(wrapper: IMessageDataWrapper): boolean
    {
        if(!wrapper) return false;

        this._roomId = wrapper.readInt();

        let count = wrapper.readInt();

        while(count-- > 0) this._floorSpriteIds.push(wrapper.readInt());

        count = wrapper.readInt();

        while(count-- > 0) this._wallSpriteIds.push(wrapper.readInt());

        return true;
    }

    public get roomId(): number
    {
        return this._roomId;
    }

    public get floorSpriteIds(): number[]
    {
        return this._floorSpriteIds;
    }

    public get wallSpriteIds(): number[]
    {
        return this._wallSpriteIds;
    }
}

export class RpRoomFurniAheadEvent extends MessageEvent implements IMessageEvent
{
    constructor(callback: Function)
    {
        super(callback, RpRoomFurniAheadParser);
    }

    public getParser(): RpRoomFurniAheadParser
    {
        return this.parser as RpRoomFurniAheadParser;
    }
}

const onRoomFurniAhead = (event: RpRoomFurniAheadEvent) =>
{
    const parser = event.getParser();
    const types = FurniTypesFor(parser.floorSpriteIds, parser.wallSpriteIds);

    if(!types.length) return;

    setTimeout(() => DownloadFurniTypes(types, AT_ONCE), START_DELAY_MS);
}

let registered = false;

export const RegisterRpRoomFurniAhead = () =>
{
    if(registered) return;

    const connection = GetConnection();

    if(!connection) return;

    connection.registerMessages({
        events: new Map<number, Function>([ [ RP_ROOM_FURNI_AHEAD, RpRoomFurniAheadEvent ] ]),
        composers: new Map<number, Function>()
    });

    GetCommunication().registerMessageEvent(new RpRoomFurniAheadEvent(onRoomFurniAhead));

    registered = true;
}
