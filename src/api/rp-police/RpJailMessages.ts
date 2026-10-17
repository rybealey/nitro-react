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
const RP_ROOM_PRISONERS = 4216; // server -> client: who in this room is serving time

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

class RpRoomPrisonersParser implements IMessageParser
{
    public roomIndexes: number[] = [];

    public flush(): boolean
    {
        this.roomIndexes = [];

        return true;
    }

    public parse(wrapper: IMessageDataWrapper): boolean
    {
        let count = wrapper.readInt();

        while(count-- > 0) this.roomIndexes.push(wrapper.readInt());

        return true;
    }
}

class RpRoomPrisonersEvent extends MessageEvent implements IMessageEvent
{
    constructor(callback: Function)
    {
        super(callback, RpRoomPrisonersParser);
    }

    public getParser(): RpRoomPrisonersParser
    {
        return this.parser as RpRoomPrisonersParser;
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

/**
 * Who in the room you are in is serving time, by roomIndex - the whole list
 * each time the server sends it: on coming into a room, and when somebody in
 * it arrives as a prisoner, is sentenced or is let go. The avatar menu leaves
 * Trade off them (Twist, 2026-10-18).
 */
let roomPrisoners = new Set<number>();

export const IsRoomPrisoner = (roomIndex: number): boolean => roomPrisoners.has(roomIndex);

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
            [ RP_JAIL, RpJailEvent ],
            [ RP_ROOM_PRISONERS, RpRoomPrisonersEvent ]
        ]),
        composers: new Map<number, Function>()
    });

    GetCommunication().registerMessageEvent(new RpJailEvent((event: RpJailEvent) =>
    {
        const parser = event.getParser();

        jailSentence = { secondsLeft: parser.secondsLeft, sentenceSeconds: parser.sentenceSeconds, receivedAt: performance.now() };
        jailListeners.forEach(listener => listener());
    }));

    GetCommunication().registerMessageEvent(new RpRoomPrisonersEvent((event: RpRoomPrisonersEvent) =>
    {
        roomPrisoners = new Set(event.getParser().roomIndexes);
    }));

    registered = true;
}
