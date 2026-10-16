import { IMessageDataWrapper, IMessageEvent, IMessageParser, MessageEvent } from '@nitrots/nitro-renderer';
import { GetConnection } from '../nitro';

// PixelRP paramedics' emergency queue (emulator MedicalCalls). Defined in client
// source and registered at runtime, like the 911 calls packet. The wire id
// matches the emulator's Resources/Revisions/1.6.6.json. Server -> client only:
// the window has nothing to press.
const RP_MEDICAL_CALLS = 4205; // server -> client: the window, open with its deaths, or closed

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
}

export class RpMedicalCallsParser implements IMessageParser
{
    private _open = false;
    private _calls: MedicalCall[] = [];
    private _reopen = false;

    public flush(): boolean
    {
        this._open = false;
        this._calls = [];
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
            age: wrapper.readInt()
        });

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
        composers: new Map<number, Function>()
    });

    registered = true;
}
