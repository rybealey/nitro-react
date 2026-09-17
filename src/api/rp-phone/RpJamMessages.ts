import { IMessageComposer, IMessageDataWrapper, IMessageEvent, IMessageParser, MessageEvent } from '@nitrots/nitro-renderer';
import { GetConnection } from '../nitro';

// PixelRP jam packets - client-source, registered at runtime, the same shape as
// RpTunesMessages. Wire ids match the emulator's ClientPacketHeader /
// ServerPacketHeader (4030-4040).
//
// ONE state packet covers the whole feature. Everything a member needs to know
// about - somebody joined, the host changed, the track changed, the queue
// changed - is a change to the same state, so there is nothing to gain from
// splitting it and a great deal to lose: two packets can arrive in the wrong
// order and disagree.
const RP_JAM_STATE = 4030; // server -> client
const RP_JAM_STATE_REQ = 4031;
const RP_JAM_START = 4032;
const RP_JAM_INVITE = 4033;
const RP_JAM_JOIN = 4034;
const RP_JAM_LEAVE = 4035;
const RP_JAM_ADD = 4036;
const RP_JAM_REMOVE = 4037;
const RP_JAM_SKIP = 4038;
const RP_JAM_PAUSE = 4039;
const RP_JAM_REPORT = 4040;

export interface RpJamMemberData { id: number; username: string; away: boolean; }
export interface RpJamTrackData { videoId: string; title: string; author: string; durationSec: number; elapsedSec: number; queuedBy: string; }
export interface RpJamQueueData { videoId: string; title: string; author: string; queuedBy: string; }

export class RpJamStateParser implements IMessageParser
{
    private _inJam: boolean;
    private _jamId: number;
    private _hostId: number;
    private _hostName: string;
    private _isHost: boolean;
    private _paused: boolean;
    private _members: RpJamMemberData[];
    private _current: RpJamTrackData;
    private _queue: RpJamQueueData[];

    public flush(): boolean
    {
        this._inJam = false;
        this._jamId = 0;
        this._hostId = 0;
        this._hostName = '';
        this._isHost = false;
        this._paused = false;
        this._members = [];
        this._current = null;
        this._queue = [];

        return true;
    }

    public parse(wrapper: IMessageDataWrapper): boolean
    {
        if(!wrapper) return false;

        this._members = [];
        this._queue = [];
        this._current = null;
        this._inJam = wrapper.readBoolean();

        // "You are in no jam" is a real answer, not an empty packet. A client
        // that has just reloaded cannot otherwise tell not-in-one apart from
        // not-told-yet, and the difference decides whether it plays anything.
        if(!this._inJam) return true;

        this._jamId = wrapper.readInt();
        this._hostId = wrapper.readInt();
        this._hostName = wrapper.readString();
        this._isHost = wrapper.readBoolean();
        this._paused = wrapper.readBoolean();

        const memberCount = wrapper.readInt();

        for(let i = 0; i < memberCount; i++)
        {
            this._members.push({
                id: wrapper.readInt(),
                username: wrapper.readString(),
                away: wrapper.readBoolean()
            });
        }

        if(wrapper.readBoolean())
        {
            this._current = {
                videoId: wrapper.readString(),
                title: wrapper.readString(),
                author: wrapper.readString(),
                durationSec: wrapper.readInt(),
                elapsedSec: wrapper.readInt(),
                queuedBy: wrapper.readString()
            };
        }

        const queueCount = wrapper.readInt();

        for(let i = 0; i < queueCount; i++)
        {
            this._queue.push({
                videoId: wrapper.readString(),
                title: wrapper.readString(),
                author: wrapper.readString(),
                queuedBy: wrapper.readString()
            });
        }

        return true;
    }

    public get inJam(): boolean { return this._inJam; }
    public get jamId(): number { return this._jamId; }
    public get hostId(): number { return this._hostId; }
    public get hostName(): string { return this._hostName; }
    public get isHost(): boolean { return this._isHost; }
    public get paused(): boolean { return this._paused; }
    public get members(): RpJamMemberData[] { return this._members; }
    public get current(): RpJamTrackData { return this._current; }
    public get queue(): RpJamQueueData[] { return this._queue; }
}

export class RpJamStateEvent extends MessageEvent implements IMessageEvent
{
    constructor(callBack: Function)
    {
        super(callBack, RpJamStateParser);
    }

    public getParser(): RpJamStateParser
    {
        return this.parser as RpJamStateParser;
    }
}

// One composer class per message, each holding its own arguments. The renderer
// serializes whatever getMessageArray returns, in order.
class RpJamComposer implements IMessageComposer<(string | number | boolean)[]>
{
    protected _data: (string | number | boolean)[];

    constructor(...args: (string | number | boolean)[])
    {
        this._data = args;
    }

    public getMessageArray() { return this._data; }

    public dispose(): void { return; }
}

export class RpJamStateRequestComposer extends RpJamComposer {}
export class RpJamStartComposer extends RpJamComposer {}
export class RpJamInviteComposer extends RpJamComposer {}
export class RpJamJoinComposer extends RpJamComposer {}
export class RpJamLeaveComposer extends RpJamComposer {}
export class RpJamAddComposer extends RpJamComposer {}
export class RpJamRemoveComposer extends RpJamComposer {}
export class RpJamSkipComposer extends RpJamComposer {}
export class RpJamPauseComposer extends RpJamComposer {}
export class RpJamReportComposer extends RpJamComposer {}

let registered = false;

export const RegisterRpJamMessages = () =>
{
    if(registered) return;

    const connection = GetConnection();

    if(!connection) return;

    connection.registerMessages({
        events: new Map<number, Function>([ [ RP_JAM_STATE, RpJamStateEvent ] ]),
        composers: new Map<number, Function>([
            [ RP_JAM_STATE_REQ, RpJamStateRequestComposer ],
            [ RP_JAM_START, RpJamStartComposer ],
            [ RP_JAM_INVITE, RpJamInviteComposer ],
            [ RP_JAM_JOIN, RpJamJoinComposer ],
            [ RP_JAM_LEAVE, RpJamLeaveComposer ],
            [ RP_JAM_ADD, RpJamAddComposer ],
            [ RP_JAM_REMOVE, RpJamRemoveComposer ],
            [ RP_JAM_SKIP, RpJamSkipComposer ],
            [ RP_JAM_PAUSE, RpJamPauseComposer ],
            [ RP_JAM_REPORT, RpJamReportComposer ]
        ])
    });

    registered = true;
}
