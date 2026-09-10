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
// A player stays wanted for 15 minutes after their latest charge; the server
// sends the seconds left and the client counts them down itself.

// server -> client, at login and whenever a charge is filed
const RP_WANTED = 3903;

export interface RpWantedPlayer
{
    userId: number;
    username: string;
    figure: string;
    // 1-5, the same scale the HUD's stars draw
    level: number;
    // client clock (ms) at which they drop off the list: 15 minutes after their
    // latest charge, sent by the server as seconds remaining so clock skew
    // between the two cannot shift it
    expiresAt: number;
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
                expiresAt: Date.now() + (wrapper.readInt() * 1000),
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
let byUserId: Map<number, RpWantedPlayer> = new Map();
let expiryTimer = 0;

const listeners = new Set<() => void>();

const isLive = (player: RpWantedPlayer): boolean => (player.expiresAt > Date.now());

export const GetRpWantedList = (): RpWantedPlayer[] => players.filter(isLive);

/** 0 for anyone not currently wanted - which is most people. */
export const GetRpWanted = (userId: number): number =>
{
    const player = byUserId.get(userId);

    return (player && isLive(player)) ? player.level : 0;
}

export const SubscribeRpWanted = (listener: () => void): (() => void) =>
{
    listeners.add(listener);

    return () => listeners.delete(listener);
}

const notify = () => listeners.forEach(listener => listener());

// The server does not push when somebody's 15 minutes run out - every client
// knows the moment already. Wake at the next expiry so the HUD's stars and
// the Wanted window drop the entry on time rather than on the next charge.
const scheduleExpiry = () =>
{
    if(expiryTimer) window.clearTimeout(expiryTimer);

    expiryTimer = 0;

    const live = players.filter(isLive);

    if(!live.length) return;

    const next = Math.min(...live.map(player => player.expiresAt));

    expiryTimer = window.setTimeout(() =>
    {
        expiryTimer = 0;

        players = players.filter(isLive);
        byUserId = new Map(players.map(player => [ player.userId, player ]));

        notify();
        scheduleExpiry();
    }, Math.max(0, next - Date.now()) + 50);
}

const onWanted = (event: RpWantedEvent) =>
{
    const parser = event.getParser();

    if(!parser) return;

    players = parser.players;
    byUserId = new Map(players.map(player => [ player.userId, player ]));

    notify();
    scheduleExpiry();
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
