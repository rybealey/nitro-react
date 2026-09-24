import { IMessageComposer } from '@nitrots/nitro-renderer';
import { GetConnection, SendMessageComposer } from '../nitro';

// PixelRP backpack - a client-source packet, registered at runtime like the
// other rp-* packets. The wire id matches the emulator's Resources/Revisions/1.6.6.json.
const RP_DISCARD_ITEM = 4055; // client -> server: throw away the stack in a carry slot

// The backpack bin (the emulator's RpDiscardItemEvent): the whole stack in the
// slot goes, and the server answers with a fresh RpInventory snapshot.
class RpDiscardItemComposer implements IMessageComposer<number[]>
{
    private _data: number[];

    constructor(slot: number)
    {
        this._data = [ slot ];
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

export const SendRpDiscardItem = (slot: number): void =>
{
    if(!(slot > 0)) return;

    SendMessageComposer(new RpDiscardItemComposer(slot));
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
