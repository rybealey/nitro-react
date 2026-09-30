import { IMessageComposer, IMessageDataWrapper, IMessageEvent, IMessageParser, MessageEvent } from '@nitrots/nitro-renderer';
import { GetConnection } from '../nitro';

// PixelRP City Panel - the staff window opened from Mod Tools (emulator
// HabboHotel/CityPanel). Defined in client source and registered at runtime,
// like the turf and jail packets. Wire ids match the emulator's
// Resources/Revisions/1.6.6.json.
const RP_CITY_PANEL_OPEN = 4157; // client -> server
const RP_CITY_PANEL = 4158; // server -> client: capabilities + the Give list
const RP_CITY_SEARCH = 4159; // client -> server
const RP_CITY_SEARCH_RESULT = 4160; // server -> client
const RP_CITY_PLAYER = 4161; // client -> server: open a card
const RP_CITY_PLAYER_CARD = 4162; // server -> client
const RP_CITY_PLAYER_ACTION = 4163; // client -> server
const RP_CITY_BACKPACK = 4164; // client -> server
const RP_CITY_ROOMS = 4165; // client -> server
const RP_CITY_ROOM_LIST = 4166; // server -> client
const RP_CITY_UNIFORMS = 4167; // client -> server: the wearer list
const RP_CITY_UNIFORM_LIST = 4168; // server -> client
const RP_CITY_UNIFORM = 4169; // client -> server: open one uniform
const RP_CITY_UNIFORM_FIGURE = 4170; // server -> client
const RP_CITY_UNIFORM_SAVE = 4171; // client -> server
const RP_CITY_WORLD = 4172; // client -> server: the City tab's state
const RP_CITY_WORLD_STATE = 4173; // server -> client
const RP_CITY_WORLD_SET = 4174; // client -> server: one switch
const RP_CITY_ALERT = 4175; // client -> server
const RP_CITY_ECONOMY = 4176; // client -> server: the Economy tab's state
const RP_CITY_ECONOMY_STATE = 4177; // server -> client
const RP_CITY_PAY_SAVE = 4178; // client -> server
const RP_CITY_PRICE_SAVE = 4179; // client -> server
const RP_CITY_CLOCK_OUT = 4180; // client -> server

/** CityPanelAccess.Capability - what this staff member may do from the panel. */
export const CityCapability = {
    Restore: 1,
    Kill: 2,
    Summon: 4,
    GoTo: 8,
    Justice: 16,
    Balance: 32,
    Backpack: 64,
    Uniforms: 128,
    AlertHotel: 256,
    AlertStaff: 512,
    AlertRoom: 1024,
    World: 2048,
    Hotel: 4096,
    Economy: 8192,
    Shifts: 16384
};

export interface CityEconomyCorp
{
    id: number;
    name: string;
    ranks: { id: number, name: string, pay: number }[];
    onShift: { userId: number, username: string, rankName: string }[];
}

export interface CityServicePrice
{
    key: string;
    name: string;
    corporationId: number;
    price: number;
}

/** RpCityWorldSetEvent's switches. */
export const CityWorldSwitch = { Weather: 1, Time: 2, Maintenance: 3, Combat: 4 };

/** RpCityAlertEvent's targets. */
export const CityAlertTarget = { Everyone: 0, Staff: 1, ThisRoom: 2 };

export interface CityWorldState
{
    /** The held weather code, -1 when it follows San Francisco. */
    overrideCode: number;
    liveCode: number;
    /** Minutes after midnight, -1 when the sky follows the clock. */
    pinnedMinutes: number;
    maintenance: boolean;
    combatPaused: boolean;
    online: number;
    onDuty: number;
    wanted: number;
    jailed: number;
}

/** CityPlayers.Filter* */
export const CityPlayerFilter = { All: 0, Online: 1, Wanted: 2, Jailed: 3 };

/** CityPlayerFlags */
export const CityPlayerFlag = { Wanted: 1, Jailed: 2, OnDuty: 4, Cuffed: 8 };

/** RpCityPlayerActionEvent's action numbers. */
export const CityAction = { Restore: 1, Kill: 2, Summon: 3, GoTo: 4, Release: 5, ClearCharges: 6, AdjustBalance: 7 };

/** CityPlayers.Backpack* */
export const CityBackpackOp = { Give: 1, Remove: 2, SetCount: 3 };

/** CityRooms.Filter* */
export const CityRoomFilter = { All: 0, Turf: 1, Police: 2, Occupied: 3 };

