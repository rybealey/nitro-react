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
const RP_CORP_PANEL_DISCIPLINE_ACTION = 4247; // client -> server: issue or revoke
const RP_CORP_PANEL_DISCIPLINE = 4248; // server -> client: Warnings and Strikes
const RP_CORP_PANEL_EMPLOYEE = 4249; // server -> client: one employee's file
const RP_CORP_PANEL_RESULT = 4250; // server -> client: how a change went
const RP_CORP_PANEL_RANK_ACTION = 4251; // client -> server: request, approve, deny, withdraw
const RP_CORP_PANEL_RANK_LOG = 4252; // server -> client: Promotions and Demotions
const RP_CORP_PANEL_REQUESTS = 4253; // server -> client: Promo and Demotion requests

// CorpPanel.Action on the server.
export const CorpPanelAction = {
    Open: 0,
    Dashboard: 1,
    Shifts: 2,
    Discipline: 3,
    // the int is the employee's user id
    Employee: 4,
    RankLog: 5,
    Requests: 6
} as const;

// CorpPanel.RankAction on the server. Their results come back as action
// RANK_RESULT_BASE + this.
export const CorpRankAction = {
    Request: 0,
    Approve: 1,
    Deny: 2,
    Withdraw: 3
} as const;

export const RANK_RESULT_BASE = 10;

export type CorpRankDirection = 'promotion' | 'demotion';

// CorpPanel.DisciplineAction on the server.
export const CorpDisciplineAction = {
    Issue: 0,
    Revoke: 1
} as const;

export type CorpDisciplineKind = 'warning' | 'strike';

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
    // slice 3: open requests, for the sidebar
    pendingPromotions: number;
    pendingDemotions: number;
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
    // slice 2
    warnings: number;
    strikes: number;
    reviews: number;
    // slice 3
    pendingPromotions: number;
    pendingDemotions: number;
}

export interface CorpDisciplineEntry
{
    id: number;
    kind: CorpDisciplineKind;
    userId: number;
    username: string;
    look: string;
    gender: string;
    rankName: string;
    reason: string;
    details: string;
    issuedBy: number;
    issuedByName: string;
    automatic: boolean;
    createdAt: number;
    revokedByName: string;
    revokedAt: number;
}

export interface CorpDisciplinePerson
{
    userId: number;
    username: string;
    look: string;
    gender: string;
    rankName: string;
    tier: number;
    warnings: number;
    strikes: number;
    canDiscipline: boolean;
}

export interface CorpPanelDiscipline
{
    weeksAgo: number;
    weekStartedAt: number;
    weekResetAt: number;
    warningsPerStrike: number;
    strikesForReview: number;
    entries: CorpDisciplineEntry[];
    people: CorpDisciplinePerson[];
}

export interface CorpPanelEmployee
{
    userId: number;
    username: string;
    look: string;
    gender: string;
    rankName: string;
    tier: number;
    hiredAt: number;
    lastOnline: number;
    onDuty: boolean;
    online: boolean;
    shiftQuota: number;
    warnings: number;
    strikes: number;
    canDiscipline: boolean;
    firstWeekStartedAt: number;
    weekSeconds: number[];
    record: CorpDisciplineEntry[];
    // slice 3
    rankChanges: CorpRankChange[];
}

export interface CorpRankChange
{
    id: number;
    userId: number;
    username: string;
    look: string;
    gender: string;
    direction: CorpRankDirection;
    fromTitle: string;
    toTitle: string;
    reason: string;
    actorName: string;
    // 'command' (:promote / :demote) or 'request' (approved in the panel)
    source: string;
    requestedByName: string;
    shiftSecondsWeek: number;
    warnings: number;
    strikes: number;
    createdAt: number;
}

export interface CorpPanelRankLog
{
    weeksAgo: number;
    weekStartedAt: number;
    weekResetAt: number;
    changes: CorpRankChange[];
}

export type CorpRequestStatus = 'pending' | 'approved' | 'denied' | 'cancelled';

export interface CorpRankRequest
{
    id: number;
    userId: number;
    username: string;
    look: string;
    gender: string;
    direction: CorpRankDirection;
    fromTitle: string;
    toTitle: string;
    reason: string;
    requestedBy: number;
    requestedByName: string;
    status: CorpRequestStatus;
    decidedByName: string;
    decidedAt: number;
    note: string;
    createdAt: number;
    // why this viewer can't approve it now; '' when they can
    blocker: string;
}

