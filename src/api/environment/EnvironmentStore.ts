import { useEffect, useState } from 'react';
import { OnAccountPrefsLoaded, ReadPref, WritePref } from '../prefs/AccountPrefs';
import { WeatherSnapshot } from '../rp-phone/RpWeatherMessages';

// The hotel's weather snapshot (the same one the phone's Weather app shows),
// held once at the app root so the sky behind rooms and the Settings preview
// read the same reading; plus the Environment preferences, kept on the account
// (AccountPrefs) like every setting.

const WEATHER_KEY = 'pixelrp.environment.weather';

let snapshot: WeatherSnapshot = null;
let weatherOn = true;

const load = (): void =>
{
    weatherOn = (ReadPref(WEATHER_KEY) !== 'false');
}

load();

const listeners = new Set<() => void>();
const notify = () => listeners.forEach(listener => listener());

OnAccountPrefsLoaded(() =>
{
    load();
    notify();
});

export const SetWeatherSnapshot = (next: WeatherSnapshot) =>
{
    snapshot = next;
    notify();
}

export const GetWeatherSnapshot = (): WeatherSnapshot => snapshot;

export const SetEnvironmentWeather = (on: boolean) =>
{
    weatherOn = on;

    WritePref(WEATHER_KEY, on ? 'true' : 'false');

    notify();
}

const useEnvironmentTick = () =>
{
    const [ , setTick ] = useState(0);

    useEffect(() =>
    {
        const listener = () => setTick(value => (value + 1));

        listeners.add(listener);

        return () => { listeners.delete(listener); };
    }, []);
}

export const useWeatherSnapshot = (): WeatherSnapshot =>
{
    useEnvironmentTick();

    return snapshot;
}

export const useEnvironmentPrefs = (): { weatherOn: boolean } =>
{
    useEnvironmentTick();

    return { weatherOn };
}
