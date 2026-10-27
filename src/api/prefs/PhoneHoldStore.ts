import { useEffect, useState } from 'react';
import { OnAccountPrefsLoaded, ReadPref, WritePref } from './AccountPrefs';

// Settings > General: whether your avatar holds the phone (handitem 244) while
// it is open on screen. Kept on the account (AccountPrefs), like every setting.
// On by default. Off, the phone still opens; the server is simply told it is
// closed, so the hand stays as it was (PhoneView).

const HOLD_KEY = 'pixelrp.prefs.phone.hold';

let holdPhone = true;

const load = (): void =>
{
    holdPhone = (ReadPref(HOLD_KEY) !== 'false');
}

load();

const listeners = new Set<() => void>();
const notify = () => listeners.forEach(listener => listener());

OnAccountPrefsLoaded(() =>
{
    load();
    notify();
});

export const SetHoldPhone = (on: boolean) =>
{
    holdPhone = on;
    WritePref(HOLD_KEY, on ? 'true' : 'false');
    notify();
}

export const useHoldPhonePref = (): { holdPhone: boolean } =>
{
    const [ , setTick ] = useState(0);

    useEffect(() =>
    {
        const listener = () => setTick(value => (value + 1));

        listeners.add(listener);

        return () =>
        {
            listeners.delete(listener);
        };
    }, []);

    return { holdPhone };
}
