import { IMessageComposer, IMessageDataWrapper, IMessageEvent, IMessageParser, MessageEvent } from '@nitrots/nitro-renderer';
import { GetCommunication, GetConnection, SendMessageComposer } from '../nitro';

// PixelRP backpack - a client-source packet, registered at runtime like the
// other rp-* packets. The wire id matches the emulator's Resources/Revisions/1.6.6.json.
const RP_DISCARD_ITEM = 4055; // client -> server: throw away the stack in a carry slot
const RP_STUN_GUN_CHARGE = 4154; // server -> client: the stun gun's shots left, and how many it holds
const RP_VAPE_CHARGE = 4223; // server -> client: the vape's hits left, and how many it holds

// The backpack bin (the emulator's RpDiscardItemEvent): `count` of what sits in
// the slot goes - all of it when the count covers the stack - and the server
// answers with a fresh RpInventory snapshot.
class RpDiscardItemComposer implements IMessageComposer<number[]>
{
    private _data: number[];

    constructor(slot: number, count: number)
    {
        this._data = [ slot, count ];
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

export const SendRpDiscardItem = (slot: number, count: number): void =>
{
    if(!(slot > 0) || !(count > 0)) return;

    SendMessageComposer(new RpDiscardItemComposer(slot, Math.floor(count)));
}

// The stun gun's charge (the emulator's RpStunGunChargeComposer): shots left and
// how many it holds, sent at login, after every shot and when the police locker
// restocks the gun. It belongs to the player, not to an item, so it is kept here
// rather than in the backpack view - the login send can arrive before the view
// exists - and the view draws it as the green bar on a stun gun. The vape's hits
// (RpVapeChargeComposer) come the same way, in the same shape.
class RpChargeParser implements IMessageParser
{
    public left = 0;
    public max = 0;

    public flush(): boolean
    {
        this.left = 0;
        this.max = 0;

        return true;
    }

    public parse(wrapper: IMessageDataWrapper): boolean
    {
        this.left = wrapper.readInt();
        this.max = wrapper.readInt();

        return true;
    }
}

class RpStunGunChargeEvent extends MessageEvent implements IMessageEvent
{
    constructor(callback: Function) { super(callback, RpChargeParser); }
    public getParser(): RpChargeParser { return this.parser as RpChargeParser; }
}

class RpVapeChargeEvent extends MessageEvent implements IMessageEvent
{
    constructor(callback: Function) { super(callback, RpChargeParser); }
    public getParser(): RpChargeParser { return this.parser as RpChargeParser; }
}

export interface ItemCharge { left: number; max: number; }
export type StunGunCharge = ItemCharge;

// Full until the server says otherwise: a gun nobody has fired, or a vape nobody
// has used, is full, and the login send corrects it straight away if it is not.
const createChargeStore = () =>
{
    let charge: ItemCharge = { left: 7, max: 7 };
    const listeners = new Set<() => void>();

    return {
        get: (): ItemCharge => charge,
        subscribe: (listener: () => void): (() => void) =>
        {
            listeners.add(listener);

            return () => { listeners.delete(listener); };
        },
        set: (left: number, max: number): void =>
        {
            charge = { left, max };
            listeners.forEach(listener => listener());
        }
    };
}

const stunGunCharge = createChargeStore();
const vapeCharge = createChargeStore();

export const GetStunGunCharge = stunGunCharge.get;
export const SubscribeStunGunCharge = stunGunCharge.subscribe;
export const GetVapeCharge = vapeCharge.get;
export const SubscribeVapeCharge = vapeCharge.subscribe;

let registered = false;

export const RegisterRpInventoryMessages = () =>
{
    if(registered) return;

    const connection = GetConnection();

    if(!connection) return;

    connection.registerMessages({
        events: new Map<number, Function>([ [ RP_STUN_GUN_CHARGE, RpStunGunChargeEvent ], [ RP_VAPE_CHARGE, RpVapeChargeEvent ] ]),
        composers: new Map<number, Function>([ [ RP_DISCARD_ITEM, RpDiscardItemComposer ] ])
    });

    GetCommunication().registerMessageEvent(new RpStunGunChargeEvent((event: RpStunGunChargeEvent) =>
    {
        const parser = event.getParser();

        stunGunCharge.set(parser.left, parser.max);
    }));

    GetCommunication().registerMessageEvent(new RpVapeChargeEvent((event: RpVapeChargeEvent) =>
    {
        const parser = event.getParser();

        vapeCharge.set(parser.left, parser.max);
    }));

    registered = true;
}
