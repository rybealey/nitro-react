import { IMessageComposer, IMessageDataWrapper, IMessageEvent, IMessageParser, MessageEvent } from '@nitrots/nitro-renderer';
import { GetCommunication, GetConnection, SendMessageComposer } from '../nitro';

// PixelRP: is a player online? Asked by :t and :lt for a name that is not in
// your room - the client only knows its own room. Online, the emulator sends
// what the HUD needs to target them from wherever they are (never where that
// is): RpUserPresenceEvent. Wire ids match its Resources/Revisions/1.6.6.json.
const RP_USER_PRESENCE = 4224; // client -> server
const RP_USER_PRESENCE_RESULT = 4225; // server -> client

// No answer by then and the player is treated as not online. Generous, so a
// slow moment on the connection is not taken for somebody logging off.
const REPLY_TIMEOUT = 10000;

export type UserPresence = 'online' | 'offline' | 'unknown';

export interface PresentUser
{
    userId: number;
    name: string;
    figure: string;
    motto: string;
}

class RpUserPresenceComposer implements IMessageComposer<string[]>
{
    private _data: string[];

    constructor(name: string)
    {
        this._data = [ name ];
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

class RpUserPresenceParser implements IMessageParser
{
    private _asked: string;
    private _user: PresentUser;

    public flush(): boolean
    {
        this._asked = '';
        this._user = null;

        return true;
    }

    public parse(wrapper: IMessageDataWrapper): boolean
    {
        if(!wrapper) return false;

        this._asked = wrapper.readString();

        // false: offline, and nothing follows
        if(!wrapper.readBoolean()) return true;

        const userId = wrapper.readInt();
        const name = wrapper.readString();
        const figure = wrapper.readString();
        const motto = wrapper.readString();

        this._user = { userId, name, figure, motto };

        return true;
    }

    public get asked(): string { return this._asked; }
    // null when they are offline
    public get user(): PresentUser { return this._user; }
}

class RpUserPresenceEvent extends MessageEvent implements IMessageEvent
{
    constructor(callBack: Function)
    {
        super(callBack, RpUserPresenceParser);
    }

    public getParser(): RpUserPresenceParser
    {
        return this.parser as RpUserPresenceParser;
    }
}

type Answer = (presence: UserPresence, user: PresentUser) => void;

// Waiting answers by the name asked, lower-cased - the server echoes it back.
const waiting = new Map<string, Answer[]>();

let registered = false;

const settle = (key: string, presence: UserPresence, user: PresentUser) =>
{
    const answers = waiting.get(key);

    if(!answers) return;

    waiting.delete(key);
    answers.forEach(answer => answer(presence, user));
};

export const AskUserPresence = (name: string, answer: Answer): void =>
{
    if(!registered)
    {
        const connection = GetConnection();

        if(!connection)
        {
            answer('unknown', null);

            return;
        }

        connection.registerMessages({
            events: new Map<number, Function>([ [ RP_USER_PRESENCE_RESULT, RpUserPresenceEvent ] ]),
            composers: new Map<number, Function>([ [ RP_USER_PRESENCE, RpUserPresenceComposer ] ])
        });
        GetCommunication().registerMessageEvent(new RpUserPresenceEvent((event: RpUserPresenceEvent) =>
        {
            const parser = event.getParser();

            settle(parser.asked.toLowerCase(), (parser.user ? 'online' : 'offline'), parser.user);
        }));

        registered = true;
    }

    const key = name.toLowerCase();
    const answers = waiting.get(key);

    if(answers)
    {
        answers.push(answer);

        return;
    }

    const asked = [ answer ];

    waiting.set(key, asked);
    // only this question's own wait - a later one for the same name has its own
    setTimeout(() => (waiting.get(key) === asked) && settle(key, 'unknown', null), REPLY_TIMEOUT);
    SendMessageComposer(new RpUserPresenceComposer(name));
};
