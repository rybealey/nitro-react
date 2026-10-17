import { IMessageDataWrapper, IMessageEvent, IMessageParser, MessageEvent } from '@nitrots/nitro-renderer';
import { GetCommunication, GetConnection } from '../nitro';

// PixelRP bin search - the searcher's card above the chat bar (emulator
// HabboHotel/Rooms/BinSearch). Client-source packet, registered at runtime.
const RP_BIN_SEARCH = 4215; // server -> client: a search started, or ended

export interface RpBinSearch
{
    // The bin's sprite id, for its furni icon.
    spriteId: number;
    // Both in milliseconds: how long is left as the card arrives, and how
    // long a whole search takes - the rail drains from one towards nothing
    // over the other.
    leftMs: number;
    totalMs: number;
    // When it arrived, on this computer's clock, so the countdown runs on
    // from the server's figure rather than restarting.
    receivedAt: number;
}

export class RpBinSearchParser implements IMessageParser
{
    private _search: RpBinSearch = null;

    public flush(): boolean
    {
        this._search = null;

        return true;
    }

    public parse(wrapper: IMessageDataWrapper): boolean
    {
        if(!wrapper) return false;

        const searching = wrapper.readBoolean();
        const spriteId = wrapper.readInt();
        const leftMs = wrapper.readInt();
        const totalMs = wrapper.readInt();

        this._search = searching ? { spriteId, leftMs, totalMs, receivedAt: Date.now() } : null;

        return true;
    }

    public get search(): RpBinSearch
    {
        return this._search;
    }
}

export class RpBinSearchEvent extends MessageEvent implements IMessageEvent
{
    constructor(callBack: Function)
    {
        super(callBack, RpBinSearchParser);
    }

    public getParser(): RpBinSearchParser
    {
        return this.parser as RpBinSearchParser;
    }
}

// ---- the store ---------------------------------------------------------------
//
// Module scope, like the offer card's: the room widgets mount and unmount
// with rooms, and the server is the one that says when a search is over.

let current: RpBinSearch = null;
const listeners = new Set<() => void>();

export const GetRpBinSearch = (): RpBinSearch => current;

export const SubscribeRpBinSearch = (listener: () => void): (() => void) =>
{
    listeners.add(listener);

    return () =>
    {
        listeners.delete(listener);
    };
}

const onBinSearch = (event: RpBinSearchEvent) =>
{
    const parser = event.getParser();

    if(!parser) return;

    current = parser.search;
    listeners.forEach(listener => listener());
}

let registered = false;

export const RegisterRpBinSearchMessages = () =>
{
    if(registered) return;

    const connection = GetConnection();

    if(!connection) return;

    connection.registerMessages({
        events: new Map<number, Function>([ [ RP_BIN_SEARCH, RpBinSearchEvent ] ]),
        composers: new Map<number, Function>()
    });

    GetCommunication().registerMessageEvent(new RpBinSearchEvent(onBinSearch));

    registered = true;
}
