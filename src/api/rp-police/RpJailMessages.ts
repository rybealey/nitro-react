import { IMessageDataWrapper, IMessageEvent, IMessageParser, MessageEvent } from '@nitrots/nitro-renderer';
import { GetCommunication, GetConnection } from '../nitro';

// PixelRP jail (emulator JailState / ArrestCommand). Defined in client source
// and registered at runtime, like the turf and gang packets. Wire ids match
// the emulator's Resources/Revisions/1.6.6.json.
//
// The Room tool's Jail room switch is SET with the renderer's
// RpSetEmergencyComposer, category 4 - the same staff switch packet as the
// emergency services. Only its state comes back here. (3 was the Arrest room
// switch; where an arrest is made is an Arrest point furni behaviour now.)
const RP_ROOM_POLICE = 4155; // server -> client: a room's jail tag
const RP_JAIL = 4156; // server -> client: your own sentence's countdown

/** RpSetEmergencyComposer category for the Gameplay tab's Jail room switch. */
export const ROOM_POLICE_JAIL = 4;

export class RpRoomPoliceParser implements IMessageParser
{
    private _roomId = 0;
    private _isJailRoom = false;

    public flush(): boolean
    {
        this._roomId = 0;
        this._isJailRoom = false;

        return true;
    }

    public parse(wrapper: IMessageDataWrapper): boolean
    {
        if(!wrapper) return false;

        this._roomId = wrapper.readInt();
        this._isJailRoom = wrapper.readBoolean();

        return true;
    }

    public get roomId(): number
    {
        return this._roomId;
    }

    public get isJailRoom(): boolean
    {
        return this._isJailRoom;
    }
}

export class RpRoomPoliceEvent extends MessageEvent implements IMessageEvent
{
    constructor(callback: Function)
    {
        super(callback, RpRoomPoliceParser);
    }

    public getParser(): RpRoomPoliceParser
    {
        return this.parser as RpRoomPoliceParser;
    }
}

class RpJailParser implements IMessageParser
{
    public secondsLeft = 0;
    public sentenceSeconds = 0;

    public flush(): boolean
    {
        this.secondsLeft = 0;
        this.sentenceSeconds = 0;

        return true;
    }

    public parse(wrapper: IMessageDataWrapper): boolean
    {
        this.secondsLeft = wrapper.readInt();
        this.sentenceSeconds = wrapper.readInt();

        return true;
    }
}

class RpJailEvent extends MessageEvent implements IMessageEvent
{
    constructor(callback: Function)
    {
        super(callback, RpJailParser);
    }

    public getParser(): RpJailParser
    {
        return this.parser as RpJailParser;
    }
}

/**
 * Your own sentence, as last sent: seconds left then, and when "then" was on
 * performance.now(), so the countdown runs on locally between sends. Free is
 * secondsLeft 0.
 */
export interface JailSentence { secondsLeft: number; sentenceSeconds: number; receivedAt: number; }

let jailSentence: JailSentence = { secondsLeft: 0, sentenceSeconds: 0, receivedAt: 0 };
const jailListeners = new Set<() => void>();

export const GetJailSentence = (): JailSentence => jailSentence;

export const SubscribeJailSentence = (listener: () => void): (() => void) =>
{
    jailListeners.add(listener);

    return () =>
    {
        jailListeners.delete(listener);
    };
}

let registered = false;

// Called once from App at CONNECTION_AUTHENTICATED, with the other Rp packets.
// The countdown's handler is registered here rather than by the view, so a
// sentence sent at login is kept even if it lands before the view mounts.
export const RegisterRpJailMessages = () =>
{
    if(registered) return;

    const connection = GetConnection();

    if(!connection) return;

    connection.registerMessages({
        events: new Map<number, Function>([
            [ RP_ROOM_POLICE, RpRoomPoliceEvent ],
            [ RP_JAIL, RpJailEvent ]
        ]),
        composers: new Map<number, Function>()
    });

    GetCommunication().registerMessageEvent(new RpJailEvent((event: RpJailEvent) =>
    {
        const parser = event.getParser();

        jailSentence = { secondsLeft: parser.secondsLeft, sentenceSeconds: parser.sentenceSeconds, receivedAt: performance.now() };
        jailListeners.forEach(listener => listener());
    }));

    registered = true;
}
