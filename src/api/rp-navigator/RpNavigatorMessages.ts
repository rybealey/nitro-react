import { IMessageDataWrapper, IMessageEvent, IMessageParser, MessageEvent } from '@nitrots/nitro-renderer';
import { GetConnection } from '../nitro';

// PixelRP navigator packets - client-source, registered at runtime like the
// turf and chat packets. Wire ids match the emulator's
// Resources/Revisions/1.6.6.json.
//
// The zone of every room a navigator search listed, sent right after the
// search results (RpNavigatorZonesComposer): the room data inside the results
// is the stock shape every room packet shares, so it cannot carry the zone.
const RP_NAVIGATOR_ZONES = 4182; // server -> client

/** A room's zone, as RpRoomZoneTypeSaveEvent numbers them. */
export const NAVIGATOR_ZONE_UNSAFE = 0;
export const NAVIGATOR_ZONE_SAFE = 1;
export const NAVIGATOR_ZONE_TURF = 2;

export class RpNavigatorZonesParser implements IMessageParser
{
    private _zones: Map<number, number>;

    public flush(): boolean
    {
        this._zones = new Map();

        return true;
    }

    public parse(wrapper: IMessageDataWrapper): boolean
    {
        if(!wrapper) return false;

        let count = wrapper.readInt();

        while(count > 0)
        {
            const roomId = wrapper.readInt();

            this._zones.set(roomId, wrapper.readInt());

            count--;
        }

        return true;
    }

    /** Room id -> zone. */
    public get zones(): Map<number, number>
    {
        return this._zones;
    }
}

export class RpNavigatorZonesEvent extends MessageEvent implements IMessageEvent
{
    constructor(callBack: Function)
    {
        super(callBack, RpNavigatorZonesParser);
    }

    public getParser(): RpNavigatorZonesParser
    {
        return this.parser as RpNavigatorZonesParser;
    }
}

let registered = false;

// Called once from App at CONNECTION_AUTHENTICATED, with the other Rp packets.
export const RegisterRpNavigatorMessages = () =>
{
    if(registered) return;

    const connection = GetConnection();

    if(!connection) return;

    connection.registerMessages({
        events: new Map<number, Function>([ [ RP_NAVIGATOR_ZONES, RpNavigatorZonesEvent ] ]),
        composers: new Map<number, Function>()
    });

    registered = true;
}
