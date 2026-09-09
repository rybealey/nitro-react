import { IMessageComposer, IMessageDataWrapper, IMessageEvent, IMessageParser, MessageEvent } from '@nitrots/nitro-renderer';
import { GetCommunication, GetConnection, SendMessageComposer } from '../nitro';

// PixelRP regions - client-source packets, registered at runtime like the
// gang, corp and phone packets. Wire ids match the emulator's
// Resources/Revisions/1.6.6.json.
//
// A region is the rough part of the world a player plays from. It is set in
// the phone's Settings > General and shown on their profile beside the motto,
// which is why it lives on the user row server-side rather than in the phone's
// own private state: other people have to be able to read it.

// server -> client, at login and whenever someone's region changes
const RP_USER_REGION = 3916;
// client -> server
const RP_SET_REGION = 3911;
const RP_GET_USER_REGION = 3914;

export type RpRegionCode = 'na' | 'eu' | 'oc' | '';

export interface RpRegionOption
{
    code: RpRegionCode;
    label: string;
    // when that region's players are actually around, in hotel time - the
    // hotel's clock is San Francisco for everyone (see HotelTime.ts), so this
    // is the only phrasing that means the same thing to every reader
    window: string;
}

// Order is the order the picker shows them: down the hotel clock, earliest
// first, rather than alphabetically or by size.
export const RP_REGIONS: RpRegionOption[] = [
    { code: 'oc', label: 'Oceania', window: 'Busiest 1am – 5am hotel time' },
    { code: 'eu', label: 'Europe', window: 'Busiest 10am – 3pm hotel time' },
    { code: 'na', label: 'North America', window: 'Busiest 4pm – 11pm hotel time' }
];

export const RpRegionLabel = (code: RpRegionCode | string): string =>
    (RP_REGIONS.find(region => (region.code === code))?.label ?? '');

export class RpUserRegionParser implements IMessageParser
{
    private _userId: number = 0;
    private _region: string = '';

    public flush(): boolean
    {
        this._userId = 0;
        this._region = '';

        return true;
    }

    public parse(wrapper: IMessageDataWrapper): boolean
    {
        if(!wrapper) return false;

        this._userId = wrapper.readInt();
        this._region = wrapper.readString();

        return true;
    }

    public get userId(): number { return this._userId; }
    public get region(): string { return this._region; }
}

export class RpUserRegionEvent extends MessageEvent implements IMessageEvent
{
    constructor(callBack: Function)
    {
        super(callBack, RpUserRegionParser);
    }

    public getParser(): RpUserRegionParser
    {
        return this.parser as RpUserRegionParser;
    }
}

// The constructor arguments ARE the wire payload, in order.
class RpRegionComposer implements IMessageComposer<(string | number)[]>
{
    private _data: (string | number)[];

    constructor(...data: (string | number)[]) { this._data = data; }

    public getMessageArray() { return this._data; }

    public dispose(): void { return; }
}

export class RpSetRegionComposer extends RpRegionComposer
{
    constructor(region: RpRegionCode) { super(region); }
}

export class RpGetUserRegionComposer extends RpRegionComposer
{
    constructor(userId: number) { super(userId); }
}

// ---- the registry -------------------------------------------------------
// Keyed by user id, exactly like the employment cache: the login push seeds
// the player's own, a profile open asks for whoever it is showing, and a
// change broadcasts to the room. A module singleton rather than a hook because
// the login push lands before any of the views that read it have mounted.

const regionByUserId: Map<number, RpRegionCode> = new Map();
const asked: Set<number> = new Set();
const listeners = new Set<() => void>();

export const GetRpRegion = (userId: number): RpRegionCode => (regionByUserId.get(userId) ?? '');

// undefined until the server has answered for this id - which is what lets a
// profile show nothing rather than flashing "no region" while it waits.
export const HasRpRegion = (userId: number): boolean => regionByUserId.has(userId);

export const SubscribeRpRegion = (listener: () => void): (() => void) =>
{
    listeners.add(listener);

    return () => listeners.delete(listener);
}

// Asked at most once per id per session; a later broadcast updates the cache
// on its own.
export const RequestRpRegion = (userId: number): void =>
{
    if(!userId || asked.has(userId)) return;

    asked.add(userId);

    SendMessageComposer(new RpGetUserRegionComposer(userId));
}

export const SetOwnRpRegion = (region: RpRegionCode): void =>
    SendMessageComposer(new RpSetRegionComposer(region));

const onUserRegion = (event: RpUserRegionEvent) =>
{
    const parser = event.getParser();

    if(!parser || !parser.userId) return;

    regionByUserId.set(parser.userId, (parser.region as RpRegionCode));
    asked.add(parser.userId);

    listeners.forEach(listener => listener());
}

let registered = false;

export const RegisterRpRegionMessages = () =>
{
    if(registered) return;

    const connection = GetConnection();

    if(!connection) return;

    connection.registerMessages({
        events: new Map<number, Function>([ [ RP_USER_REGION, RpUserRegionEvent ] ]),
        composers: new Map<number, Function>([
            [ RP_SET_REGION, RpSetRegionComposer ],
            [ RP_GET_USER_REGION, RpGetUserRegionComposer ]
        ])
    });

    GetCommunication().registerMessageEvent(new RpUserRegionEvent(onUserRegion));

    registered = true;
}
