import { IMessageDataWrapper, IMessageEvent, IMessageParser, MessageEvent } from '@nitrots/nitro-renderer';
import { GetConnection } from '../nitro';

// PixelRP: why the server is about to close this connection, sent right
// before it does. The socket closing is the same event whatever the cause, so
// without this every drop reads as "Connection lost" - including the ones the
// player caused (a second tab, an hour idle) and the ones we caused (a
// restart). The website's disconnected screen shows the right words for each.
//
// Defined in client source and registered at runtime, like the other RP
// packets; the wire id matches the emulator's Resources/Revisions/1.6.6.json.
const RP_DISCONNECT_REASON = 4208; // server -> client: a reason code and a line of detail

/** RpDisconnectReasonComposer.Reason* */
export const DisconnectReason = { Replaced: 1, Idle: 2, Restart: 3 };

/** The strings the website's /game page understands (nitro.blade.php). */
const REASON_KEYS: Record<number, string> = {
    [ DisconnectReason.Replaced ]: 'session.replaced',
    [ DisconnectReason.Idle ]: 'idle.timeout',
    [ DisconnectReason.Restart ]: 'server.restart'
};

export class RpDisconnectReasonParser implements IMessageParser
{
    private _reason: number = 0;
    private _detail: string = '';

    public flush(): boolean
    {
        this._reason = 0;
        this._detail = '';

        return true;
    }

    public parse(wrapper: IMessageDataWrapper): boolean
    {
        if(!wrapper) return false;

        this._reason = wrapper.readInt();
        this._detail = wrapper.readString();

        return true;
    }

    public get reason(): number { return this._reason; }
    public get detail(): string { return this._detail; }
}

export class RpDisconnectReasonEvent extends MessageEvent implements IMessageEvent
{
    constructor(callBack: Function)
    {
        super(callBack, RpDisconnectReasonParser);
    }

    public getParser(): RpDisconnectReasonParser
    {
        return this.parser as RpDisconnectReasonParser;
    }
}

let lastReason: string = null;
let registered = false;

/**
 * The reason the server gave for the close that is coming, as the website's
 * key, or null when the line simply dropped.
 */
export const GetDisconnectReason = (): string => lastReason;

export const RegisterRpDisconnectReasonMessages = () =>
{
    if(registered) return;

    const connection = GetConnection();

    if(!connection) return;

    connection.registerMessages({
        events: new Map<number, Function>([
            [ RP_DISCONNECT_REASON, RpDisconnectReasonEvent ]
        ]),
        composers: new Map<number, Function>()
    });

    connection.addMessageEvent(new RpDisconnectReasonEvent((event: RpDisconnectReasonEvent) =>
    {
        const parser = event.getParser();

        lastReason = REASON_KEYS[parser.reason] ?? null;
    }));

    registered = true;
}