export interface CityPlayerRow
{
    id: number;
    username: string;
    look: string;
    gender: string;
    online: boolean;
    where: string;
    flags: number;
}

export interface CityBackpackEntry
{
    slot: number;
    item: string;
    count: number;
}

export interface CityPlayerCard
{
    id: number;
    username: string;
    look: string;
    gender: string;
    online: boolean;
    where: string;
    health: number;
    healthMax: number;
    energy: number;
    energyMax: number;
    aggression: number;
    openCharges: number;
    jailSecondsLeft: number;
    cuffed: boolean;
    gang: string;
    job: string;
    onDuty: boolean;
    credits: number;
    unlockedSlots: number;
    backpack: CityBackpackEntry[];
}

export interface CityRoomRow
{
    id: number;
    name: string;
    /** 0 unsafe, 1 safe, 2 turf */
    zone: number;
    turfHolder: string;
    jailRoom: boolean;
    arrestPoints: number;
    usersNow: number;
    usersMax: number;
}

export interface CityUniformRank
{
    id: number;
    name: string;
    hasMale: boolean;
    hasFemale: boolean;
}

export interface CityUniformCorp
{
    id: number;
    name: string;
    ranks: CityUniformRank[];
}

/** UniformManager's kinds. */
export const UniformKind = { Rank: 'rank', Prisoner: 'prisoner' };

export class RpCityUniformListParser implements IMessageParser
{
    private _corps: CityUniformCorp[] = [];
    private _prisonerMale = false;
    private _prisonerFemale = false;

    public flush(): boolean
    {
        this._corps = [];
        this._prisonerMale = false;
        this._prisonerFemale = false;

        return true;
    }

    public parse(wrapper: IMessageDataWrapper): boolean
    {
        if(!wrapper) return false;

        let corps = wrapper.readInt();

        while(corps-- > 0)
        {
            const corp: CityUniformCorp = { id: wrapper.readInt(), name: wrapper.readString(), ranks: [] };

            let ranks = wrapper.readInt();

            while(ranks-- > 0) corp.ranks.push({ id: wrapper.readInt(), name: wrapper.readString(), hasMale: wrapper.readBoolean(), hasFemale: wrapper.readBoolean() });

            this._corps.push(corp);
        }

        this._prisonerMale = wrapper.readBoolean();
        this._prisonerFemale = wrapper.readBoolean();

        return true;
    }

    public get corps(): CityUniformCorp[] 
    {
        return this._corps; 
    }
    public get prisonerMale(): boolean 
    {
        return this._prisonerMale; 
    }
    public get prisonerFemale(): boolean 
    {
        return this._prisonerFemale; 
    }
}

export class RpCityUniformFigureParser implements IMessageParser
{
    private _kind = '';
    private _rankId = 0;
    private _gender = 'M';
    private _figure = '';
    private _notice = '';

    public flush(): boolean
    {
        this._kind = '';
        this._rankId = 0;
        this._gender = 'M';
        this._figure = '';
        this._notice = '';

        return true;
    }

    public parse(wrapper: IMessageDataWrapper): boolean
    {
        if(!wrapper) return false;

        this._kind = wrapper.readString();
        this._rankId = wrapper.readInt();
        this._gender = wrapper.readString();
        this._figure = wrapper.readString();
        this._notice = wrapper.readString();

        return true;
    }

    public get kind(): string 
    {
        return this._kind; 
    }
    public get rankId(): number 
    {
        return this._rankId; 
    }
    public get gender(): string 
    {
        return this._gender; 
    }
    public get figure(): string 
    {
        return this._figure; 
    }
    public get notice(): string 
    {
        return this._notice; 
    }
}

export class RpCityWorldStateParser implements IMessageParser
{
    private _state: CityWorldState = null;
    private _notice = '';

    public flush(): boolean
    {
        this._state = null;
        this._notice = '';

        return true;
    }

    public parse(wrapper: IMessageDataWrapper): boolean
    {
        if(!wrapper) return false;

        this._state = {
            overrideCode: wrapper.readInt(),
            liveCode: wrapper.readInt(),
            pinnedMinutes: wrapper.readInt(),
            maintenance: wrapper.readBoolean(),
            combatPaused: wrapper.readBoolean(),
            online: wrapper.readInt(),
            onDuty: wrapper.readInt(),
            wanted: wrapper.readInt(),
            jailed: wrapper.readInt()
        };
        this._notice = wrapper.readString();

        return true;
    }

