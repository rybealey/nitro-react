import { NitroLogger } from '@nitrots/nitro-renderer';
import { Dispatch, SetStateAction, useEffect, useState } from 'react';
import { GetLocalStorage, SetLocalStorage } from '../api';
import { IsAccountPrefKey, OnAccountPrefsLoaded } from '../api/prefs/AccountPrefs';

const useLocalStorageState = <T>(key: string, initialValue: T): [ T, Dispatch<SetStateAction<T>>] =>
{
    const [ storedValue, setStoredValue ] = useState<T>(() =>
    {
        if(typeof window === 'undefined') return initialValue;

        try
        {
            const item = GetLocalStorage<T>(key);

            return item ?? initialValue;
        }

        catch(error)
        {
            return initialValue;
        }
    });

    // pixelrp: a key the account keeps reads again once the account's copy
    // has arrived at login (AccountPrefs).
    useEffect(() =>
    {
        if(!IsAccountPrefKey(key)) return;

        return OnAccountPrefsLoaded(() => setStoredValue(GetLocalStorage<T>(key) ?? initialValue));
    }, [ key ]);

    const setValue = (value: T) =>
    {
        try
        {
            const valueToStore = value instanceof Function ? value(storedValue) : value;

            setStoredValue(valueToStore);

            if(typeof window !== 'undefined') SetLocalStorage(key, valueToStore);
        }

        catch(error)
        {
            NitroLogger.error(error);
        }
    }

    return [ storedValue, setValue ];
}

export const useLocalStorage = useLocalStorageState;
