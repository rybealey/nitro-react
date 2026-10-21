import { RoomReadyMessageEvent, RpStatsEvent } from '@nitrots/nitro-renderer';
import { GetCommunication } from '../nitro';

// Live RP stats per room unit, keyed by roomIndex: health, energy, aggression,
// passive, and the staff/verified flag. Sent once by the emulator - each
// unit's on room entry, and again on every change.
//
// Listened for from login, not by the player HUD. The HUD unmounts on every
// room change and mounts again only once the new room is built, after the
// room's stats have already arrived - which is why the emulator used to send
// them all again for three seconds after every entry. Here nothing is missed.
export interface RpUnitStats
{
    hp: number;
    hpMax: number;
    energy: number;
    energyMax: number;
    aggro: number;
    passive: boolean;
    staff: boolean;
}

const store: Map<number, RpUnitStats> = new Map();

// A listener is told whose stats changed: a unit's roomIndex, or -1 when the
// whole room's were cleared.
const listeners = new Set<(roomIndex: number) => void>();

const notify = (roomIndex: number) => listeners.forEach(listener => listener(roomIndex));

export const GetRpUnitStats = (roomIndex: number): RpUnitStats => store.get(roomIndex);

// Every roomIndex with stats held - for the pixelrpHud() DevTools check.
export const GetRpStatsIndexes = (): number[] => [ ...store.keys() ];

export const SubscribeRpStats = (listener: (roomIndex: number) => void): (() => void) =>
{
    listeners.add(listener);

    return () => listeners.delete(listener);
}

const onStats = (event: RpStatsEvent) =>
{
    const parser = event.getParser();

    store.set(parser.roomIndex, { hp: parser.health, hpMax: parser.healthMax, energy: parser.energy, energyMax: parser.energyMax, aggro: parser.aggression, passive: parser.passive, staff: parser.staff });

    notify(parser.roomIndex);
}

// RoomReady comes before anything of the room's, its stats included, and a
// room's roomIndexes are its own: the last room's must not bleed into this one.
// Every RoomReady is followed by every unit's stats, a repeated one included.
const onRoomReady = () =>
{
    store.clear();

    notify(-1);
}

let registered = false;

export const RegisterRpStatsStore = () =>
{
    if(registered) return;

    GetCommunication().registerMessageEvent(new RpStatsEvent(onStats));
    GetCommunication().registerMessageEvent(new RoomReadyMessageEvent(onRoomReady));

    registered = true;
}
