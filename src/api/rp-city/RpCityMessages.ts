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

/** CityPanelAccess.Capability - what this staff member may do from the panel. */
export const CityCapability = {
    Restore: 1,
    Kill: 2,
    Summon: 4,
    GoTo: 8,
    Justice: 16,
    Balance: 32,
    Backpack: 64
};

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
            [ RP_CITY_ROOM_LIST, RpCityRoomListEvent ]
        ]),
        composers: new Map<number, Function>([
            [ RP_CITY_PANEL_OPEN, RpCityPanelOpenComposer ],
            [ RP_CITY_SEARCH, RpCitySearchComposer ],
            [ RP_CITY_PLAYER, RpCityPlayerComposer ],
            [ RP_CITY_PLAYER_ACTION, RpCityPlayerActionComposer ],
            [ RP_CITY_BACKPACK, RpCityBackpackComposer ],
            [ RP_CITY_ROOMS, RpCityRoomsComposer ]
        ])
    });

    registered = true;
}