export interface CorpRankPerson
{
    userId: number;
    username: string;
    look: string;
    gender: string;
    rankTitle: string;
    upTitle: string;
    downTitle: string;
    canRequestUp: boolean;
    canRequestDown: boolean;
    weekSeconds: number;
    warnings: number;
    strikes: number;
    inRankSince: number;
}

export interface CorpPanelRequests
{
    canApprove: boolean;
    shiftQuota: number;
    requests: CorpRankRequest[];
    people: CorpRankPerson[];
}

export interface CorpPanelResult
{
    action: number;
    ok: boolean;
    message: string;
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
            weekResetAt: wrapper.readInt(),
            pendingPromotions: 0,
            pendingDemotions: 0
        };

        if(wrapper.bytesAvailable)
        {
            this._context.pendingPromotions = wrapper.readInt();
            this._context.pendingDemotions = wrapper.readInt();
        }

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

        // slice 2's counts, read only when the server sends them
        const more = (wrapper.bytesAvailable);
        const warnings = (more ? wrapper.readInt() : 0);
        const strikes = (more ? wrapper.readInt() : 0);
        const reviews = (more ? wrapper.readInt() : 0);
        const pending = (wrapper.bytesAvailable);
        const pendingPromotions = (pending ? wrapper.readInt() : 0);
        const pendingDemotions = (pending ? wrapper.readInt() : 0);

        this._dashboard = { weeksAgo, weekStartedAt, weekResetAt, employees, onDuty, shiftSeconds, quotaMet, shiftQuota, daySeconds, leaders, warnings, strikes, reviews, pendingPromotions, pendingDemotions };

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

const readEntry = (wrapper: IMessageDataWrapper): CorpDisciplineEntry => ({
    id: wrapper.readInt(),
    kind: wrapper.readString() as CorpDisciplineKind,
    userId: wrapper.readInt(),
    username: wrapper.readString(),
    look: wrapper.readString(),
    gender: wrapper.readString(),
    rankName: wrapper.readString(),
    reason: wrapper.readString(),
    details: wrapper.readString(),
    issuedBy: wrapper.readInt(),
    issuedByName: wrapper.readString(),
    automatic: wrapper.readBoolean(),
    createdAt: wrapper.readInt(),
    revokedByName: wrapper.readString(),
    revokedAt: wrapper.readInt()
});

const readChange = (wrapper: IMessageDataWrapper): CorpRankChange => ({
    id: wrapper.readInt(),
    userId: wrapper.readInt(),
    username: wrapper.readString(),
    look: wrapper.readString(),
    gender: wrapper.readString(),
    direction: wrapper.readString() as CorpRankDirection,
    fromTitle: wrapper.readString(),
    toTitle: wrapper.readString(),
    reason: wrapper.readString(),
    actorName: wrapper.readString(),
    source: wrapper.readString(),
    requestedByName: wrapper.readString(),
    shiftSecondsWeek: wrapper.readInt(),
    warnings: wrapper.readInt(),
    strikes: wrapper.readInt(),
    createdAt: wrapper.readInt()
});

export class RpCorpPanelRankLogParser implements IMessageParser
{
    private _log: CorpPanelRankLog = null;

    public flush(): boolean
    {
        this._log = null;

        return true;
    }

    public parse(wrapper: IMessageDataWrapper): boolean
    {
        if(!wrapper) return false;

        const weeksAgo = wrapper.readInt();
        const weekStartedAt = wrapper.readInt();
        const weekResetAt = wrapper.readInt();
        const changes: CorpRankChange[] = [];

        let count = wrapper.readInt();

        while(count-- > 0) changes.push(readChange(wrapper));

        this._log = { weeksAgo, weekStartedAt, weekResetAt, changes };

        return true;
    }

    public get log(): CorpPanelRankLog
    {
        return this._log;
    }
}

export class RpCorpPanelRequestsParser implements IMessageParser
{
    private _requests: CorpPanelRequests = null;

    public flush(): boolean
    {
        this._requests = null;

        return true;
    }

