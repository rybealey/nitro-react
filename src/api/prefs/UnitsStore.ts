import { useEffect, useState } from 'react';
import { OnAccountPrefsLoaded, ReadPref, WritePref } from './AccountPrefs';
import { HotelDate } from './HotelTime';

// Settings > General: how times and temperatures are written. Kept on the
// account (AccountPrefs), like every setting. Defaults: 24-hour, Celsius.
// The server always sends Fahrenheit and 12-hour labels for the weather;
// everything is converted here at the point of display.

const CLOCK_KEY = 'pixelrp.prefs.clock24';
const UNIT_KEY = 'pixelrp.prefs.celsius';

let clock24 = true;
let celsius = true;

const load = (): void =>
{
    clock24 = (ReadPref(CLOCK_KEY) !== 'false');
    celsius = (ReadPref(UNIT_KEY) !== 'false');
}

load();

const listeners = new Set<() => void>();
const notify = () => listeners.forEach(listener => listener());

OnAccountPrefsLoaded(() =>
{
    load();
    notify();
});

const save = (key: string, value: boolean) => WritePref(key, value ? 'true' : 'false');

export const SetClock24 = (on: boolean) =>
{
    clock24 = on;
    save(CLOCK_KEY, on);
    notify();
}

export const SetCelsius = (on: boolean) =>
{
    celsius = on;
    save(UNIT_KEY, on);
    notify();
}

export const useUnitsPrefs = (): { clock24: boolean, celsius: boolean } =>
{
    const [ , setTick ] = useState(0);

    useEffect(() =>
    {
        const listener = () => setTick(value => (value + 1));

        listeners.add(listener);

        return () => { listeners.delete(listener); };
    }, []);

    return { clock24, celsius };
}

// ---- formatting, reading the current preference --------------------------

const pad = (value: number): string => value.toString().padStart(2, '0');

// "22:03" or "10:03 PM"; suffix false gives the status-bar form "10:03".
// Takes a real instant and renders it on the hotel (San Francisco) clock.
export const FormatClock = (instant: Date | number, suffix: boolean = true): string =>
{
    const date = HotelDate(instant);
    const hours = date.getHours();
    const minutes = date.getMinutes();

    if(clock24) return `${ pad(hours) }:${ pad(minutes) }`;

    const twelve = (((hours + 11) % 12) + 1);

    return `${ twelve }:${ pad(minutes) }${ suffix ? ((hours >= 12) ? ' PM' : ' AM') : '' }`;
}

// A time of day given as minutes after midnight - the city's in-game clock
// (GameClock) - in the same form: "19:45" or "7:45 PM".
export const FormatMinutes = (minutes: number, suffix: boolean = true): string =>
{
    const whole = (((Math.floor(minutes) % 1440) + 1440) % 1440);
    const hours = Math.floor(whole / 60);
    const mins = (whole % 60);

    if(clock24) return `${ pad(hours) }:${ pad(mins) }`;

    const twelve = (((hours + 11) % 12) + 1);

    return `${ twelve }:${ pad(mins) }${ suffix ? ((hours >= 12) ? ' PM' : ' AM') : '' }`;
}

// The player's OWN local time, like Chat History - the phone's status bar.
export const FormatLocalClock = (instant: Date | number, suffix: boolean = true): string =>
{
    const date = new Date(instant);
    const hours = date.getHours();
    const minutes = date.getMinutes();

    if(clock24) return `${ pad(hours) }:${ pad(minutes) }`;

    const twelve = (((hours + 11) % 12) + 1);

    return `${ twelve }:${ pad(minutes) }${ suffix ? ((hours >= 12) ? ' PM' : ' AM') : '' }`;
}

// an axis hour 0-24: "15:00" or "3 PM"
export const FormatHour = (hour: number): string =>
{
    const h = (hour % 24);

    if(clock24) return `${ pad(h) }:00`;

    return `${ ((h + 11) % 12) + 1 } ${ (h >= 12) ? 'PM' : 'AM' }`;
}

// the weather's server-side hour label ("3PM", "Now") -> "15:00" in 24-hour
export const FormatHourLabel = (label: string): string =>
{
    if(!clock24) return label;

    const match = /^(\d{1,2})(AM|PM)$/i.exec((label || '').trim());

    if(!match) return label;

    let hour = (parseInt(match[1]) % 12);

    if(match[2].toUpperCase() === 'PM') hour += 12;

    return `${ pad(hour) }:00`;
}

// the weather's server-side clock label ("6:48 AM") -> "06:48" in 24-hour
export const FormatClockLabel = (label: string): string =>
{
    if(!clock24) return label;

    const match = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec((label || '').trim());

    if(!match) return label;

    let hour = (parseInt(match[1]) % 12);

    if(match[3].toUpperCase() === 'PM') hour += 12;

    return `${ pad(hour) }:${ match[2] }`;
}

// the server sends Fahrenheit
export const FormatTemp = (fahrenheit: number): number => (celsius ? Math.round((fahrenheit - 32) * 5 / 9) : fahrenheit);

export const TempUnit = (): string => (celsius ? '°C' : '°F');

// speed and distance follow the temperature choice: metric with Celsius
export const FormatSpeed = (mph: number): number => (celsius ? Math.round(mph * 1.609) : mph);
export const SpeedUnit = (): string => (celsius ? 'km/h' : 'mph');
export const FormatDistance = (miles: number): number => (celsius ? (miles * 1.609) : miles);
export const DistanceUnit = (): string => (celsius ? 'km' : 'mi');
