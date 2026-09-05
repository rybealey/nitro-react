import { IMessageComposer, IMessageDataWrapper, IMessageEvent, IMessageParser, MessageEvent } from '@nitrots/nitro-renderer';
import { GetConnection } from '../nitro';

// PixelRP phone Calendar packets - client-source, registered at runtime.
// Wire ids match the emulator's Resources/Revisions/1.6.6.json.
const RP_CALENDAR = 3993; // server -> client
const RP_GET_CALENDAR = 3994; // client -> server
const RP_SAVE_CALENDAR_EVENT = 3995; // client -> server (staff)
const RP_DELETE_CALENDAR_EVENT = 3996; // client -> server (staff)

export interface CalendarEvent
{
    id: number;
    title: string;
    description: string;
    // unix seconds
    startsAt: number;
    endsAt: number;
    roomId: number;
    roomName: string;
    colour: string;
    hostName: string;
    postedBy: string;
}

export interface CalendarBirthday
{
    userId: number;
    username: string;
    month: number;
    day: number;
}

// The whole calendar for this viewer: whether they may edit (staff), every
// upcoming event, and their own + friends' birthdays. Re-sent live after any
// staff change.
export class RpCalendarParser implements IMessageParser
{
    private _canEdit: boolean;
    private _events: CalendarEvent[];
    private _birthdays: CalendarBirthday[];

    public flush(): boolean
    {
        this._canEdit = false;
        this._events = [];
        this._birthdays = [];

        return true;
    }

    public parse(wrapper: IMessageDataWrapper): boolean
    {
        if(!wrapper) return false;

        this._canEdit = (wrapper.readInt() === 1);

        const eventCount = wrapper.readInt();

        this._events = [];

        for(let i = 0; i < eventCount; i++)
        {
            this._events.push({ id: wrapper.readInt(), title: wrapper.readString(), description: wrapper.readString(), startsAt: wrapper.readInt(), endsAt: wrapper.readInt(), roomId: wrapper.readInt(), roomName: wrapper.readString(), colour: wrapper.readString(), hostName: wrapper.readString(), postedBy: wrapper.readString() });
        }

        const birthdayCount = wrapper.readInt();

        this._birthdays = [];

        for(let i = 0; i < birthdayCount; i++)
        {
            this._birthdays.push({ userId: wrapper.readInt(), username: wrapper.readString(), month: wrapper.readInt(), day: wrapper.readInt() });
        }

        return true;
    }

    public get canEdit(): boolean { return this._canEdit; }
    public get events(): CalendarEvent[] { return this._events; }
    public get birthdays(): CalendarBirthday[] { return this._birthdays; }
}

export class RpCalendarEvent extends MessageEvent implements IMessageEvent
{
    constructor(callBack: Function)
    {
        super(callBack, RpCalendarParser);
    }

    public getParser(): RpCalendarParser
    {
        return this.parser as RpCalendarParser;
    }
}

class RpCalendarComposer implements IMessageComposer<(string | number)[]>
{
    private _data: (string | number)[];

    constructor(...data: (string | number)[])
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

export class RpGetCalendarComposer extends RpCalendarComposer
{
    constructor()
    {
        super();
    }
}

// id 0 posts a new event; times are unix seconds
export class RpSaveCalendarEventComposer extends RpCalendarComposer
{
    constructor(id: number, title: string, description: string, startsAt: number, endsAt: number, roomId: number, colour: string, hostName: string)
    {
        super(id, title, description, startsAt, endsAt, roomId, colour, hostName);
    }
}

export class RpDeleteCalendarEventComposer extends RpCalendarComposer
{
    constructor(id: number)
    {
        super(id);
    }
}

let registered = false;

export const RegisterRpCalendarMessages = () =>
{
    if(registered) return;

    const connection = GetConnection();

    if(!connection) return;

    connection.registerMessages({
        events: new Map<number, Function>([ [ RP_CALENDAR, RpCalendarEvent ] ]),
        composers: new Map<number, Function>([ [ RP_GET_CALENDAR, RpGetCalendarComposer ], [ RP_SAVE_CALENDAR_EVENT, RpSaveCalendarEventComposer ], [ RP_DELETE_CALENDAR_EVENT, RpDeleteCalendarEventComposer ] ])
    });

    registered = true;
}