    public parse(wrapper: IMessageDataWrapper): boolean
    {
        if(!wrapper) return false;

        const canApprove = wrapper.readBoolean();
        const shiftQuota = wrapper.readInt();
        const requests: CorpRankRequest[] = [];
        const people: CorpRankPerson[] = [];

        let count = wrapper.readInt();

        while(count-- > 0) requests.push({
            id: wrapper.readInt(),
            userId: wrapper.readInt(),
            username: wrapper.readString(),
            look: wrapper.readString(),
            gender: wrapper.readString(),
            direction: wrapper.readString() as CorpRankDirection,
            fromTitle: wrapper.readString(),
            toTitle: wrapper.readString(),
            reason: wrapper.readString(),
            requestedBy: wrapper.readInt(),
            requestedByName: wrapper.readString(),
            status: wrapper.readString() as CorpRequestStatus,
            decidedByName: wrapper.readString(),
            decidedAt: wrapper.readInt(),
            note: wrapper.readString(),
            createdAt: wrapper.readInt(),
            blocker: wrapper.readString()
        });

        count = wrapper.readInt();

        while(count-- > 0) people.push({
            userId: wrapper.readInt(),
            username: wrapper.readString(),
            look: wrapper.readString(),
            gender: wrapper.readString(),
            rankTitle: wrapper.readString(),
            upTitle: wrapper.readString(),
            downTitle: wrapper.readString(),
            canRequestUp: wrapper.readBoolean(),
            canRequestDown: wrapper.readBoolean(),
            weekSeconds: wrapper.readInt(),
            warnings: wrapper.readInt(),
            strikes: wrapper.readInt(),
            inRankSince: wrapper.readInt()
        });

        this._requests = { canApprove, shiftQuota, requests, people };

        return true;
    }

    public get requests(): CorpPanelRequests
    {
        return this._requests;
    }
}

export class RpCorpPanelRankLogEvent extends MessageEvent implements IMessageEvent
{
    constructor(callBack: Function)
    {
        super(callBack, RpCorpPanelRankLogParser);
    }

    public getParser(): RpCorpPanelRankLogParser
    {
        return this.parser as RpCorpPanelRankLogParser;
    }
}

export class RpCorpPanelRequestsEvent extends MessageEvent implements IMessageEvent
{
    constructor(callBack: Function)
    {
        super(callBack, RpCorpPanelRequestsParser);
    }

    public getParser(): RpCorpPanelRequestsParser
    {
        return this.parser as RpCorpPanelRequestsParser;
    }
}

export class RpCorpPanelDisciplineParser implements IMessageParser
{
    private _discipline: CorpPanelDiscipline = null;

    public flush(): boolean
    {
        this._discipline = null;

        return true;
    }

    public parse(wrapper: IMessageDataWrapper): boolean
    {
        if(!wrapper) return false;

        const weeksAgo = wrapper.readInt();
        const weekStartedAt = wrapper.readInt();
        const weekResetAt = wrapper.readInt();
        const warningsPerStrike = wrapper.readInt();
        const strikesForReview = wrapper.readInt();
        const entries: CorpDisciplineEntry[] = [];
        const people: CorpDisciplinePerson[] = [];

        let count = wrapper.readInt();

        while(count-- > 0) entries.push(readEntry(wrapper));

        count = wrapper.readInt();

        while(count-- > 0) people.push({
            userId: wrapper.readInt(),
            username: wrapper.readString(),
            look: wrapper.readString(),
            gender: wrapper.readString(),
            rankName: wrapper.readString(),
            tier: wrapper.readInt(),
            warnings: wrapper.readInt(),
            strikes: wrapper.readInt(),
            canDiscipline: wrapper.readBoolean()
        });

        this._discipline = { weeksAgo, weekStartedAt, weekResetAt, warningsPerStrike, strikesForReview, entries, people };

        return true;
    }

    public get discipline(): CorpPanelDiscipline
    {
        return this._discipline;
    }
}

export class RpCorpPanelEmployeeParser implements IMessageParser
{
    private _employee: CorpPanelEmployee = null;

    public flush(): boolean
    {
        this._employee = null;

        return true;
    }

