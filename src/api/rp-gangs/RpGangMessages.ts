import { IMessageComposer, IMessageDataWrapper, IMessageEvent, IMessageParser, MessageEvent } from '@nitrots/nitro-renderer';
import { GetConnection } from '../nitro';
import { GangDetail, GangIncomingInvite, GangInvite, GangMember, GangRole } from './RpGangTypes';

// PixelRP gang packets - defined in CLIENT source and registered at runtime
// via connection.registerMessages (which is public and additive), instead of
// another @nitrots/nitro-renderer yarn patch: patches can only be authored
// on a machine with yarn, which the dev Mac doesn't have. Wire ids match the
// emulator's Resources/Revisions/1.6.6.json.
const RP_USER_GANG = 3970; // server -> client
const RP_GET_USER_GANG = 3971; // client -> server
const RP_BUY_GANG = 3972; // client -> server
const RP_GANG_DETAIL = 3973; // server -> client
const RP_GANG_INVITES = 3974; // server -> client
const RP_GET_GANG_DETAIL = 3976; // client -> server
const RP_GANG_INVITE = 3977;
const RP_GANG_CANCEL_INVITE = 3978;
const RP_GANG_RESPOND_INVITE = 3979;
const RP_GANG_LEAVE = 3980;
const RP_GANG_KICK = 3981;
const RP_GANG_SAVE_ROLE = 3982;
const RP_GANG_DELETE_ROLE = 3983;
const RP_GANG_SET_MEMBER_ROLE = 3984;
const RP_GANG_REORDER_ROLES = 3985;

// One player's gang membership, keyed by user id; gangId 0 = not in a gang.
// Colours arrive as '#rrggbb'. gangCost (credits) rides along so the Gang
// window prices Create without a second packet.
export class RpUserGangParser implements IMessageParser
{
    private _userId: number;
    private _gangId: number;
    private _name: string;
    private _colourA: string;
    private _colourB: string;
    private _isOwner: boolean;
    private _gangCost: number;

    public flush(): boolean
    {
        this._userId = 0;
        this._gangId = 0;
        this._name = '';
        this._colourA = '';
        this._colourB = '';
        this._isOwner = false;
        this._gangCost = 0;

        return true;
    }

    public parse(wrapper: IMessageDataWrapper): boolean
    {
        if(!wrapper) return false;

        this._userId = wrapper.readInt();
        this._gangId = wrapper.readInt();
        this._name = wrapper.readString();
        this._colourA = wrapper.readString();
        this._colourB = wrapper.readString();
        this._isOwner = (wrapper.readInt() === 1);
        this._gangCost = wrapper.readInt();

        return true;
    }

    public get userId(): number { return this._userId; }
    public get gangId(): number { return this._gangId; }
    public get name(): string { return this._name; }
    public get colourA(): string { return this._colourA; }
    public get colourB(): string { return this._colourB; }
    public get isOwner(): boolean { return this._isOwner; }
    public get gangCost(): number { return this._gangCost; }
}

export class RpUserGangEvent extends MessageEvent implements IMessageEvent
{
    constructor(callBack: Function)
    {
        super(callBack, RpUserGangParser);
    }

    public getParser(): RpUserGangParser
    {
        return this.parser as RpUserGangParser;
    }
}

// The viewer's own gang in full: identity, level, THEIR permission bits,
// roles in display order, every member and (when they may act on them) the
// pending invites. Pushed to every online member after any gang mutation.
export class RpGangDetailParser implements IMessageParser
{
    private _detail: GangDetail;

    public flush(): boolean
    {
        this._detail = null;

        return true;
    }

    public parse(wrapper: IMessageDataWrapper): boolean
    {
        if(!wrapper) return false;

        const gangId = wrapper.readInt();
        const name = wrapper.readString();
        const colourA = wrapper.readString();
        const colourB = wrapper.readString();
        const ownerId = wrapper.readInt();
        const ownerName = wrapper.readString();
        const level = wrapper.readInt();
        const xp = wrapper.readInt();
        const xpCap = wrapper.readInt();
        const createdAt = wrapper.readInt();
        const permissions = wrapper.readInt();

        const roles: GangRole[] = [];
        const roleCount = wrapper.readInt();

        for(let i = 0; i < roleCount; i++)
        {
            roles.push({ id: wrapper.readInt(), name: wrapper.readString(), order: wrapper.readInt(), flags: wrapper.readInt() });
        }

        const members: GangMember[] = [];
        const memberCount = wrapper.readInt();

        for(let i = 0; i < memberCount; i++)
        {
            members.push({ userId: wrapper.readInt(), username: wrapper.readString(), figure: wrapper.readString(), roleId: wrapper.readInt(), online: (wrapper.readInt() === 1), joinedAt: wrapper.readInt() });
        }

        const invites: GangInvite[] = [];
        const inviteCount = wrapper.readInt();

        for(let i = 0; i < inviteCount; i++)
        {
            invites.push({ userId: wrapper.readInt(), username: wrapper.readString(), figure: wrapper.readString(), invitedBy: wrapper.readString(), expiresAt: wrapper.readInt() });
        }

        const inviteHours = wrapper.readInt();

        this._detail = { gangId, name, colourA, colourB, ownerId, ownerName, level, xp, xpCap, createdAt, permissions, roles, members, invites, inviteHours };

        return true;
    }

    public get detail(): GangDetail { return this._detail; }
}

export class RpGangDetailEvent extends MessageEvent implements IMessageEvent
{
    constructor(callBack: Function)
    {
        super(callBack, RpGangDetailParser);
    }

