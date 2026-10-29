import { IMessageComposer, IMessageDataWrapper, IMessageEvent, IMessageParser, MessageEvent } from '@nitrots/nitro-renderer';
import { GetConnection, SendMessageComposer } from '../nitro';

// PixelRP :hotrooms window (emulator HotRooms). Defined in client source and
// registered at runtime, like the Real Estate packets. Wire ids match the
// emulator's Resources/Revisions/1.6.6.json.
const RP_HOT_ROOMS = 4241; // server -> client: the busiest rooms
const RP_HOT_ROOMS_CLOSE = 4242; // client -> server: the window was closed

/** One of the busiest rooms. `id` is 0 unless you are staff. */
export interface HotRoom
{
    id: number;
    name: string;
    users: number;
    maxUsers: number;
}

export class RpHotRoomsParser implements IMessageParser
{
    private _open = false;
    private _rooms: HotRoom[] = [];

    public flush(): boolean
    {
        this._open = false;
        this._rooms = [];

        return true;
    }

    public parse(wrapper: IMessageDataWrapper): boolean
    {
        if(!wrapper) return false;

        this._open = wrapper.readBoolean();

        let count = wrapper.readInt();

        while(count-- > 0)
        {
            const id = wrapper.readInt();
            const name = wrapper.readString();
            const users = wrapper.readInt();
            const maxUsers = wrapper.readInt();

            this._rooms.push({ id, name, users, maxUsers });
        }

        return true;
    }

    /** True when :hotrooms asked for the window; otherwise only an open window takes it. */
    public get open(): boolean
    {
        return this._open;
    }

    /** Busiest first, five at most. */
    public get rooms(): HotRoom[]
    {
        return this._rooms;
    }
}

export class RpHotRoomsEvent extends MessageEvent implements IMessageEvent
{
    constructor(callBack: Function)
    {
        super(callBack, RpHotRoomsParser);
    }

    public getParser(): RpHotRoomsParser
    {
        return this.parser as RpHotRoomsParser;
    }
}

/** No payload: the server stops sending you the list. */
export class RpHotRoomsCloseComposer implements IMessageComposer<[]>
{
    private _data: [];

    constructor()
    {
        this._data = [];
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

export const SendRpHotRoomsClose = (): void => SendMessageComposer(new RpHotRoomsCloseComposer());

let registered = false;

export const RegisterRpHotRoomsMessages = () =>
{
    if(registered) return;

    const connection = GetConnection();

    if(!connection) return;

    connection.registerMessages({
        events: new Map<number, Function>([
            [ RP_HOT_ROOMS, RpHotRoomsEvent ]
        ]),
        composers: new Map<number, Function>([
            [ RP_HOT_ROOMS_CLOSE, RpHotRoomsCloseComposer ]
        ])
    });

    registered = true;
}