    public parse(wrapper: IMessageDataWrapper): boolean
    {
        if(!wrapper) return false;

        const userId = wrapper.readInt();
        const username = wrapper.readString();
        const look = wrapper.readString();
        const gender = wrapper.readString();
        const rankName = wrapper.readString();
        const tier = wrapper.readInt();
        const hiredAt = wrapper.readInt();
        const lastOnline = wrapper.readInt();
        const onDuty = wrapper.readBoolean();
        const online = wrapper.readBoolean();
        const shiftQuota = wrapper.readInt();
        const warnings = wrapper.readInt();
        const strikes = wrapper.readInt();
        const canDiscipline = wrapper.readBoolean();
        const firstWeekStartedAt = wrapper.readInt();
        const weekSeconds: number[] = [];
        const record: CorpDisciplineEntry[] = [];

        let count = wrapper.readInt();

        while(count-- > 0) weekSeconds.push(wrapper.readInt());

        count = wrapper.readInt();

        while(count-- > 0) record.push(readEntry(wrapper));

        const rankChanges: CorpRankChange[] = [];

        if(wrapper.bytesAvailable)
        {
            count = wrapper.readInt();

            while(count-- > 0) rankChanges.push(readChange(wrapper));
        }

        this._employee = { userId, username, look, gender, rankName, tier, hiredAt, lastOnline, onDuty, online, shiftQuota, warnings, strikes, canDiscipline, firstWeekStartedAt, weekSeconds, record, rankChanges };

        return true;
    }

    public get employee(): CorpPanelEmployee
    {
        return this._employee;
    }
}

export class RpCorpPanelResultParser implements IMessageParser
{
    private _result: CorpPanelResult = null;

    public flush(): boolean
    {
        this._result = null;

        return true;
    }

    public parse(wrapper: IMessageDataWrapper): boolean
    {
        if(!wrapper) return false;

        this._result = { action: wrapper.readInt(), ok: wrapper.readBoolean(), message: wrapper.readString() };

        return true;
    }

    public get result(): CorpPanelResult
    {
        return this._result;
    }
}

export class RpCorpPanelDisciplineEvent extends MessageEvent implements IMessageEvent
{
    constructor(callBack: Function)
    {
        super(callBack, RpCorpPanelDisciplineParser);
    }

    public getParser(): RpCorpPanelDisciplineParser
    {
        return this.parser as RpCorpPanelDisciplineParser;
    }
}

export class RpCorpPanelEmployeeEvent extends MessageEvent implements IMessageEvent
{
    constructor(callBack: Function)
    {
        super(callBack, RpCorpPanelEmployeeParser);
    }

    public getParser(): RpCorpPanelEmployeeParser
    {
        return this.parser as RpCorpPanelEmployeeParser;
    }
}

export class RpCorpPanelResultEvent extends MessageEvent implements IMessageEvent
{
    constructor(callBack: Function)
    {
        super(callBack, RpCorpPanelResultParser);
    }

    public getParser(): RpCorpPanelResultParser
    {
        return this.parser as RpCorpPanelResultParser;
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

// Issue (target user id) or revoke (entry id) a warning or strike.
export class RpCorpPanelDisciplineComposer implements IMessageComposer<[ number, number, string, string, string, boolean ]>
{
    private _data: [ number, number, string, string, string, boolean ];

    constructor(action: number, id: number, kind: CorpDisciplineKind | '' = '', reason: string = '', details: string = '', notify: boolean = false)
    {
        this._data = [ action, id, kind, reason, details, notify ];
    }

    public getMessageArray()
    {
        return this._data;
    }

    public dispose(): void
    { }
}

// Request (employee's user id), approve, deny or withdraw (request id).
export class RpCorpPanelRankComposer implements IMessageComposer<[ number, number, string, string ]>
{
    private _data: [ number, number, string, string ];

    constructor(action: number, id: number, direction: CorpRankDirection | '' = '', text: string = '')
    {
        this._data = [ action, id, direction, text ];
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
            [ RP_CORP_PANEL_SHIFTS, RpCorpPanelShiftsEvent ],
            [ RP_CORP_PANEL_DISCIPLINE, RpCorpPanelDisciplineEvent ],
            [ RP_CORP_PANEL_EMPLOYEE, RpCorpPanelEmployeeEvent ],
            [ RP_CORP_PANEL_RESULT, RpCorpPanelResultEvent ],
            [ RP_CORP_PANEL_RANK_LOG, RpCorpPanelRankLogEvent ],
            [ RP_CORP_PANEL_REQUESTS, RpCorpPanelRequestsEvent ]
        ]),
        composers: new Map<number, Function>([
            [ RP_CORP_PANEL_ACTION, RpCorpPanelActionComposer ],
            [ RP_CORP_PANEL_DISCIPLINE_ACTION, RpCorpPanelDisciplineComposer ],
            [ RP_CORP_PANEL_RANK_ACTION, RpCorpPanelRankComposer ]
        ])
    });

    registered = true;
}
