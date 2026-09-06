import { WeatherSnapshot } from '../../api/rp-phone/RpWeatherMessages';

// The sky behind rooms: time of day sets the base, the Weather app's
// condition modulates it. Everything here is deliberately DARK - the room
// floor sits around 65% lightness and the sky never rises above ~30%, with
// its only lift at the horizon - so the sky reads as the dark room around
// the game, never as scenery competing with it.

export type SkyKind = 'clear' | 'partly' | 'cloud' | 'fog' | 'wet' | 'snow';

type Rgb = [ number, number, number ];

export interface SkyStops
{
    top: Rgb;
    mid: Rgb;
    bottom: Rgb;
}

export interface SkyLook
{
    kind: SkyKind;
    gradient: string;
    horizon: string;
    // 0 night .. 1 midday, drives stars and the grey palettes' darkness
    daylight: number;
    stars: boolean;
    fog: boolean;
    rain: boolean;
}

const hex = (value: string): Rgb => [ parseInt(value.slice(1, 3), 16), parseInt(value.slice(3, 5), 16), parseInt(value.slice(5, 7), 16) ];
const mix = (a: Rgb, b: Rgb, t: number): Rgb => [ a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t ];
const scale = (a: Rgb, f: number): Rgb => [ a[0] * f, a[1] * f, a[2] * f ];
const css = (a: Rgb): string => `rgb(${ Math.round(a[0]) }, ${ Math.round(a[1]) }, ${ Math.round(a[2]) })`;
const cssA = (a: Rgb, alpha: number): string => `rgba(${ Math.round(a[0]) }, ${ Math.round(a[1]) }, ${ Math.round(a[2]) }, ${ alpha })`;

// clear-sky keyframes by hour (San Francisco time): night, dawn, morning,
// midday, dusk, evening - each with the horizon glow colour and strength
interface Keyframe { hour: number; stops: SkyStops; horizon: Rgb; glow: number; daylight: number; }

const KEYFRAMES: Keyframe[] = [
    { hour: 0, stops: { top: hex('#05070f'), mid: hex('#0a1020'), bottom: hex('#101a30') }, horizon: hex('#5a6eaa'), glow: .14, daylight: 0 },
    { hour: 5, stops: { top: hex('#0d1424'), mid: hex('#1c2438'), bottom: hex('#3a3a4a') }, horizon: hex('#c8785a'), glow: .22, daylight: .15 },
    { hour: 8, stops: { top: hex('#121b2c'), mid: hex('#1c2b44'), bottom: hex('#2c4466') }, horizon: hex('#5a82b4'), glow: .24, daylight: .8 },
    { hour: 13, stops: { top: hex('#141d2e'), mid: hex('#1d2b44'), bottom: hex('#33507a') }, horizon: hex('#5a82b4'), glow: .28, daylight: 1 },
    { hour: 18, stops: { top: hex('#121420'), mid: hex('#2a1c22'), bottom: hex('#5a3418') }, horizon: hex('#e68c3c'), glow: .30, daylight: .5 },
    { hour: 21, stops: { top: hex('#070a14'), mid: hex('#0d1526'), bottom: hex('#182644') }, horizon: hex('#5a6eaa'), glow: .14, daylight: .05 },
    { hour: 24, stops: { top: hex('#05070f'), mid: hex('#0a1020'), bottom: hex('#101a30') }, horizon: hex('#5a6eaa'), glow: .14, daylight: 0 }
];

// condition palettes (their midday look); at night they darken with daylight
const GREYS: Record<Exclude<SkyKind, 'clear' | 'partly'>, { stops: SkyStops, amount: number }> = {
    fog: { stops: { top: hex('#1b1f26'), mid: hex('#262c36'), bottom: hex('#343c48') }, amount: .85 },
    cloud: { stops: { top: hex('#171b22'), mid: hex('#20262f'), bottom: hex('#2a323d') }, amount: .75 },
    wet: { stops: { top: hex('#12161d'), mid: hex('#1a2029'), bottom: hex('#222a35') }, amount: .85 },
    snow: { stops: { top: hex('#1a1e26'), mid: hex('#262c36'), bottom: hex('#3a4250') }, amount: .8 }
};

// WMO weather codes -> the six looks
export const SkyKindOf = (code: number): SkyKind =>
{
    if(code <= 1) return 'clear';
    if(code === 2) return 'partly';
    if(code === 3) return 'cloud';
    if((code === 45) || (code === 48)) return 'fog';
    if(((code >= 71) && (code <= 77)) || ((code >= 85) && (code <= 86))) return 'snow';
    if(code >= 51) return 'wet';

    return 'cloud';
}

