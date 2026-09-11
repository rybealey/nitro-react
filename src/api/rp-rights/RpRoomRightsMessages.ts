import { IMessageDataWrapper, IMessageEvent, IMessageParser, MessageEvent } from '@nitrots/nitro-renderer';
import { GetCommunication, GetConnection, GetSessionDataManager } from '../nitro';

// PixelRP: whether a staff member's global room rights are live right now.
//
// The emulator only honours `room_any_owner` / `room_any_rights` while their
// holder is clocked in at City Government - a global-rights permission is a
// licence, not a grant, so an ordinary mis-click cannot move, re-state or
// eject somebody's furni on a day off.
//
// The CLIENT, though, opens its furni tools on `isModerator`, which is rank
// and nothing else. Left alone it would go on offering moves, pickups and
// state toggles that the server then refuses - and a button that does nothing
// is worse than no button. So the server tells us, and every rights
// affordance asks HasAnyRoomRights() instead of isModerator.
//
// This gates the AFFORDANCE only. Every packet re-checks server-side, which is
// what actually makes the rule true.

// server -> client
const RP_STAFF_DUTY = 4116;

export class RpStaffDutyParser implements IMessageParser
{
    private _onDuty: boolean = false;

    public flush(): boolean
    {
        this._onDuty = false;

        return true;
    }

    public parse(wrapper: IMessageDataWrapper): boolean
    {
        if(!wrapper) return false;

        this._onDuty = wrapper.readBoolean();

        return true;
    }

    public get onDuty(): boolean 
    {
        return this._onDuty; 
    }
}

export class RpStaffDutyEvent extends MessageEvent implements IMessageEvent
{
    constructor(callBack: Function)
    {
        super(callBack, RpStaffDutyParser);
    }

    public getParser(): RpStaffDutyParser
    {
        return this.parser as RpStaffDutyParser;
    }
}

// A module singleton like the other rp stores. It arrives at login and again
// on every clock event, so nothing has to poll and nothing has to subscribe -
// the gates below read it at the moment they are asked.
let onDuty = false;

/**
 * True when this player may act on a room they do not own.
 *
 * Replaces a bare `isModerator` everywhere that stood for "I hold rights
 * here". It deliberately does NOT replace isModerator where the check is
 * about being staff - seeing a room id, opening the mod tool, the HQ
 * settings - because those never followed the clock.
 */
export const HasAnyRoomRights = (): boolean => (GetSessionDataManager().isModerator && onDuty);

const onStaffDuty = (event: RpStaffDutyEvent) =>
{
    const parser = event.getParser();

    if(!parser) return;

    onDuty = parser.onDuty;
}

let registered = false;

export const RegisterRpRoomRightsMessages = () =>
{
    if(registered) return;

    const connection = GetConnection();

    if(!connection) return;

    connection.registerMessages({
        events: new Map<number, Function>([
            [ RP_STAFF_DUTY, RpStaffDutyEvent ]
        ]),
        composers: new Map<number, Function>()
    });

    GetCommunication().registerMessageEvent(new RpStaffDutyEvent(onStaffDuty));

    registered = true;
}
