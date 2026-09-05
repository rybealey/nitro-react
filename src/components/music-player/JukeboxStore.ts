import { useEffect, useState } from 'react';

// The hotel station's state and this player's listening preferences, shared
// by the room panel, the phone's Music app and the one audio engine. A plain
// module store with subscribers (like MacroState) so all three read the same
// truth without prop threading; the engine is the only writer of state.

export interface JukeboxCurrent { videoId: string; title: string; author: string; durationSec: number; startedAtMs: number; queuedBy: string; }
export interface JukeboxQueueEntry { videoId: string; title: string; author: string; queuedBy: string; }

export interface JukeboxState
{
    // this ROOM has a jukebox (the panel shows); the station itself is hotel-wide
    present: boolean;
    current: JukeboxCurrent | null;
    queue: JukeboxQueueEntry[];
}

export interface JukeboxPrefs
{
    // the phone's play/pause: this player's own on/off switch for tuning in
    // from anywhere. Survives closing the phone (and the browser).
    phoneOn: boolean;
    volume: number;
    // the room panel's mute; the phone source ignores it
    muted: boolean;
}

const PHONE_KEY = 'pixelrp.music.phone';
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
    phoneOn: (read(PHONE_KEY) === 'true'),
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

export const SetJukeboxPresent = (present: boolean) =>
{
    if(state.present === present) return;

    state = { ...state, present };
    notify();
}

export const SetJukeboxPhoneOn = (phoneOn: boolean) =>
{
    prefs = { ...prefs, phoneOn };
    write(PHONE_KEY, phoneOn.toString());
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
