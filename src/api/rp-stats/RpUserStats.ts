import { IMessageComposer, IMessageDataWrapper, IMessageEvent, IMessageParser, MessageEvent } from '@nitrots/nitro-renderer';
import { GetCommunication, GetConnection, SendMessageComposer } from '../nitro';
import { RpUnitStats } from './RpStatsStore';

// PixelRP: a player's bars by USER id, for a HUD target in another room. A
// room's bars (RpStatsStore) only reach the people in it and are keyed by a
// unit of that room, so the HUD asks the emulator for its target's while they
// are somewhere else (RpGetUserStatsEvent - only ever for your own HUD target).
// Wire ids match the emulator's Resources/Revisions/1.6.6.json.
const RP_GET_USER_STATS = 4226; // client -> server
const RP_USER_STATS = 4227; // server -> client

class RpGetUserStatsComposer implements IMessageComposer<number[]>
{
    private _data: number[];

    constructor(userId: number)
    {
        this._data = [ userId ];
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

class RpUserStatsParser implements IMessageParser
{
    private _userId: number;
    private _stats: RpUnitStats;

    public flush(): boolean
    {
        this._userId = 0;
        this._stats = null;

        return true;
    }

    public parse(wrapper: IMessageDataWrapper): boolean
    {
        if(!wrapper) return false;

        this._userId = wrapper.readInt();

        // false: logged off, and nothing follows
        if(!wrapper.readBoolean()) return true;

        const hp = wrapper.readInt();
        const hpMax = wrapper.readInt();
        const energy = wrapper.readInt();
        const energyMax = wrapper.readInt();
        const aggro = wrapper.readInt();
        const passive = (wrapper.readInt() === 1);
        const staff = (wrapper.readInt() === 1);

        this._stats = { hp, hpMax, energy, energyMax, aggro, passive, staff };

        return true;
    }

    public get userId(): number { return this._userId; }
    // null when they have logged off
    public get stats(): RpUnitStats { return this._stats; }
}

class RpUserStatsEvent extends MessageEvent implements IMessageEvent
{
    constructor(callBack: Function)
    {
        super(callBack, RpUserStatsParser);
    }

    public getParser(): RpUserStatsParser
    {
        return this.parser as RpUserStatsParser;
    }
}

const store: Map<number, RpUnitStats> = new Map();

// Told the user id and their bars - null when they have logged off.
const listeners = new Set<(userId: number, stats: RpUnitStats) => void>();

let registered = false;

const register = (): boolean =>
{
    if(registered) return true;

    const connection = GetConnection();

    if(!connection) return false;

    connection.registerMessages({
        events: new Map<number, Function>([ [ RP_USER_STATS, RpUserStatsEvent ] ]),
        composers: new Map<number, Function>([ [ RP_GET_USER_STATS, RpGetUserStatsComposer ] ])
    });
    GetCommunication().registerMessageEvent(new RpUserStatsEvent((event: RpUserStatsEvent) =>
    {
        const parser = event.getParser();

        if(parser.stats) store.set(parser.userId, parser.stats);
        else store.delete(parser.userId);

        listeners.forEach(listener => listener(parser.userId, parser.stats));
    }));

    registered = true;

    return true;
};

export const GetRpUserStats = (userId: number): RpUnitStats => store.get(userId);

// Dropped when the HUD starts asking again, so an answer from an earlier time
// they were away is never shown over newer bars.
export const ForgetRpUserStats = (userId: number): void =>
{
    store.delete(userId);
};

export const RequestRpUserStats = (userId: number): void =>
{
    if(!register()) return;

    SendMessageComposer(new RpGetUserStatsComposer(userId));
};

export const SubscribeRpUserStats = (listener: (userId: number, stats: RpUnitStats) => void): (() => void) =>
{
    register();
    listeners.add(listener);

    return () => listeners.delete(listener);
};
