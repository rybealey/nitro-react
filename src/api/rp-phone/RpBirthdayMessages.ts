import { IMessageComposer, IMessageDataWrapper, IMessageEvent, IMessageParser, MessageEvent } from '@nitrots/nitro-renderer';
import { GetConnection } from '../nitro';

// PixelRP phone packets - client-source, registered at runtime like the gang
// and chat packets. Wire ids match the emulator's Resources/Revisions/1.6.6.json.
const RP_BIRTHDAY = 3987; // server -> client
const RP_SAVE_BIRTHDAY = 3989; // client -> server
const RP_GET_BIRTHDAY = 3992; // client -> server

// The player's own birthday: month 1-12 and day, or 0/0 when not set. No year.
export class RpBirthdayParser implements IMessageParser
{
    private _month: number;
    private _day: number;

    public flush(): boolean
    {
        this._month = 0;
        this._day = 0;

        return true;
    }

    public parse(wrapper: IMessageDataWrapper): boolean
    {
        if(!wrapper) return false;

        this._month = wrapper.readInt();
        this._day = wrapper.readInt();

        return true;
    }

    public get month(): number { return this._month; }
    public get day(): number { return this._day; }
}

export class RpBirthdayEvent extends MessageEvent implements IMessageEvent
{
    constructor(callBack: Function)
    {
        super(callBack, RpBirthdayParser);
    }

    public getParser(): RpBirthdayParser
    {
        return this.parser as RpBirthdayParser;
    }
}

class RpPhoneComposer implements IMessageComposer<number[]>
{
    private _data: number[];

    constructor(...data: number[])
    {
        this._data = data;
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

export class RpGetBirthdayComposer extends RpPhoneComposer
{
    constructor()
    {
        super();
    }
}

// (0, 0) removes the birthday
export class RpSaveBirthdayComposer extends RpPhoneComposer
{
    constructor(month: number, day: number)
    {
        super(month, day);
    }
}

let registered = false;

export const RegisterRpPhoneMessages = () =>
{
    if(registered) return;

    const connection = GetConnection();

    if(!connection) return;

    connection.registerMessages({
        events: new Map<number, Function>([ [ RP_BIRTHDAY, RpBirthdayEvent ] ]),
        composers: new Map<number, Function>([ [ RP_GET_BIRTHDAY, RpGetBirthdayComposer ], [ RP_SAVE_BIRTHDAY, RpSaveBirthdayComposer ] ])
    });

    registered = true;
}
