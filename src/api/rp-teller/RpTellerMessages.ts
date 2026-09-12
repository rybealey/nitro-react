import { IMessageComposer, IMessageDataWrapper, IMessageEvent, IMessageParser, MessageEvent } from '@nitrots/nitro-renderer';
import { GetCommunication, GetConnection, SendMessageComposer } from '../nitro';

// PixelRP: which bots in this room are bank tellers.
//
// Nothing the client already receives can answer this. UsersComposer sends a
// bot's name, figure and a hardcoded skills list, and none of it separates a
// teller from any other bot standing behind a desk - so without this the
// teller menu would have to be offered on every bot in the hotel and refused
// by the server on nearly all of them.
//
// Virtual ids, because that is what a click on an avatar gives us. The set
// arrives on room entry and again whenever a bot is placed or picked up, so it
// cannot go stale while somebody is standing at the counter.
//
// This gates the AFFORDANCE only. RpTellerActionEvent re-checks that the bot
// is real, is a teller, and that the player is within two tiles - the same
// split the room-rights flag uses.

// server -> client
const RP_TELLER_BOTS = 4117;

// client -> server
const RP_TELLER_ACTION = 4120;

/** Must match TellerAction on the emulator. */
export const TELLER_OPEN_ACCOUNT = 0;
export const TELLER_DEPOSIT = 1;
export const TELLER_WITHDRAW = 2;

export class RpTellerBotsParser implements IMessageParser
{
    private _virtualIds: number[] = [];

    public flush(): boolean
    {
        this._virtualIds = [];

        return true;
    }

    public parse(wrapper: IMessageDataWrapper): boolean
    {
        if(!wrapper) return false;

        const total = wrapper.readInt();
        const ids: number[] = [];

        for(let i = 0; i < total; i++) ids.push(wrapper.readInt());

        this._virtualIds = ids;

        return true;
    }

    public get virtualIds(): number[]
    {
        return this._virtualIds;
    }
}

export class RpTellerBotsEvent extends MessageEvent implements IMessageEvent
{
    constructor(callBack: Function)
    {
        super(callBack, RpTellerBotsParser);
    }

    public getParser(): RpTellerBotsParser
    {
        return this.parser as RpTellerBotsParser;
    }
}

export class RpTellerActionComposer implements IMessageComposer<(string | number)[]>
{
    private _data: (string | number)[];

    constructor(botVirtualId: number, action: number)
    {
        this._data = [ botVirtualId, action ];
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

// A module singleton like the other rp stores, plus a subscriber list so an
// open context menu re-renders when a bot is placed while it is showing.
let tellers: number[] = [];

const listeners = new Set<() => void>();

export const IsTellerBot = (virtualId: number): boolean => tellers.indexOf(virtualId) >= 0;

export const SubscribeRpTellerBots = (handler: () => void): (() => void) =>
{
    listeners.add(handler);

    return () => { listeners.delete(handler); };
}

export const SendRpTellerAction = (botVirtualId: number, action: number): void =>
{
    SendMessageComposer(new RpTellerActionComposer(botVirtualId, action));
}

const onTellerBots = (event: RpTellerBotsEvent) =>
{
    const parser = event.getParser();

    if(!parser) return;

    tellers = parser.virtualIds;

    listeners.forEach(handler => handler());
}

let registered = false;

export const RegisterRpTellerMessages = () =>
{
    if(registered) return;

    const connection = GetConnection();

    if(!connection) return;

    connection.registerMessages({
        events: new Map<number, Function>([
            [ RP_TELLER_BOTS, RpTellerBotsEvent ]
        ]),
        composers: new Map<number, Function>([
            [ RP_TELLER_ACTION, RpTellerActionComposer ]
        ])
    });

    GetCommunication().registerMessageEvent(new RpTellerBotsEvent(onTellerBots));

    registered = true;
}
