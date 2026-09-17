import { IMessageComposer, IMessageDataWrapper, IMessageEvent, IMessageParser, MessageEvent } from '@nitrots/nitro-renderer';
import { GetConnection } from '../nitro';

// PixelRP phone Tunes access packets - client-source, registered at runtime.
// The station itself (state, add, skip, remove, report) rides the renderer's
// RpJukebox* messages; this only tells the phone whether to show the staff
// controls. Wire ids match the emulator's Resources/Revisions/1.6.6.json.
const RP_TUNES_ACCESS = 4016; // server -> client
const RP_GET_TUNES_ACCESS = 4017; // client -> server
// Reordering the room's queue. Client-source like the two above, because the
// renderer's RpJukebox* composers are a fixed set and this is ours.
const RP_JUKEBOX_MOVE = 4045; // client -> server

export class RpTunesAccessParser implements IMessageParser
{
    private _canManage: boolean;

    public flush(): boolean
    {
        this._canManage = false;

        return true;
    }

    public parse(wrapper: IMessageDataWrapper): boolean
    {
        if(!wrapper) return false;

        this._canManage = (wrapper.readInt() === 1);

        return true;
    }

    // staff: may skip the playing song and remove anyone's request
    public get canManage(): boolean { return this._canManage; }
}

export class RpTunesAccessEvent extends MessageEvent implements IMessageEvent
{
    constructor(callBack: Function)
    {
        super(callBack, RpTunesAccessParser);
    }

    public getParser(): RpTunesAccessParser
    {
        return this.parser as RpTunesAccessParser;
    }
}

export class RpGetTunesAccessComposer implements IMessageComposer<(string | number)[]>
{
    private _data: (string | number)[];

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

/// Drag a song up or down THIS ROOM's queue. Both ends are indices into the
/// queue the client is showing; the server checks them against the queue as it
/// actually is, since a public room's queue can change under a finger.
export class RpJukeboxMoveComposer implements IMessageComposer<number[]>
{
    private _data: number[];

    constructor(from: number, to: number)
    {
        this._data = [ from, to ];
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

export const RegisterRpTunesMessages = () =>
{
    if(registered) return;

    const connection = GetConnection();

    if(!connection) return;

    connection.registerMessages({
        events: new Map<number, Function>([ [ RP_TUNES_ACCESS, RpTunesAccessEvent ] ]),
        composers: new Map<number, Function>([
            [ RP_GET_TUNES_ACCESS, RpGetTunesAccessComposer ],
            [ RP_JUKEBOX_MOVE, RpJukeboxMoveComposer ]
        ])
    });

    registered = true;
}
