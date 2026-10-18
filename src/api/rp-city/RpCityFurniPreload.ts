import { IMessageDataWrapper, IMessageEvent, IMessageParser, MessageEvent } from '@nitrots/nitro-renderer';
import { GetCommunication, GetConnection, GetRoomEngine } from '../nitro';

// PixelRP: the furni of the city's always-loaded rooms (emulator KeyRooms),
// downloaded in the background after login. A furni type the client has not
// downloaded is drawn as a grey placeholder until it arrives, and every
// download goes all the way to the server - so a first visit to a city room
// used to fill in piece by piece. Sent once at login, as sprite ids (floor,
// then wall); the client turns them into furni names from its furnidata.
const RP_CITY_FURNI = 4217; // server -> client

// After the first room has had the line to itself for its own furni.
const START_DELAY_MS = 6000;

// A few at a time: the room the player is in may still want the line.
const AT_ONCE = 3;

export class RpCityFurniParser implements IMessageParser
{
    private _floorSpriteIds: number[] = [];
    private _wallSpriteIds: number[] = [];

    public flush(): boolean
    {
        this._floorSpriteIds = [];
        this._wallSpriteIds = [];

        return true;
    }

    public parse(wrapper: IMessageDataWrapper): boolean
    {
        if(!wrapper) return false;

        let count = wrapper.readInt();

        while(count-- > 0) this._floorSpriteIds.push(wrapper.readInt());

        count = wrapper.readInt();

        while(count-- > 0) this._wallSpriteIds.push(wrapper.readInt());

        return true;
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

export class RpCityFurniEvent extends MessageEvent implements IMessageEvent
{
    constructor(callback: Function)
    {
        super(callback, RpCityFurniParser);
    }

    public getParser(): RpCityFurniParser
    {
        return this.parser as RpCityFurniParser;
    }
}

let started = false;

const download = async (types: string[]) =>
{
    const roomEngine = GetRoomEngine();
    const loader = roomEngine?.roomContentLoader;

    // The room manager's own events: should a room want one of these while it
    // is still on its way, the placeholder is swapped when it lands, exactly
    // as for a download the room started itself.
    const events = roomEngine?.roomManager?.events;

    if(!loader || !events) return;

    const next = async () =>
    {
        while(types.length)
        {
            const type = types.shift();

            // Already here, or already on its way (downloadAsset skips those).
            if(loader.getCollection(type)) continue;

            try
            {
                await Promise.resolve(loader.downloadAsset(type, events) as unknown);
            }
            catch(e)
            {
                // A failed one is downloaded again by the room that needs it.
            }
        }
    }

    await Promise.all(Array.from({ length: AT_ONCE }, next));
}

const onCityFurni = (event: RpCityFurniEvent) =>
{
    if(started) return;

    const loader = GetRoomEngine()?.roomContentLoader;

    if(!loader) return;

    started = true;

    const parser = event.getParser();
    const types = new Set<string>();

    for(const spriteId of parser.floorSpriteIds)
    {
        const type = loader.getFurnitureFloorNameForTypeId(spriteId);

        if(type && loader.isLoaderType(type)) types.add(type);
    }

    for(const spriteId of parser.wallSpriteIds)
    {
        const type = loader.getFurnitureWallNameForTypeId(spriteId);

        if(type && loader.isLoaderType(type)) types.add(type);
    }

    if(!types.size) return;

    setTimeout(() => download(Array.from(types)), START_DELAY_MS);
}

let registered = false;

export const RegisterRpCityFurniPreload = () =>
{
    if(registered) return;

    const connection = GetConnection();

    if(!connection) return;

    connection.registerMessages({
        events: new Map<number, Function>([ [ RP_CITY_FURNI, RpCityFurniEvent ] ]),
        composers: new Map<number, Function>()
    });

    GetCommunication().registerMessageEvent(new RpCityFurniEvent(onCityFurni));

    registered = true;
}
