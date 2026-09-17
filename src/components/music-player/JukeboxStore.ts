import { useEffect, useState } from 'react';

// The state of THIS ROOM's jukebox and this player's listening preferences, shared
// by the room panel, the phone's Music app and the one audio engine. A plain
// module store with subscribers (like MacroState) so all three read the same
// truth without prop threading; the engine is the only writer of state.

export interface JukeboxCurrent { videoId: string; title: string; author: string; durationSec: number; startedAtMs: number; queuedBy: string; }
export interface JukeboxQueueEntry { videoId: string; title: string; author: string; queuedBy: string; }

export interface JukeboxState
{
    // this room has a jukebox: the panel shows, and there is a station at all
    present: boolean;
    current: JukeboxCurrent | null;
    queue: JukeboxQueueEntry[];
}

export interface JukeboxPrefs
{
    // The phone's play/pause, as a PAUSE: have YOU stopped listening to this
    // room's jukebox. False by default, because a jukebox plays out loud to the
    // room and arriving to silence would be the surprise.
    //
    // It replaces phoneOn, which asked the opposite question - "are you tuning
    // in from elsewhere" - and stopped meaning anything when queues became
    // per-room: there is no elsewhere to tune in from, and `phoneOn || present`
    // was therefore always true, which is why the button did nothing at all.
    // New storage key, so nobody inherits a stale answer to the old question.
    roomPaused: boolean;
    volume: number;
    // the room panel's mute; the phone source ignores it
    muted: boolean;
}

const ROOM_PAUSED_KEY = 'pixelrp.jukebox.roompaused';
const VOLUME_KEY = 'pixelrp.jukebox.volume';
const MUTED_KEY = 'pixelrp.jukebox.muted';

const read = (key: string): string =>
{
    try { return localStorage.getItem(key); }
    catch(e) { return null; }
}

const write = (key: string, value: string) =>
{
    try { localStorage.setItem(key, value); }
    catch(e) { }
}

let state: JukeboxState = { present: false, current: null, queue: [] };
let prefs: JukeboxPrefs = {
    roomPaused: (read(ROOM_PAUSED_KEY) === 'true'),
    volume: (() => { const stored = parseInt(read(VOLUME_KEY)); return isNaN(stored) ? 50 : Math.min(100, Math.max(0, stored)); })(),
    muted: (read(MUTED_KEY) === 'true')
};

const listeners = new Set<() => void>();
const notify = () => listeners.forEach(listener => listener());

export const GetJukeboxState = () => state;
export const GetJukeboxPrefs = () => prefs;

export const SetJukeboxState = (next: JukeboxState) =>
{
    state = next;
    notify();
}

// Kept for a caller that wants to flip only the flag; leaving a room now
// replaces the whole state, because a station belongs to the room you left.
export const SetJukeboxPresent = (present: boolean) =>
{
    if(state.present === present) return;

    state = { ...state, present };
    notify();
}

export const SetJukeboxRoomPaused = (roomPaused: boolean) =>
{
    prefs = { ...prefs, roomPaused };
    write(ROOM_PAUSED_KEY, roomPaused.toString());
    notify();
}

export const SetJukeboxVolume = (volume: number) =>
{
    prefs = { ...prefs, volume };
    write(VOLUME_KEY, volume.toString());
    notify();
}

export const SetJukeboxMuted = (muted: boolean) =>
{
    prefs = { ...prefs, muted };
    write(MUTED_KEY, muted.toString());
    notify();
}

const useSubscription = () =>
{
    const [ , setVersion ] = useState(0);

    useEffect(() =>
    {
        const listener = () => setVersion(value => (value + 1));

        listeners.add(listener);

        return () => { listeners.delete(listener); };
    }, []);
}

export const useJukeboxState = (): JukeboxState =>
{
    useSubscription();

    return state;
}

export const useJukeboxPrefs = (): JukeboxPrefs =>
{
    useSubscription();

    return prefs;
}
