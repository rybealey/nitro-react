import { IMessageComposer } from '@nitrots/nitro-renderer';
import { GetConnection, SendMessageComposer } from '../nitro';

// PixelRP backpack - a client-source packet, registered at runtime like the
// other rp-* packets. The wire id matches the emulator's Resources/Revisions/1.6.6.json.
const RP_DISCARD_ITEM = 4055; // client -> server: throw away the stack in a carry slot

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

let registered = false;

export const RegisterRpInventoryMessages = () =>
{
    if(registered) return;

    const connection = GetConnection();

    if(!connection) return;

    connection.registerMessages({
        events: new Map<number, Function>(),
        composers: new Map<number, Function>([ [ RP_DISCARD_ITEM, RpDiscardItemComposer ] ])
    });

    registered = true;
}