    public get state(): CityWorldState 
    {
        return this._state; 
    }
    public get notice(): string 
    {
        return this._notice; 
    }
}

export class RpCityEconomyStateParser implements IMessageParser
{
    private _corps: CityEconomyCorp[] = [];
    private _prices: CityServicePrice[] = [];
    private _notice = '';

    public flush(): boolean
    {
        this._corps = [];
        this._prices = [];
        this._notice = '';

        return true;
    }

    public parse(wrapper: IMessageDataWrapper): boolean
    {
        if(!wrapper) return false;

        let corps = wrapper.readInt();

        while(corps-- > 0)
        {
            const corp: CityEconomyCorp = { id: wrapper.readInt(), name: wrapper.readString(), ranks: [], onShift: [] };

            let ranks = wrapper.readInt();

            while(ranks-- > 0) corp.ranks.push({ id: wrapper.readInt(), name: wrapper.readString(), pay: wrapper.readInt() });

            let shifts = wrapper.readInt();

            while(shifts-- > 0) corp.onShift.push({ userId: wrapper.readInt(), username: wrapper.readString(), rankName: wrapper.readString() });

            this._corps.push(corp);
        }

        let prices = wrapper.readInt();

        while(prices-- > 0) this._prices.push({ key: wrapper.readString(), name: wrapper.readString(), corporationId: wrapper.readInt(), price: wrapper.readInt() });

        this._notice = wrapper.readString();

        return true;
    }

    public get corps(): CityEconomyCorp[] 
    {
        return this._corps; 
    }
    public get prices(): CityServicePrice[] 
    {
        return this._prices; 
    }
    public get notice(): string 
    {
        return this._notice; 
    }
}

export class RpCityPanelParser implements IMessageParser
{
    private _capabilities = 0;
    private _items: { key: string, name: string }[] = [];

    public flush(): boolean
    {
        this._capabilities = 0;
        this._items = [];

        return true;
    }

    public parse(wrapper: IMessageDataWrapper): boolean
    {
        if(!wrapper) return false;

        this._capabilities = wrapper.readInt();

        let count = wrapper.readInt();

        while(count-- > 0) this._items.push({ key: wrapper.readString(), name: wrapper.readString() });

        return true;
    }

    public get capabilities(): number 
    {
        return this._capabilities; 
    }
    public get items(): { key: string, name: string }[] 
    {
        return this._items; 
    }
}

export class RpCitySearchResultParser implements IMessageParser
{
    private _rows: CityPlayerRow[] = [];

    public flush(): boolean
    {
        this._rows = [];

        return true;
    }

    public parse(wrapper: IMessageDataWrapper): boolean
    {
        if(!wrapper) return false;

        let count = wrapper.readInt();

        while(count-- > 0)
        {
            this._rows.push({
                id: wrapper.readInt(),
                username: wrapper.readString(),
                look: wrapper.readString(),
                gender: wrapper.readString(),
                online: wrapper.readBoolean(),
                where: wrapper.readString(),
                flags: wrapper.readInt()
            });
        }

        return true;
    }

    public get rows(): CityPlayerRow[] 
    {
        return this._rows; 
    }
}

export class RpCityPlayerCardParser implements IMessageParser
{
    private _card: CityPlayerCard = null;
    private _notice = '';

    public flush(): boolean
    {
        this._card = null;
        this._notice = '';

        return true;
    }

    public parse(wrapper: IMessageDataWrapper): boolean
    {
        if(!wrapper) return false;

        const card: CityPlayerCard = {
            id: wrapper.readInt(),
            username: wrapper.readString(),
            look: wrapper.readString(),
            gender: wrapper.readString(),
            online: wrapper.readBoolean(),
            where: wrapper.readString(),
            health: wrapper.readInt(),
            healthMax: wrapper.readInt(),
            energy: wrapper.readInt(),
            energyMax: wrapper.readInt(),
            aggression: wrapper.readInt(),
            openCharges: wrapper.readInt(),
            jailSecondsLeft: wrapper.readInt(),
            cuffed: wrapper.readBoolean(),
            gang: wrapper.readString(),
            job: wrapper.readString(),
            onDuty: wrapper.readBoolean(),
            credits: wrapper.readInt(),
            unlockedSlots: wrapper.readInt(),
            backpack: []
        };

        let count = wrapper.readInt();

        while(count-- > 0) card.backpack.push({ slot: wrapper.readInt(), item: wrapper.readString(), count: wrapper.readInt() });

        this._card = card;

        if(wrapper.bytesAvailable) this._notice = wrapper.readString();

        return true;
    }

