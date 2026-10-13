import { IMessageComposer, IMessageDataWrapper, IMessageEvent, IMessageParser, MessageEvent } from '@nitrots/nitro-renderer';
import { GetConnection } from '../nitro';

// PixelRP 911 calls (emulator EmergencyCalls). Defined in client source and
// registered at runtime, like the jail and deposit box packets. Wire ids match
// the emulator's Resources/Revisions/1.6.6.json.
const RP_EMERGENCY_CALLS = 4188; // server -> client: the window, open with its calls, or closed
const RP_EMERGENCY_CALL_ACTION = 4189; // client -> server: one button on one call

/** EmergencyCalls.Action* */
export const EmergencyCallAction = { Respond: 1, GoToRoom: 2, Helpful: 3, Abuse: 4 };

/** EmergencyCalls.Mark* */
export const EmergencyCallMark = { None: 0, Helpful: 1, Abuse: 2 };

/** EmergencyCalls.Kind* - a 911 call, or an officer's :backup request. */
export const EmergencyCallKind = { Call: 0, Backup: 1 };

export interface EmergencyCallResponder
{
    id: number;
    name: string;
}

export interface EmergencyCall
{
    id: number;
    callerId: number;
    callerName: string;
    callerLook: string;
    callerGender: string;
    roomId: number;
    roomName: string;
    message: string;
    /** Seconds old when the server sent it. */
    age: number;
    responderId: number;
    responderName: string;
    mark: number;
    markedByName: string;
    /** EmergencyCallKind; Call for a server from before :backup. */
    kind: number;
    /** A backup request's responders, first to answer first; empty for a 911 call. */
    responders: EmergencyCallResponder[];
}

export class RpEmergencyCallsParser implements IMessageParser
{
    private _open = false;
    private _calls: EmergencyCall[] = [];
    private _notice = '';
    private _reopen = false;

    public flush(): boolean
    {
        this._open = false;
        this._calls = [];
        this._notice = '';
        this._reopen = false;

        return true;
    }

    public parse(wrapper: IMessageDataWrapper): boolean
    {
        if(!wrapper) return false;

        this._open = wrapper.readBoolean();

        let count = wrapper.readInt();

        while(count-- > 0) this._calls.push({
            id: wrapper.readInt(),
            callerId: wrapper.readInt(),
            callerName: wrapper.readString(),
            callerLook: wrapper.readString(),
            callerGender: wrapper.readString(),
            roomId: wrapper.readInt(),
            roomName: wrapper.readString(),
            message: wrapper.readString(),
            age: wrapper.readInt(),
            responderId: wrapper.readInt(),
            responderName: wrapper.readString(),
            mark: wrapper.readInt(),
            markedByName: wrapper.readString(),
            kind: EmergencyCallKind.Call,
            responders: []
        });

        this._notice = wrapper.readString();
        // :calls - back up even after the X (appended last).
        this._reopen = wrapper.bytesAvailable ? wrapper.readBoolean() : false;

        // :backup's part, appended whole: each call's kind and responders, in
        // the same order as the calls above.
        if(wrapper.bytesAvailable)
        {
            const extras = wrapper.readInt();

            for(let i = 0; i < extras; i++)
            {
                const kind = wrapper.readInt();
                const responders: EmergencyCallResponder[] = [];

                let responderCount = wrapper.readInt();

                while(responderCount-- > 0) responders.push({ id: wrapper.readInt(), name: wrapper.readString() });

                const call = this._calls[i];

                if(!call) continue;

                call.kind = kind;
                call.responders = responders;
            }
        }

        return true;
    }

    public get open(): boolean
    {
        return this._open;
    }

    /** Newest first. */
    public get calls(): EmergencyCall[]
    {
        return this._calls;
    }

    /** What to tell this officer about their own last press; '' for nothing. */
    public get notice(): string
    {
        return this._notice;
    }

    /** :calls - show the window even if its X put it away. */
    public get reopen(): boolean
    {
        return this._reopen;
    }
}

export class RpEmergencyCallsEvent extends MessageEvent implements IMessageEvent
{
    constructor(callBack: Function)
    {
        super(callBack, RpEmergencyCallsParser);
    }

    public getParser(): RpEmergencyCallsParser
    {
        return this.parser as RpEmergencyCallsParser;
    }
}

export class RpEmergencyCallActionComposer implements IMessageComposer<[ number, number ]>
{
    private _data: [ number, number ];

    constructor(callId: number, action: number)
    {
        this._data = [ callId, action ];
    }

    public getMessageArray()
    {
        return this._data;
    }

    public dispose(): void
    { }
}

let registered = false;

export const RegisterRpEmergencyCallsMessages = () =>
{
    if(registered) return;

    const connection = GetConnection();

    if(!connection) return;

    connection.registerMessages({
        events: new Map<number, Function>([
            [ RP_EMERGENCY_CALLS, RpEmergencyCallsEvent ]
        ]),
        composers: new Map<number, Function>([
            [ RP_EMERGENCY_CALL_ACTION, RpEmergencyCallActionComposer ]
        ])
    });

    registered = true;
}
