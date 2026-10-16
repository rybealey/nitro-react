import { IMessageComposer, IMessageDataWrapper, IMessageEvent, IMessageParser, MessageEvent } from '@nitrots/nitro-renderer';
import { GetConnection } from '../nitro';

// PixelRP Paramedic Dispatch (emulator MedicalCalls). Defined in client source
// and registered at runtime, like the 911 calls packet. Wire ids match the
// emulator's Resources/Revisions/1.6.6.json.
const RP_MEDICAL_CALLS = 4205; // server -> client: the window, open with its deaths, or closed
const RP_MEDICAL_CALL_CLAIM = 4206; // client -> server: Claim on one call

/** MedicalCalls.State* */
export const MedicalCallState = { Waiting: 0, Offered: 1, Claimed: 2, Revived: 3, Recovered: 4, Admitted: 5, Gone: 6 };

export interface MedicalCall
{
    id: number;
    patientId: number;
    patientName: string;
    patientLook: string;
    patientGender: string;
    roomId: number;
    roomName: string;
    /** Seconds old when the server sent it. */
    age: number;
    /** MedicalCallState */
    state: number;
    /** Offered to, claimed by or revived by - whichever state says; 0 for none. */
    actorId: number;
    actorName: string;
    /** While offered: seconds left to claim it when the server sent it. */
    claimSeconds: number;
}

export class RpMedicalCallsParser implements IMessageParser
{
    private _open = false;
    private _calls: MedicalCall[] = [];
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
            patientId: wrapper.readInt(),
            patientName: wrapper.readString(),
            patientLook: wrapper.readString(),
            patientGender: wrapper.readString(),
            roomId: wrapper.readInt(),
            roomName: wrapper.readString(),
            age: wrapper.readInt(),
            state: wrapper.readInt(),
            actorId: wrapper.readInt(),
            actorName: wrapper.readString(),
            claimSeconds: wrapper.readInt()
        });

        this._notice = wrapper.readString();
        this._reopen = wrapper.readBoolean();

        return true;
    }

    public get open(): boolean
    {
        return this._open;
    }

    /** Newest first. */
    public get calls(): MedicalCall[]
    {
        return this._calls;
    }

    /** What to tell this paramedic about their own claim, or one they missed; '' for nothing. */
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

export class RpMedicalCallsEvent extends MessageEvent implements IMessageEvent
{
    constructor(callBack: Function)
    {
        super(callBack, RpMedicalCallsParser);
    }

    public getParser(): RpMedicalCallsParser
    {
        return this.parser as RpMedicalCallsParser;
    }
}

export class RpMedicalCallClaimComposer implements IMessageComposer<[ number ]>
{
    private _data: [ number ];

    constructor(callId: number)
    {
        this._data = [ callId ];
    }

    public getMessageArray()
    {
        return this._data;
    }

    public dispose(): void
    { }
}

let registered = false;

export const RegisterRpMedicalCallsMessages = () =>
{
    if(registered) return;

    const connection = GetConnection();

    if(!connection) return;

    connection.registerMessages({
        events: new Map<number, Function>([
            [ RP_MEDICAL_CALLS, RpMedicalCallsEvent ]
        ]),
        composers: new Map<number, Function>([
            [ RP_MEDICAL_CALL_CLAIM, RpMedicalCallClaimComposer ]
        ])
    });

    registered = true;
}
