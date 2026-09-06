import { useEffect, useState } from 'react';
import { WeatherSnapshot } from '../rp-phone/RpWeatherMessages';

// The hotel's weather snapshot (the same one the phone's Weather app shows),
// held once at the app root so the sky behind rooms and the Settings preview
// read the same reading; plus the Environment preferences, kept per device
// like the phone's own preferences.

const WEATHER_KEY = 'pixelrp.environment.weather';

let snapshot: WeatherSnapshot = null;
let weatherOn = true;

try
{
    const raw = window.localStorage.getItem(WEATHER_KEY);

    if(raw !== null) weatherOn = (raw !== 'false');
}
catch(e)
{
    // storage blocked: default on for this session
}

const listeners = new Set<() => void>();
const notify = () => listeners.forEach(listener => listener());

export const SetWeatherSnapshot = (next: WeatherSnapshot) =>
{
    snapshot = next;
    notify();
}

export const GetWeatherSnapshot = (): WeatherSnapshot => snapshot;

export const SetEnvironmentWeather = (on: boolean) =>
{
    weatherOn = on;

    try
    {
        window.localStorage.setItem(WEATHER_KEY, on ? 'true' : 'false');
    }
    catch(e)
    {
        // per-session only, then
    }

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
