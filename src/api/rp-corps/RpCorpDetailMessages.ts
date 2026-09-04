import { IMessageDataWrapper, IMessageEvent, IMessageParser, MessageEvent } from '@nitrots/nitro-renderer';
import { GetConnection } from '../nitro';

// PixelRP corp-detail packet, defined in CLIENT source and registered at
// runtime via connection.registerMessages - the same pattern the gang
// packets use (see api/rp-gangs/RpGangMessages.ts), and for the same
// reason: the renderer's own copy of this parser can only be extended by
// authoring another @nitrots/nitro-renderer yarn patch, and patches need a
// machine with yarn.
//
// This REPLACES the renderer's RpCorpDetailEvent rather than sitting beside
// it. The roster now carries a lastOnline int per employee, so the stock
// parser would read one field short per employee and desync every employee
// after the first. MessageClassManager keys its map by handler CLASS (not by
// header), so registering this class for header 3947 is additive - the stock
// class stays registered but, because nothing subscribes to it any more, it
// is never instantiated and never parses. Nothing may import the renderer's
// RpCorpDetailEvent from here on.
const RP_CORP_DETAIL = 3947; // server -> client

export interface RpCorpEmployee
{
    username: string;
    figure: string;
    tier: number;
    online: boolean;
    onDuty: boolean;
    shiftSeconds: number;
    shiftSecondsWeek: number;
    // unix seconds; 0 = never recorded. STALE while the player is online
    // (users.last_online is only written on logout), so read `online` first
    // and render "Now" rather than trusting this.
    lastOnline: number;
}

export interface RpCorpRank
{
    id: number;
    order: number;
    name: string;
    pay: number;
    tiers: number;
    employees: RpCorpEmployee[];
}

export class RpCorpDetailParser implements IMessageParser
{
    private _corpId: number;
    private _name: string;
    private _badge: string;
    private _description: string;
    private _stock: number;
    private _employeeCount: number;
    private _ranks: RpCorpRank[];

    public flush(): boolean
    {
        this._corpId = 0;
        this._name = '';
        this._badge = '';
        this._description = '';
        this._stock = 0;
        this._employeeCount = 0;
        this._ranks = [];

        return true;
    }

    public parse(wrapper: IMessageDataWrapper): boolean
    {
        if(!wrapper) return false;

        this._corpId = wrapper.readInt();
        this._name = wrapper.readString();
        this._badge = wrapper.readString();
        this._description = wrapper.readString();
        this._stock = wrapper.readInt();
        this._employeeCount = wrapper.readInt();
        this._ranks = [];

        let rankCount = wrapper.readInt();

        while(rankCount > 0)
        {
            const id = wrapper.readInt();
            const order = wrapper.readInt();
            const name = wrapper.readString();
            const pay = wrapper.readInt();
            const tiers = wrapper.readInt();
            const employees: RpCorpEmployee[] = [];

            let employeeCount = wrapper.readInt();

            while(employeeCount > 0)
            {
                const username = wrapper.readString();
                const figure = wrapper.readString();
                const tier = wrapper.readInt();
                const online = (wrapper.readInt() === 1);
                const onDuty = (wrapper.readInt() === 1);
                const shiftSeconds = wrapper.readInt();
                const shiftSecondsWeek = wrapper.readInt();
                const lastOnline = wrapper.readInt();

                employees.push({ username, figure, tier, online, onDuty, shiftSeconds, shiftSecondsWeek, lastOnline });

                employeeCount--;
            }

            this._ranks.push({ id, order, name, pay, tiers, employees });

            rankCount--;
        }

        return true;
    }

    public get corpId(): number { return this._corpId; }
    public get name(): string { return this._name; }
    public get badge(): string { return this._badge; }
    public get description(): string { return this._description; }
    // quantity the corporation holds; a placeholder 0 until farming lands
    public get stock(): number { return this._stock; }
    public get employeeCount(): number { return this._employeeCount; }
    public get ranks(): RpCorpRank[] { return this._ranks; }
}

export class RpCorpDetailEvent extends MessageEvent implements IMessageEvent
{
    constructor(callBack: Function)
    {
        super(callBack, RpCorpDetailParser);
    }

    public getParser(): RpCorpDetailParser
    {
        return this.parser as RpCorpDetailParser;
    }
}

let registered = false;

// Called from App.tsx at CONNECTION_AUTHENTICATED, before MainView's
// children mount their useMessageEvent hooks.
export const RegisterRpCorpMessages = () =>
{
    if(registered) return;

    const connection = GetConnection();

    if(!connection) return;

    connection.registerMessages({
        events: new Map<number, Function>([ [ RP_CORP_DETAIL, RpCorpDetailEvent ] ]),
        composers: new Map<number, Function>()
    });

    registered = true;
}
