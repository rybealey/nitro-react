import { IMessageDataWrapper, IMessageEvent, IMessageParser, MessageEvent } from '@nitrots/nitro-renderer';
import { GetConnection } from '../nitro';

// PixelRP chat packets - client-source, registered at runtime like the gang
// and corp packets (see RpGangMessages). Wire ids match the emulator's
// Resources/Revisions/1.6.6.json.
const RP_RETAIN_CHAT_PREFIX = 3986; // server -> client

// The server asks the chat box to keep a command prefix (":ga", ":ca") for
// the next message - sent only when the command actually went through.
export class RpRetainChatPrefixParser implements IMessageParser
{
    private _prefix: string;

    public flush(): boolean
    {
        this._prefix = '';

        return true;
    }

    public parse(wrapper: IMessageDataWrapper): boolean
    {
        if(!wrapper) return false;

        this._prefix = wrapper.readString();

        return true;
    }

    public get prefix(): string { return this._prefix; }
}

export class RpRetainChatPrefixEvent extends MessageEvent implements IMessageEvent
{
    constructor(callBack: Function)
    {
        super(callBack, RpRetainChatPrefixParser);
    }

    public getParser(): RpRetainChatPrefixParser
    {
        return this.parser as RpRetainChatPrefixParser;
    }
}

let registered = false;

export const RegisterRpChatMessages = () =>
{
    if(registered) return;

    const connection = GetConnection();

    if(!connection) return;

    connection.registerMessages({
        events: new Map<number, Function>([ [ RP_RETAIN_CHAT_PREFIX, RpRetainChatPrefixEvent ] ]),
        composers: new Map<number, Function>()
    });

    registered = true;
}
