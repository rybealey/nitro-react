import { IMessageComposer, IMessageDataWrapper, IMessageEvent, IMessageParser, MessageEvent } from '@nitrots/nitro-renderer';
import { GetCommunication, GetConnection, SendMessageComposer } from '../nitro';

// PixelRP: the characters on this player's account, for the Wallet.
//
// One account, up to three characters. A character is its own player in every
// way that matters - its own credits, job, home and record - and the only
// thing shared is the login. The roster arrives at login and again after a
// create; nothing here is ever anybody else's account.
//
// Switching is a RECONNECT, not a swap: a hotel session is bound to its
// character when it authenticates and cannot be rebound, so the server points
// the account at the new character and asks the client to reload.

// server -> client
const RP_CHARACTERS = 4028;
const RP_CHARACTER_RESULT = 4029;

// client -> server
const RP_CREATE_CHARACTER = 4026;
const RP_SWITCH_CHARACTER = 4027;

export interface RpCharacter
{
    userId: number;
    username: string;
    figure: string;
    motto: string;
    gender: string;
}

/** What came back from a create or a switch. */
export const CHARACTER_CREATED = 0;
export const CHARACTER_REFUSED = 1;
export const CHARACTER_RELOAD = 2;

export class RpCharactersParser implements IMessageParser
{
    private _max: number = 3;
    private _currentId: number = 0;
    private _characters: RpCharacter[] = [];

    public flush(): boolean
    {
        this._characters = [];

        return true;
    }

    public parse(wrapper: IMessageDataWrapper): boolean
    {
        if(!wrapper) return false;

        this._max = wrapper.readInt();
        this._currentId = wrapper.readInt();
        this._characters = [];

        let count = wrapper.readInt();

        while(count > 0)
        {
            this._characters.push({
                userId: wrapper.readInt(),
                username: wrapper.readString(),
                figure: wrapper.readString(),
                motto: wrapper.readString(),
                gender: wrapper.readString()
            });

            count--;
        }

        return true;
    }

    public get max(): number { return this._max; }
    public get currentId(): number { return this._currentId; }
    public get characters(): RpCharacter[] { return this._characters; }
}

export class RpCharactersEvent extends MessageEvent implements IMessageEvent
{
    constructor(callBack: Function)
    {
        super(callBack, RpCharactersParser);
    }

    public getParser(): RpCharactersParser
    {
        return this.parser as RpCharactersParser;
    }
}

export class RpCharacterResultParser implements IMessageParser
{
    private _outcome: number = CHARACTER_REFUSED;
    private _message: string = '';

    public flush(): boolean
    {
        this._message = '';

        return true;
    }

    public parse(wrapper: IMessageDataWrapper): boolean
    {
        if(!wrapper) return false;

        this._outcome = wrapper.readInt();
        this._message = wrapper.readString();

        return true;
    }

    public get outcome(): number { return this._outcome; }
    public get message(): string { return this._message; }
}

export class RpCharacterResultEvent extends MessageEvent implements IMessageEvent
{
    constructor(callBack: Function)
    {
        super(callBack, RpCharacterResultParser);
    }

    public getParser(): RpCharacterResultParser
    {
        return this.parser as RpCharacterResultParser;
    }
}

class RpCharacterComposerBase implements IMessageComposer<(string | number)[]>
{
    private _data: (string | number)[];

    constructor(...data: (string | number)[]) { this._data = data; }

    public getMessageArray() { return this._data; }

    public dispose(): void { return; }
}

export class RpCreateCharacterComposer extends RpCharacterComposerBase
{
    constructor(username: string, gender: string) { super(username, gender); }
}

export class RpSwitchCharacterComposer extends RpCharacterComposerBase
{
    constructor(userId: number) { super(userId); }
}

// ---- the store ----------------------------------------------------------
// A module singleton like the rest: the login push lands long before the
// Wallet is opened.

let characters: RpCharacter[] = [];
let currentId = 0;
let maxCharacters = 3;

const listeners = new Set<() => void>();
const resultListeners = new Set<(outcome: number, message: string) => void>();

export const GetRpCharacters = (): RpCharacter[] => characters;

export const GetRpCurrentCharacterId = (): number => currentId;

export const GetRpMaxCharacters = (): number => maxCharacters;

export const SubscribeRpCharacters = (listener: () => void): (() => void) =>
{
    listeners.add(listener);

    return () => listeners.delete(listener);
}

/** Create and switch answer here; the Wallet shows the refusal on its form. */
export const SubscribeRpCharacterResult = (listener: (outcome: number, message: string) => void): (() => void) =>
{
    resultListeners.add(listener);

    return () => resultListeners.delete(listener);
}

export const SendRpCreateCharacter = (username: string, gender: string): void =>
    SendMessageComposer(new RpCreateCharacterComposer(username, gender));

export const SendRpSwitchCharacter = (userId: number): void =>
    SendMessageComposer(new RpSwitchCharacterComposer(userId));

const onCharacters = (event: RpCharactersEvent) =>
{
    const parser = event.getParser();

    if(!parser) return;

    characters = parser.characters;
    currentId = parser.currentId;
    maxCharacters = parser.max;

    listeners.forEach(listener => listener());
}

const onResult = (event: RpCharacterResultEvent) =>
{
    const parser = event.getParser();

    if(!parser) return;

    resultListeners.forEach(listener => listener(parser.outcome, parser.message));
}

let registered = false;

export const RegisterRpCharacterMessages = () =>
{
    if(registered) return;

    const connection = GetConnection();

    if(!connection) return;

    connection.registerMessages({
        events: new Map<number, Function>([
            [ RP_CHARACTERS, RpCharactersEvent ],
            [ RP_CHARACTER_RESULT, RpCharacterResultEvent ]
        ]),
        composers: new Map<number, Function>([
            [ RP_CREATE_CHARACTER, RpCreateCharacterComposer ],
            [ RP_SWITCH_CHARACTER, RpSwitchCharacterComposer ]
        ])
    });

    GetCommunication().registerMessageEvent(new RpCharactersEvent(onCharacters));
    GetCommunication().registerMessageEvent(new RpCharacterResultEvent(onResult));

    registered = true;
}