    public get card(): CityPlayerCard 
    {
        return this._card; 
    }
    /** What to tell the staff member about their last change; '' for nothing. */
    public get notice(): string 
    {
        return this._notice; 
    }
}

export class RpCityRoomListParser implements IMessageParser
{
    private _rows: CityRoomRow[] = [];

    public flush(): boolean
    {
        this._rows = [];

        return true;
    }

    public parse(wrapper: IMessageDataWrapper): boolean
    {
        if(!wrapper) return false;

        let count = wrapper.readInt();

        while(count-- > 0)
        {
            this._rows.push({
                id: wrapper.readInt(),
                name: wrapper.readString(),
                zone: wrapper.readInt(),
                turfHolder: wrapper.readString(),
                jailRoom: wrapper.readBoolean(),
                arrestPoints: wrapper.readInt(),
                usersNow: wrapper.readInt(),
                usersMax: wrapper.readInt()
            });
        }

        return true;
    }

    public get rows(): CityRoomRow[] 
    {
        return this._rows; 
    }
}

export class RpCityPanelEvent extends MessageEvent implements IMessageEvent
{
    constructor(callBack: Function) 
    {
        super(callBack, RpCityPanelParser); 
    }
    public getParser(): RpCityPanelParser 
    {
        return this.parser as RpCityPanelParser; 
    }
}

export class RpCitySearchResultEvent extends MessageEvent implements IMessageEvent
{
    constructor(callBack: Function) 
    {
        super(callBack, RpCitySearchResultParser); 
    }
    public getParser(): RpCitySearchResultParser 
    {
        return this.parser as RpCitySearchResultParser; 
    }
}

export class RpCityPlayerCardEvent extends MessageEvent implements IMessageEvent
{
    constructor(callBack: Function) 
    {
        super(callBack, RpCityPlayerCardParser); 
    }
    public getParser(): RpCityPlayerCardParser 
    {
        return this.parser as RpCityPlayerCardParser; 
    }
}

export class RpCityRoomListEvent extends MessageEvent implements IMessageEvent
{
    constructor(callBack: Function) 
    {
        super(callBack, RpCityRoomListParser); 
    }
    public getParser(): RpCityRoomListParser 
    {
        return this.parser as RpCityRoomListParser; 
    }
}

export class RpCityUniformListEvent extends MessageEvent implements IMessageEvent
{
    constructor(callBack: Function) 
    {
        super(callBack, RpCityUniformListParser); 
    }
    public getParser(): RpCityUniformListParser 
    {
        return this.parser as RpCityUniformListParser; 
    }
}

export class RpCityUniformFigureEvent extends MessageEvent implements IMessageEvent
{
    constructor(callBack: Function) 
    {
        super(callBack, RpCityUniformFigureParser); 
    }
    public getParser(): RpCityUniformFigureParser 
    {
        return this.parser as RpCityUniformFigureParser; 
    }
}

export class RpCityWorldStateEvent extends MessageEvent implements IMessageEvent
{
    constructor(callBack: Function) 
    {
        super(callBack, RpCityWorldStateParser); 
    }
    public getParser(): RpCityWorldStateParser 
    {
        return this.parser as RpCityWorldStateParser; 
    }
}

export class RpCityEconomyStateEvent extends MessageEvent implements IMessageEvent
{
    constructor(callBack: Function) 
    {
        super(callBack, RpCityEconomyStateParser); 
    }
    public getParser(): RpCityEconomyStateParser 
    {
        return this.parser as RpCityEconomyStateParser; 
    }
}

class RpCityComposer<T extends unknown[]> implements IMessageComposer<T>
{
    private _data: T;

    constructor(...data: T) 
    {
        this._data = data; 
    }

    public getMessageArray() 
    {
        return this._data; 
    }

    public dispose(): void 
    { }
}

export class RpCityPanelOpenComposer extends RpCityComposer<[]>
{
    constructor() 
    {
        super(); 
    }
}

export class RpCitySearchComposer extends RpCityComposer<[ string, number ]>
{
    constructor(query: string, filter: number) 
    {
        super(query, filter); 
    }
}

export class RpCityPlayerComposer extends RpCityComposer<[ number ]>
{
    constructor(userId: number) 
    {
        super(userId); 
    }
}

export class RpCityPlayerActionComposer extends RpCityComposer<[ number, number, number ]>
{
    constructor(userId: number, action: number, amount: number = 0) 
    {
        super(userId, action, amount); 
    }
}

