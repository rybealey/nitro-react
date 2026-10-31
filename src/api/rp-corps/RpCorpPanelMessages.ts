import { IMessageComposer, IMessageDataWrapper, IMessageEvent, IMessageParser, MessageEvent } from '@nitrots/nitro-renderer';
import { GetConnection } from '../nitro';

// PixelRP Corporation Panel (:cp) - a corporation's own management window
// (emulator HabboHotel/Corporations/CorpPanel). Defined in client source and
// registered at runtime, like the City Panel packets. Wire ids match the
// emulator's Resources/Revisions/1.6.6.json.
const RP_CORP_PANEL_ACTION = 4243; // client -> server: action + one int
const RP_CORP_PANEL = 4244; // server -> client: who is looking, the week
const RP_CORP_PANEL_DASHBOARD = 4245; // server -> client
const RP_CORP_PANEL_SHIFTS = 4246; // server -> client

// CorpPanel.Action on the server.
export const CorpPanelAction = {
    Open: 0,
    Dashboard: 1,
    Shifts: 2
} as const;

// CorpPanel.Capability on the server; it checks each action again.
export const CorpPanelCapability = {
    View: 1,
    Approve: 2,
    Manage: 4
} as const;

export interface CorpPanelContext
{
    corpId: number;
    corpName: string;
    badge: string;
    rankName: string;
    capabilities: number;
    shiftQuota: number;
    weekStartedAt: number;
    weekResetAt: number;
}

export interface CorpPanelLeader
{
    userId: number;
    username: string;
    look: string;
    gender: string;
    rankName: string;
    onDuty: boolean;
    online: boolean;
    weekSeconds: number;
}

export interface CorpPanelDashboard
{
    weeksAgo: number;
    weekStartedAt: number;
    weekResetAt: number;
    employees: number;
    onDuty: number;
    shiftSeconds: number;
    quotaMet: number;
    shiftQuota: number;
    daySeconds: number[];
    leaders: CorpPanelLeader[];
}

export interface CorpPanelShiftRow
{
    userId: number;
    username: string;
    look: string;
    gender: string;
    rankName: string;
    rankOrder: number;
    tier: number;
    tiers: number;
    onDuty: boolean;
    online: boolean;
    weekSeconds: number;
    daySeconds: number[];
}

export interface CorpPanelShifts
{
    weeksAgo: number;
    weekStartedAt: number;
    weekResetAt: number;
    shiftQuota: number;
    rows: CorpPanelShiftRow[];
}

const readDays = (wrapper: IMessageDataWrapper): number[] =>
{
    const days: number[] = [];

    for(let i = 0; i < 7; i++) days.push(wrapper.readInt());

    return days;
}

export class RpCorpPanelParser implements IMessageParser
{
    private _context: CorpPanelContext = null;

    public flush(): boolean
    {
        this._context = null;

        return true;
    }

    public parse(wrapper: IMessageDataWrapper): boolean
    {
        if(!wrapper) return false;

        this._context = {
            corpId: wrapper.readInt(),
            corpName: wrapper.readString(),
            badge: wrapper.readString(),
            rankName: wrapper.readString(),
            capabilities: wrapper.readInt(),
            shiftQuota: wrapper.readInt(),
            weekStartedAt: wrapper.readInt(),
            weekResetAt: wrapper.readInt()
        };

        return true;
    }

    public get context(): CorpPanelContext
    {
        return this._context;
    }
}

export class RpCorpPanelDashboardParser implements IMessageParser
{
    private _dashboard: CorpPanelDashboard = null;

    public flush(): boolean
    {
        this._dashboard = null;

        return true;
    }