    public getParser(): RpGangDetailParser
    {
        return this.parser as RpGangDetailParser;
    }
}

// The invites waiting on a player who is NOT in a gang - the create view
// shows them above the founding form.
export class RpGangInvitesParser implements IMessageParser
{
    private _invites: GangIncomingInvite[];

    public flush(): boolean
    {
        this._invites = [];

        return true;
    }

    public parse(wrapper: IMessageDataWrapper): boolean
    {
        if(!wrapper) return false;

        const count = wrapper.readInt();

        this._invites = [];

        for(let i = 0; i < count; i++)
        {
            this._invites.push({ gangId: wrapper.readInt(), name: wrapper.readString(), colourA: wrapper.readString(), colourB: wrapper.readString(), invitedBy: wrapper.readString(), expiresAt: wrapper.readInt() });
        }

        return true;
    }

    public get invites(): GangIncomingInvite[] { return this._invites; }
}

export class RpGangInvitesEvent extends MessageEvent implements IMessageEvent
{
    constructor(callBack: Function)
    {
        super(callBack, RpGangInvitesParser);
    }

    public getParser(): RpGangInvitesParser
    {
        return this.parser as RpGangInvitesParser;
    }
}

// Plain composers: the constructor arguments ARE the wire payload, in order.
class RpGangComposer implements IMessageComposer<(string | number)[]>
{
    private _data: (string | number)[];

    constructor(...data: (string | number)[])
    {
        this._data = data;
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

// one user's membership (own id = the Gang window's gate, a target's id on profile open)
export class RpGetUserGangComposer extends RpGangComposer
{
    constructor(userId: number)
    {
        super(userId);
    }
}

// Found a gang: name + the two chosen colours as raw RGB ints (the server
// stores them in groups.colour1/colour2 and validates, prices and charges).
export class RpBuyGangComposer extends RpGangComposer
{
    constructor(name: string, colourA: number, colourB: number)
    {
        super(name, colourA, colourB);
    }
}

// The Gang window's state: detail when in a gang, else the incoming invites.
// With a gangId, that gang's detail instead - a read-only look at someone
// else's gang (no permission bits, no invites for a non-member).
export class RpGetGangDetailComposer extends RpGangComposer
{
    constructor(gangId: number = 0)
    {
        super(gangId);
    }
}

export class RpGangInviteComposer extends RpGangComposer
{
    constructor(username: string)
    {
        super(username);
    }
}

export class RpGangCancelInviteComposer extends RpGangComposer
{
    constructor(userId: number)
    {
        super(userId);
    }
}

export class RpGangRespondInviteComposer extends RpGangComposer
{
    constructor(gangId: number, accept: boolean)
    {
        super(gangId, (accept ? 1 : 0));
    }
}

// leave - or, for the leader, disband
export class RpGangLeaveComposer extends RpGangComposer
{
    constructor()
    {
        super();
    }
}

export class RpGangKickComposer extends RpGangComposer
{
    constructor(userId: number)
    {
        super(userId);
    }
}

// roleId 0 creates; flags are the GANG_PERM_* bits a role may carry
export class RpGangSaveRoleComposer extends RpGangComposer
{
    constructor(roleId: number, name: string, flags: number)
    {
        super(roleId, name, flags);
    }
}

export class RpGangDeleteRoleComposer extends RpGangComposer
{
    constructor(roleId: number)
    {
        super(roleId);
    }
}

// roleId 0 = plain Member
export class RpGangSetMemberRoleComposer extends RpGangComposer
{
    constructor(userId: number, roleId: number)
    {
        super(userId, roleId);
    }
}

// the custom roles' new top-to-bottom order
export class RpGangReorderRolesComposer extends RpGangComposer
{
    constructor(roleIds: number[])
    {
        super(roleIds.length, ...roleIds);
    }
}

let registered = false;

// Called once from App at CONNECTION_AUTHENTICATED, before MainView's
// children mount their useMessageEvent hooks. registerMessages is additive,
// so this extends the stock configuration rather than replacing it.
export const RegisterRpGangMessages = () =>
{
    if(registered) return;

    const connection = GetConnection();

    if(!connection) return;

    connection.registerMessages({
        events: new Map<number, Function>([
            [ RP_USER_GANG, RpUserGangEvent ],
            [ RP_GANG_DETAIL, RpGangDetailEvent ],
            [ RP_GANG_INVITES, RpGangInvitesEvent ]
        ]),
        composers: new Map<number, Function>([
            [ RP_GET_USER_GANG, RpGetUserGangComposer ],
            [ RP_BUY_GANG, RpBuyGangComposer ],
            [ RP_GET_GANG_DETAIL, RpGetGangDetailComposer ],
            [ RP_GANG_INVITE, RpGangInviteComposer ],
            [ RP_GANG_CANCEL_INVITE, RpGangCancelInviteComposer ],
            [ RP_GANG_RESPOND_INVITE, RpGangRespondInviteComposer ],
            [ RP_GANG_LEAVE, RpGangLeaveComposer ],
            [ RP_GANG_KICK, RpGangKickComposer ],
            [ RP_GANG_SAVE_ROLE, RpGangSaveRoleComposer ],
            [ RP_GANG_DELETE_ROLE, RpGangDeleteRoleComposer ],
            [ RP_GANG_SET_MEMBER_ROLE, RpGangSetMemberRoleComposer ],
            [ RP_GANG_REORDER_ROLES, RpGangReorderRolesComposer ]
        ])
    });

    registered = true;
}