export class RpCityBackpackComposer extends RpCityComposer<[ number, number, number, string, number ]>
{
    constructor(userId: number, op: number, slot: number, item: string, count: number) 
    {
        super(userId, op, slot, item, count); 
    }
}

export class RpCityRoomsComposer extends RpCityComposer<[ string, number ]>
{
    constructor(query: string, filter: number) 
    {
        super(query, filter); 
    }
}

export class RpCityUniformsComposer extends RpCityComposer<[]>
{
    constructor() 
    {
        super(); 
    }
}

export class RpCityUniformComposer extends RpCityComposer<[ string, number, string ]>
{
    constructor(kind: string, rankId: number, gender: string) 
    {
        super(kind, rankId, gender); 
    }
}

export class RpCityUniformSaveComposer extends RpCityComposer<[ string, number, string, string ]>
{
    constructor(kind: string, rankId: number, gender: string, figure: string) 
    {
        super(kind, rankId, gender, figure); 
    }
}

export class RpCityWorldComposer extends RpCityComposer<[]>
{
    constructor() 
    {
        super(); 
    }
}

export class RpCityWorldSetComposer extends RpCityComposer<[ number, number ]>
{
    constructor(what: number, value: number) 
    {
        super(what, value); 
    }
}

export class RpCityAlertComposer extends RpCityComposer<[ number, string ]>
{
    constructor(target: number, message: string) 
    {
        super(target, message); 
    }
}

export class RpCityEconomyComposer extends RpCityComposer<[]>
{
    constructor() 
    {
        super(); 
    }
}

export class RpCityPaySaveComposer extends RpCityComposer<[ number, number ]>
{
    constructor(rankId: number, pay: number) 
    {
        super(rankId, pay); 
    }
}

export class RpCityPriceSaveComposer extends RpCityComposer<[ string, number ]>
{
    constructor(key: string, price: number) 
    {
        super(key, price); 
    }
}

export class RpCityClockOutComposer extends RpCityComposer<[ number ]>
{
    constructor(userId: number) 
    {
        super(userId); 
    }
}

let registered = false;

export const RegisterRpCityMessages = () =>
{
    if(registered) return;

    const connection = GetConnection();

    if(!connection) return;

    connection.registerMessages({
        events: new Map<number, Function>([
            [ RP_CITY_PANEL, RpCityPanelEvent ],
            [ RP_CITY_SEARCH_RESULT, RpCitySearchResultEvent ],
            [ RP_CITY_PLAYER_CARD, RpCityPlayerCardEvent ],
            [ RP_CITY_ROOM_LIST, RpCityRoomListEvent ],
            [ RP_CITY_UNIFORM_LIST, RpCityUniformListEvent ],
            [ RP_CITY_UNIFORM_FIGURE, RpCityUniformFigureEvent ],
            [ RP_CITY_WORLD_STATE, RpCityWorldStateEvent ],
            [ RP_CITY_ECONOMY_STATE, RpCityEconomyStateEvent ]
        ]),
        composers: new Map<number, Function>([
            [ RP_CITY_PANEL_OPEN, RpCityPanelOpenComposer ],
            [ RP_CITY_SEARCH, RpCitySearchComposer ],
            [ RP_CITY_PLAYER, RpCityPlayerComposer ],
            [ RP_CITY_PLAYER_ACTION, RpCityPlayerActionComposer ],
            [ RP_CITY_BACKPACK, RpCityBackpackComposer ],
            [ RP_CITY_ROOMS, RpCityRoomsComposer ],
            [ RP_CITY_UNIFORMS, RpCityUniformsComposer ],
            [ RP_CITY_UNIFORM, RpCityUniformComposer ],
            [ RP_CITY_UNIFORM_SAVE, RpCityUniformSaveComposer ],
            [ RP_CITY_WORLD, RpCityWorldComposer ],
            [ RP_CITY_WORLD_SET, RpCityWorldSetComposer ],
            [ RP_CITY_ALERT, RpCityAlertComposer ],
            [ RP_CITY_ECONOMY, RpCityEconomyComposer ],
            [ RP_CITY_PAY_SAVE, RpCityPaySaveComposer ],
            [ RP_CITY_PRICE_SAVE, RpCityPriceSaveComposer ],
            [ RP_CITY_CLOCK_OUT, RpCityClockOutComposer ]
        ])
    });

    registered = true;
}