// San Francisco's clock, wherever the player sits
export const SanFranciscoMinutes = (now: number): number =>
{
    try
    {
        const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', hour: 'numeric', minute: 'numeric', hour12: false }).formatToParts(new Date(now));
        const hour = parseInt(parts.find(part => part.type === 'hour')?.value ?? '0') % 24;
        const minute = parseInt(parts.find(part => part.type === 'minute')?.value ?? '0');

        return (hour * 60) + minute;
    }
    catch(e)
    {
        const date = new Date(now);

        return (date.getHours() * 60) + date.getMinutes();
    }
}

export const SanFranciscoClock = (now: number): string =>
{
    try
    {
        return new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', hour: 'numeric', minute: '2-digit' }).format(new Date(now));
    }
    catch(e)
    {
        return new Date(now).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    }
}

export const ComputeSky = (snapshot: WeatherSnapshot, now: number): SkyLook =>
{
    const minutes = SanFranciscoMinutes(now);
    const hour = (minutes / 60);

    let a = KEYFRAMES[0];
    let b = KEYFRAMES[KEYFRAMES.length - 1];

    for(let i = 0; i < (KEYFRAMES.length - 1); i++)
    {
        if((hour >= KEYFRAMES[i].hour) && (hour < KEYFRAMES[i + 1].hour))
        {
            a = KEYFRAMES[i];
            b = KEYFRAMES[i + 1];

            break;
        }
    }

    const t = ((hour - a.hour) / Math.max(0.001, (b.hour - a.hour)));
    const daylight = (a.daylight + (b.daylight - a.daylight) * t);

    let stops: SkyStops = { top: mix(a.stops.top, b.stops.top, t), mid: mix(a.stops.mid, b.stops.mid, t), bottom: mix(a.stops.bottom, b.stops.bottom, t) };
    let horizon = mix(a.horizon, b.horizon, t);
    let glow = (a.glow + (b.glow - a.glow) * t);

    const kind: SkyKind = (snapshot ? SkyKindOf(snapshot.code) : 'clear');

    if((kind !== 'clear') && (kind !== 'partly'))
    {
        const grey = GREYS[kind];
        // grey skies get darker at night like everything else
        const night = (0.55 + (0.45 * daylight));
        const target: SkyStops = { top: scale(grey.stops.top, night), mid: scale(grey.stops.mid, night), bottom: scale(grey.stops.bottom, night) };

        stops = { top: mix(stops.top, target.top, grey.amount), mid: mix(stops.mid, target.mid, grey.amount), bottom: mix(stops.bottom, target.bottom, grey.amount) };
        horizon = mix(horizon, hex('#c0c8d4'), .6);
        glow = (glow * .45);
    }
    else if(kind === 'partly')
    {
        const grey = GREYS.cloud;
        const night = (0.55 + (0.45 * daylight));

        stops = { top: mix(stops.top, scale(grey.stops.top, night), .35), mid: mix(stops.mid, scale(grey.stops.mid, night), .35), bottom: mix(stops.bottom, scale(grey.stops.bottom, night), .35) };
        glow = (glow * .8);
    }

    return {
        kind,
        gradient: `linear-gradient(180deg, ${ css(stops.top) } 0%, ${ css(stops.mid) } 52%, ${ css(stops.bottom) } 100%)`,
        // an ellipse that fades out on every side, so the glow has no edge where it meets the sky
        horizon: `radial-gradient(ellipse 60% 50% at 50% 50%, ${ cssA(horizon, glow) } 0%, ${ cssA(horizon, glow * .45) } 45%, rgba(0, 0, 0, 0) 100%)`,
        daylight,
        stars: (((kind === 'clear') || (kind === 'partly')) && (daylight < .3)),
        fog: ((kind === 'fog') || (kind === 'cloud') || (kind === 'snow')),
        rain: (kind === 'wet')
    };
}

export const SkyConditionLabel = (snapshot: WeatherSnapshot): string =>
{
    if(!snapshot) return 'Clear';

    const code = snapshot.code;

    if(code === 0) return snapshot.isDay ? 'Sunny' : 'Clear';
    if(code === 1) return snapshot.isDay ? 'Mostly Sunny' : 'Mostly Clear';
    if(code === 2) return 'Partly Cloudy';
    if(code === 3) return 'Cloudy';
    if((code === 45) || (code === 48)) return 'Foggy';
    if((code >= 51) && (code <= 57)) return 'Drizzle';
    if((code >= 61) && (code <= 67)) return 'Rain';
    if(((code >= 71) && (code <= 77)) || ((code >= 85) && (code <= 86))) return 'Snow';
    if((code >= 80) && (code <= 82)) return 'Showers';
    if(code >= 95) return 'Thunderstorms';

    return 'Cloudy';
}
