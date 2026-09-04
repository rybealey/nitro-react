import { IMessageComposer, IMessageDataWrapper, IMessageEvent, IMessageParser, MessageEvent } from '@nitrots/nitro-renderer';
import { GetConnection } from '../nitro';

// PixelRP gang packets - defined in CLIENT source and registered at runtime
// via connection.registerMessages (which is public and additive), instead of
// another @nitrots/nitro-renderer yarn patch: patches can only be authored
// on a machine with yarn, which the dev Mac doesn't have. Wire ids match the
// emulator's Resources/Revisions/1.6.6.json.
const RP_USER_GANG = 3970; // server -> client
const RP_GET_USER_GANG = 3971; // client -> server
const RP_BUY_GANG = 3972; // client -> server

// One player's gang membership, keyed by user id; gangId 0 = not in a gang.
// Colours arrive as '#rrggbb'. gangCost (credits) rides along so the Gang
// window prices Create without a second packet.
export class RpUserGangParser implements IMessageParser
{
    private _userId: number;
    private _gangId: number;
    private _name: string;
    private _colourA: string;
    private _colourB: string;
    private _isOwner: boolean;
    private _gangCost: number;

    public flush(): boolean
    {
        this._userId = 0;
        this._gangId = 0;
        this._name = '';
        this._colourA = '';
        this._colourB = '';
        this._isOwner = false;
        this._gangCost = 0;

        return true;
    }

    public parse(wrapper: IMessageDataWrapper): boolean
    {
        if(!wrapper) return false;

        this._userId = wrapper.readInt();
        this._gangId = wrapper.readInt();
        this._name = wrapper.readString();
        this._colourA = wrapper.readString();
        this._colourB = wrapper.readString();
        this._isOwner = (wrapper.readInt() === 1);
        this._gangCost = wrapper.readInt();

        return true;
    }

    public get userId(): number { return this._userId; }
    public get gangId(): number { return this._gangId; }
    public get name(): string { return this._name; }
    public get colourA(): string { return this._colourA; }
    public get colourB(): string { return this._colourB; }
    public get isOwner(): boolean { return this._isOwner; }
    public get gangCost(): number { return this._gangCost; }
}

export class RpUserGangEvent extends MessageEvent implements IMessageEvent
{
    constructor(callBack: Function)
    {
        super(callBack, RpUserGangParser);
    }

    public getParser(): RpUserGangParser
    {
        return this.parser as RpUserGangParser;
    }
}

export class RpGetUserGangComposer implements IMessageComposer<ConstructorParameters<typeof RpGetUserGangComposer>>
{
    private _data: ConstructorParameters<typeof RpGetUserGangComposer>;

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

// Found a gang: name + the two chosen colours as raw RGB ints (the server
// stores them in groups.colour1/colour2 and validates, prices and charges).
export class RpBuyGangComposer implements IMessageComposer<ConstructorParameters<typeof RpBuyGangComposer>>
{
    private _data: ConstructorParameters<typeof RpBuyGangComposer>;

    constructor(name: string, colourA: number, colourB: number)
    {
        this._data = [ name, colourA, colourB ];
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

let registered = false;

// Called once from MainView's mount effect - the de-facto connection-ready
// point (App only renders MainView after the engine initializes, well past
// CONNECTION_AUTHENTICATED). registerMessages is additive, so this extends
// the stock configuration rather than replacing it.
export const RegisterRpGangMessages = () =>
{
    if(registered) return;

    const connection = GetConnection();

    if(!connection) return;

    connection.registerMessages({
        events: new Map<number, Function>([ [ RP_USER_GANG, RpUserGangEvent ] ]),
        composers: new Map<number, Function>([ [ RP_GET_USER_GANG, RpGetUserGangComposer ], [ RP_BUY_GANG, RpBuyGangComposer ] ])
    });

    registered = true;
}