    public parse(wrapper: IMessageDataWrapper): boolean
    {
        if(!wrapper) return false;

        const weeksAgo = wrapper.readInt();
        const weekStartedAt = wrapper.readInt();
        const weekResetAt = wrapper.readInt();
        const employees = wrapper.readInt();
        const onDuty = wrapper.readInt();
        const shiftSeconds = wrapper.readInt();
        const quotaMet = wrapper.readInt();
        const shiftQuota = wrapper.readInt();
        const daySeconds = readDays(wrapper);
        const leaders: CorpPanelLeader[] = [];

        let count = wrapper.readInt();

        while(count-- > 0) leaders.push({
            userId: wrapper.readInt(),
            username: wrapper.readString(),
            look: wrapper.readString(),
            gender: wrapper.readString(),
            rankName: wrapper.readString(),
            onDuty: wrapper.readBoolean(),
            online: wrapper.readBoolean(),
            weekSeconds: wrapper.readInt()
        });

        this._dashboard = { weeksAgo, weekStartedAt, weekResetAt, employees, onDuty, shiftSeconds, quotaMet, shiftQuota, daySeconds, leaders };

        return true;
    }

    public get dashboard(): CorpPanelDashboard
    {
        return this._dashboard;
    }
}

export class RpCorpPanelShiftsParser implements IMessageParser
{
    private _shifts: CorpPanelShifts = null;

    public flush(): boolean
    {
        this._shifts = null;

        return true;
    }

    public parse(wrapper: IMessageDataWrapper): boolean
    {
        if(!wrapper) return false;

        const weeksAgo = wrapper.readInt();
        const weekStartedAt = wrapper.readInt();
        const weekResetAt = wrapper.readInt();
        const shiftQuota = wrapper.readInt();
        const rows: CorpPanelShiftRow[] = [];

        let count = wrapper.readInt();

        while(count-- > 0) rows.push({
            userId: wrapper.readInt(),
            username: wrapper.readString(),
            look: wrapper.readString(),
            gender: wrapper.readString(),
            rankName: wrapper.readString(),
            rankOrder: wrapper.readInt(),
            tier: wrapper.readInt(),
            tiers: wrapper.readInt(),
            onDuty: wrapper.readBoolean(),
            online: wrapper.readBoolean(),
            weekSeconds: wrapper.readInt(),
            daySeconds: readDays(wrapper)
        });

        this._shifts = { weeksAgo, weekStartedAt, weekResetAt, shiftQuota, rows };

        return true;
    }

    public get shifts(): CorpPanelShifts
    {
        return this._shifts;
    }
}

export class RpCorpPanelEvent extends MessageEvent implements IMessageEvent
{
    constructor(callBack: Function)
    {
        super(callBack, RpCorpPanelParser);
    }

    public getParser(): RpCorpPanelParser
    {
        return this.parser as RpCorpPanelParser;
    }
}

export class RpCorpPanelDashboardEvent extends MessageEvent implements IMessageEvent
{
    constructor(callBack: Function)
    {
        super(callBack, RpCorpPanelDashboardParser);
    }

    public getParser(): RpCorpPanelDashboardParser
    {
        return this.parser as RpCorpPanelDashboardParser;
    }
}

export class RpCorpPanelShiftsEvent extends MessageEvent implements IMessageEvent
{
    constructor(callBack: Function)
    {
        super(callBack, RpCorpPanelShiftsParser);
    }

    public getParser(): RpCorpPanelShiftsParser
    {
        return this.parser as RpCorpPanelShiftsParser;
    }
}

export class RpCorpPanelActionComposer implements IMessageComposer<[ number, number ]>
{
    private _data: [ number, number ];

    constructor(action: number, arg: number = 0)
    {
        this._data = [ action, arg ];
    }

    public getMessageArray()
    {
        return this._data;
    }

    public dispose(): void
    { }
}

let registered = false;

export const RegisterRpCorpPanelMessages = () =>
{
    if(registered) return;

    const connection = GetConnection();

    if(!connection) return;

    connection.registerMessages({
        events: new Map<number, Function>([
            [ RP_CORP_PANEL, RpCorpPanelEvent ],
            [ RP_CORP_PANEL_DASHBOARD, RpCorpPanelDashboardEvent ],
            [ RP_CORP_PANEL_SHIFTS, RpCorpPanelShiftsEvent ]
        ]),
        composers: new Map<number, Function>([
            [ RP_CORP_PANEL_ACTION, RpCorpPanelActionComposer ]
        ])
    });

    registered = true;
}
