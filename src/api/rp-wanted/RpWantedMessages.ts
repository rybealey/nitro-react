import { IMessageDataWrapper, IMessageEvent, IMessageParser, MessageEvent } from '@nitrots/nitro-renderer';
import { GetCommunication, GetConnection } from '../nitro';

// PixelRP wanted list - client-source packet, registered at runtime like the
// gang, corp, phone and region packets. Wire id matches the emulator's
// Resources/Revisions/1.6.6.json.
//
// One packet feeds two surfaces: the Wanted window renders it as a list, and
// the player HUD looks a user id up to draw stars over whoever you have
// selected. Before this the HUD's stars came from a hash of the username -
// stable, and completely unrelated to anything the player had done.
//
// A player's level is the highest severity among their open charges, decided
// server-side (WantedUtility); the client only ever displays what it is told.

// server -> client, at login and whenever a charge is filed
const RP_WANTED = 3903;

export interface RpWantedPlayer
{
    userId: number;
    username: string;
    figure: string;
    // 1-5, the same scale the HUD's stars draw
    level: number;
    // unix seconds of their FIRST open charge - a later one does not reset it
    since: number;
    // the rap sheet, worst crime first: one line per crime with its open count
    charges: RpWantedCharge[];
}

export interface RpWantedCharge
{
    name: string;
    // how many open counts of this crime - 2+ only for stackable crimes
    count: number;
}

export class RpWantedParser implements IMessageParser
{
    private _players: RpWantedPlayer[] = [];

    public flush(): boolean
    {
        this._players = [];

        return true;
    }

    public parse(wrapper: IMessageDataWrapper): boolean
    {
        if(!wrapper) return false;

        this._players = [];

        let count = wrapper.readInt();

        while(count > 0)
        {
            const player: RpWantedPlayer = {
                userId: wrapper.readInt(),
                username: wrapper.readString(),
                figure: wrapper.readString(),
                level: wrapper.readInt(),
                since: wrapper.readInt(),
                charges: []
            };

            let chargeCount = wrapper.readInt();

            while(chargeCount > 0)
            {
                player.charges.push({ name: wrapper.readString(), count: wrapper.readInt() });

                chargeCount--;
            }

            this._players.push(player);

            count--;
        }

        return true;
    }

    public get players(): RpWantedPlayer[] { return this._players; }
}

export class RpWantedEvent extends MessageEvent implements IMessageEvent
{
    constructor(callBack: Function)
    {
        super(callBack, RpWantedParser);
    }

    public getParser(): RpWantedParser
    {
        return this.parser as RpWantedParser;
    }
}

// ---- the store ----------------------------------------------------------
// A module singleton, like the region store: the login push lands before the
// Wanted window or any HUD has mounted, and the HUD reads levels from plain
// render code rather than through a hook.

let players: RpWantedPlayer[] = [];
let byUserId: Map<number, number> = new Map();

const listeners = new Set<() => void>();

export const GetRpWantedList = (): RpWantedPlayer[] => players;

/** 0 for anyone with no open charges - which is most people. */
export const GetRpWanted = (userId: number): number => (byUserId.get(userId) ?? 0);

export const SubscribeRpWanted = (listener: () => void): (() => void) =>
{
    listeners.add(listener);

    return () => listeners.delete(listener);
}

const onWanted = (event: RpWantedEvent) =>
{
    const parser = event.getParser();

    if(!parser) return;

    players = parser.players;
    byUserId = new Map(players.map(player => [ player.userId, player.level ]));

    listeners.forEach(listener => listener());
}

let registered = false;

export const RegisterRpWantedMessages = () =>
{
    if(registered) return;

    const connection = GetConnection();

    if(!connection) return;

    connection.registerMessages({
        events: new Map<number, Function>([ [ RP_WANTED, RpWantedEvent ] ]),
        composers: new Map<number, Function>()
    });

    GetCommunication().registerMessageEvent(new RpWantedEvent(onWanted));

    registered = true;
}
