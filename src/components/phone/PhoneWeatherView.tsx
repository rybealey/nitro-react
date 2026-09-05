import { FC, useEffect, useMemo, useRef, useState } from 'react';
import { SendMessageComposer } from '../../api';
import { RpGetWeatherComposer, RpWeatherEvent, WeatherDay, WeatherHour, WeatherSnapshot } from '../../api/rp-phone/RpWeatherMessages';
import { useMessageEvent } from '../../hooks';
import { PhoneIcon } from './PhoneIcon';

// Weather app: the real San Francisco's real weather, on the phone. The
// server pulls Open-Meteo every ten minutes and pushes one snapshot to
// everyone, so the whole hotel sees the same sky. This view only paints:
// the sky is the condition, the hero is the number, then the hourly strip,
// the 10-day list with comparable range bars, and six detail tiles. Scrolling
// collapses the hero into a compact header.

interface PhoneWeatherViewProps
{
    onBack: () => void;
}

type Sky = 'clear' | 'night' | 'cloudy' | 'cloudy-night' | 'fog' | 'rain' | 'snow';
type Kind = 'clear' | 'partly' | 'cloud' | 'fog' | 'drizzle' | 'rain' | 'heavy' | 'snow' | 'showers' | 'storm';

const COMPACT_AT = 150;

// WMO weather codes -> what we call them
const kindOf = (code: number): Kind =>
{
    if(code <= 1) return 'clear';
    if(code === 2) return 'partly';
    if(code === 3) return 'cloud';
    if((code === 45) || (code === 48)) return 'fog';
    if((code >= 51) && (code <= 57)) return 'drizzle';
    if((code === 65) || (code === 67)) return 'heavy';
    if((code >= 61) && (code <= 67)) return 'rain';
    if((code >= 71) && (code <= 77)) return 'snow';
    if((code >= 80) && (code <= 82)) return 'showers';
    if((code >= 85) && (code <= 86)) return 'snow';
    if(code >= 95) return 'storm';

    return 'cloud';
}

const LABELS: Record<Kind, string> = { clear: 'Clear', partly: 'Partly Cloudy', cloud: 'Cloudy', fog: 'Foggy', drizzle: 'Drizzle', rain: 'Rain', heavy: 'Heavy Rain', snow: 'Snow', showers: 'Showers', storm: 'Thunderstorms' };

const conditionLabel = (code: number, isDay: boolean): string =>
{
    if(code === 0) return isDay ? 'Sunny' : 'Clear';
    if(code === 1) return isDay ? 'Mostly Sunny' : 'Mostly Clear';

    return LABELS[kindOf(code)];
}

// FontAwesome duotone names (PhoneIcon passes unknown names straight through)
const iconFor = (code: number, isDay: boolean): string =>
{
    switch(kindOf(code))
    {
        case 'clear': return isDay ? 'sun' : 'moon';
        case 'partly': return isDay ? 'cloud-sun' : 'cloud-moon';
        case 'cloud': return 'cloud';
        case 'fog': return 'smog';
        case 'drizzle': return 'cloud-drizzle';
        case 'rain': return 'cloud-rain';
        case 'heavy': return 'cloud-showers-heavy';
        case 'showers': return isDay ? 'cloud-sun-rain' : 'cloud-moon-rain';
        case 'snow': return 'snowflake';
        case 'storm': return 'cloud-bolt';
    }
}

const skyFor = (code: number, isDay: boolean): Sky =>
{
    switch(kindOf(code))
    {
        case 'clear':
        case 'partly': return isDay ? 'clear' : 'night';
        case 'cloud': return isDay ? 'cloudy' : 'cloudy-night';
        case 'fog': return 'fog';
        case 'snow': return 'snow';
        default: return 'rain';
    }
}

// a short forecast sentence built from the hourly strip
const summarize = (snapshot: WeatherSnapshot): string =>
{
    const now = kindOf(snapshot.code);
    const group = (kind: Kind): string => ((kind === 'clear') || (kind === 'partly')) ? 'clear' : (((kind === 'fog')) ? 'fog' : ((kind === 'cloud') ? 'cloud' : ((kind === 'snow') ? 'snow' : 'wet')));
    const current = group(now);
    const change = snapshot.hourly.slice(1, 13).find(hour => group(kindOf(hour.code)) !== current);

    const opening: Record<string, string> = { clear: snapshot.isDay ? 'Clear skies' : 'Clear tonight', fog: 'Fog over the city', cloud: 'Cloudy', snow: 'Snow', wet: LABELS[now] };
    const arriving: Record<string, string> = { clear: 'clearing', fog: 'fog rolling in', cloud: 'clouds moving in', snow: 'snow starting', wet: 'rain arriving' };

    let sentence = opening[current];

    if(change) sentence += ` for now, ${ arriving[group(kindOf(change.code))] } around ${ change.label }.`;
    else sentence += (snapshot.isDay ? ' for the rest of the day.' : ' through the night.');

    const wet = snapshot.hourly.slice(0, 12).filter(hour => hour.precip >= 40);

    if(wet.length && (current !== 'wet')) sentence += ` ${ wet[0].precip }% chance of rain by ${ wet[0].label === 'Now' ? 'now' : wet[0].label }.`;
    else sentence += ` Highs near ${ snapshot.hi }°.`;

    return sentence;
}

const uvLabel = (uv: number): string => ((uv < 3) ? 'Low' : ((uv < 6) ? 'Moderate' : ((uv < 8) ? 'High' : ((uv < 11) ? 'Very High' : 'Extreme'))));
const compassPoint = (deg: number): string => [ 'N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW' ][Math.round(((deg % 360) / 45)) % 8];

const agoText = (fetchedAt: number, now: number): string =>
{
    const minutes = Math.floor(Math.max(0, (now / 1000) - fetchedAt) / 60);

    if(minutes < 1) return 'Updated just now';
    if(minutes < 60) return `Updated ${ minutes } min ago`;

    return `Updated ${ Math.floor(minutes / 60) } h ago`;
}

const RangeBar: FC<{ lo: number, hi: number, rangeLo: number, rangeHi: number, now?: number }> = ({ lo, hi, rangeLo, rangeHi, now }) =>
{
    const span = Math.max(1, (rangeHi - rangeLo));
    const left = (((lo - rangeLo) / span) * 100);
    const width = Math.max(4, (((hi - lo) / span) * 100));

    return (
        <div className="phone-weather-bar">
            <div className="phone-weather-bar-fill" style={ { left: `${ left }%`, width: `${ width }%` } } />
            { (now !== undefined) &&
                <div className="phone-weather-bar-now" style={ { left: `${ (((now - rangeLo) / span) * 100) }%` } } /> }
        </div>
    );
}

export const PhoneWeatherView: FC<PhoneWeatherViewProps> = props =>
{
    const { onBack = null } = props;
    const [ snapshot, setSnapshot ] = useState<WeatherSnapshot>(null);
    const [ failures, setFailures ] = useState(0);
    const [ received, setReceived ] = useState(false);
    const [ compact, setCompact ] = useState(false);
    const [ now, setNow ] = useState(() => Date.now());
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() =>
    {
        SendMessageComposer(new RpGetWeatherComposer());

        const interval = window.setInterval(() => setNow(Date.now()), 30000);

        return () => window.clearInterval(interval);
    }, []);

    useMessageEvent<RpWeatherEvent>(RpWeatherEvent, event =>
    {
        const parser = event.getParser();

        setFailures(parser.failures);
        setReceived(true);

        if(parser.snapshot) setSnapshot(parser.snapshot);
    });

    const onScroll = () =>
    {
        if(!scrollRef.current) return;

        setCompact(scrollRef.current.scrollTop > COMPACT_AT);
    }

    const sky: Sky = (snapshot ? skyFor(snapshot.code, snapshot.isDay) : 'cloudy');
    const offline = (failures > 0);
    const condition = (snapshot ? conditionLabel(snapshot.code, snapshot.isDay) : '');
    const summary = useMemo(() => (snapshot ? summarize(snapshot) : ''), [ snapshot ]);

    // the 10-day bars share one scale so they compare, like a real forecast
    const rangeLo = (snapshot ? Math.min(...snapshot.daily.map(day => day.lo)) : 0);
    const rangeHi = (snapshot ? Math.max(...snapshot.daily.map(day => day.hi)) : 1);

    const hourlyStrip = (hours: WeatherHour[]) => (
        <div className="phone-weather-hours">
            { hours.slice(0, 24).map((hour, index) => (
                <div key={ `${ hour.label }-${ index }` } className={ `phone-weather-hour${ (index === 0) ? ' is-now' : '' }` } style={ { animationDelay: `${ Math.min(index, 8) * 35 }ms` } }>
                    <div className="phone-weather-hour-label">{ hour.label }</div>
                    <PhoneIcon icon={ iconFor(hour.code, hour.isDay) } size={ 22 } className="phone-weather-glyph" />
                    { (hour.precip > 0) && (kindOf(hour.code) !== 'clear') &&
                        <div className="phone-weather-hour-precip">{ hour.precip }%</div> }
                    <div className="phone-weather-hour-temp">{ hour.temp }°</div>
                </div>
            )) }
        </div>
    );

    const dayRows = (days: WeatherDay[]) => days.map((day, index) => (
        <div key={ `${ day.label }-${ index }` } className={ `phone-weather-day${ index ? ' has-top' : '' }` } style={ { animationDelay: `${ 120 + Math.min(index, 9) * 30 }ms` } }>
            <div className="phone-weather-day-label">{ day.label }</div>
            <PhoneIcon icon={ iconFor(day.code, true) } size={ 20 } className="phone-weather-glyph" />
            <div className="phone-weather-day-lo">{ day.lo }°</div>
            <RangeBar lo={ day.lo } hi={ day.hi } rangeLo={ rangeLo } rangeHi={ rangeHi } now={ (index === 0) ? snapshot.temp : undefined } />
            <div className="phone-weather-day-hi">{ day.hi }°</div>
        </div>
    ));

    const tile = (icon: string, label: string, value: JSX.Element | string, sub: string, index: number, extra: JSX.Element = null) => (
        <div className="phone-weather-tile" style={ { animationDelay: `${ 200 + index * 40 }ms` } }>
            <div className="phone-weather-kicker"><PhoneIcon icon={ icon } size={ 11 } />{ label }</div>
            <div className="phone-weather-tile-value">{ value }</div>
            { extra }
            <div className="phone-weather-tile-sub">{ sub }</div>
        </div>
    );

    const tiles = (s: WeatherSnapshot) =>
    {
        const uv = (s.uvTenths / 10);
        const visibility = (s.visibilityTenths / 10);

        return (
            <div className="phone-weather-tiles">
                { tile('sun', 'UV index', <>{ Math.round(uv) } <small>{ uvLabel(uv) }</small></>, (uv < 3) ? 'Low for the rest of the day.' : ((uv < 6) ? 'Use sun protection until late afternoon.' : 'Strong sun. Cover up outside.'), 0,
                    <div className="phone-weather-uv"><div className="phone-weather-uv-dot" style={ { left: `${ Math.min(100, (uv / 11) * 100) }%` } } /></div>) }
                { tile('sunset', s.isDay ? 'Sunset' : 'Sunrise', s.isDay ? s.sunset : s.sunrise, s.isDay ? `Sunrise ${ s.sunrise }` : `Sunset ${ s.sunset }`, 1,
                    <svg className="phone-weather-arc" viewBox="0 0 120 34"><path d="M4 30 Q60 -18 116 30" /><line x1="0" y1="30" x2="120" y2="30" /><circle cx={ s.isDay ? 60 : 18 } cy={ s.isDay ? 6 : 24.5 } r="3.5" /></svg>) }
                { tile('wind', 'Wind', <>{ s.wind } <small>mph</small></>, `Gusts to ${ s.gusts } mph, from the ${ compassPoint(s.windDir) }.`, 2,
                    <div className="phone-weather-compass"><span>N</span><PhoneIcon icon="arrow-up" size={ 22 } style={ { transform: `rotate(${ (s.windDir + 180) % 360 }deg)` } } /></div>) }
                { tile('temperature-half', 'Feels like', `${ s.feelsLike }°`, (s.feelsLike < (s.temp - 2)) ? 'The wind is making it feel cooler.' : ((s.feelsLike > (s.temp + 2)) ? 'Humidity is making it feel warmer.' : 'Similar to the actual temperature.'), 3) }
                { tile('droplet', 'Humidity', `${ s.humidity }%`, `Dew point ${ s.dewPoint }° right now.`, 4) }
                { tile('eye', 'Visibility', <>{ visibility >= 10 ? '10+' : visibility.toFixed(visibility < 3 ? 1 : 0) } <small>mi</small></>, (visibility < 3) ? ((kindOf(s.code) === 'fog') ? 'Fog is cutting visibility.' : 'Reduced visibility right now.') : 'Perfectly clear view.', 5) }
            </div>
        );
    }

    const loadingBody = (
        <div className="phone-weather-loading">
            <div className="phone-weather-hero">
                <div className="phone-weather-kicker is-center"><PhoneIcon icon="location-dot" size={ 11 } />SAN FRANCISCO, CA</div>
                <div className="phone-weather-city">San Francisco</div>
                <div className="phone-weather-temp is-empty">--°</div>
                <div className="phone-weather-cond is-soft">{ (received && !snapshot) ? 'Checking the sky…' : 'Checking the sky…' }</div>
            </div>
            <div className="phone-weather-card">
                <div className="phone-weather-shimmer" style={ { width: 220, height: 12 } } />
                <div className="phone-weather-hours is-shimmer">
                    { [ 0, 1, 2, 3, 4, 5 ].map(index => (
                        <div key={ index } className="phone-weather-hour">
                            <div className="phone-weather-shimmer" style={ { width: 26, height: 10 } } />
                            <div className="phone-weather-shimmer" style={ { width: 22, height: 22, borderRadius: '50%' } } />
                            <div className="phone-weather-shimmer" style={ { width: 24, height: 14 } } />
                        </div>
                    )) }
                </div>
            </div>
            <div className="phone-weather-card">
                <div className="phone-weather-shimmer" style={ { width: 90, height: 9 } } />
                { [ 0, 1, 2, 3, 4 ].map(index => (
                    <div key={ index } className={ `phone-weather-day${ index ? ' has-top' : '' } is-shimmer` }>
                        <div className="phone-weather-shimmer" style={ { width: 40, height: 12 } } />
                        <div className="phone-weather-shimmer" style={ { width: 20, height: 20, borderRadius: '50%' } } />
                        <div className="phone-weather-shimmer" style={ { width: 26, height: 12 } } />
                        <div className="phone-weather-shimmer" style={ { flex: 1, height: 4 } } />
                        <div className="phone-weather-shimmer" style={ { width: 26, height: 12 } } />
                    </div>
                )) }
            </div>
        </div>
    );

    return (
        <div className={ `phone-screen phone-app-screen phone-weather sky-${ sky }` }>
            { /* the sky is its own layer so a change of condition crossfades */ }
            <div key={ sky } className={ `phone-weather-sky sky-${ sky }` }>
                { (sky === 'night') && <div className="phone-weather-stars" /> }
            </div>
            <div className={ `phone-weather-top${ compact ? ' is-compact' : '' }` }>
                <div className="phone-tap phone-weather-back" onClick={ event => (onBack && onBack()) }>
                    <PhoneIcon icon="chevron-left" size={ 22 } />
                </div>
                { snapshot &&
                    <div className="phone-weather-compact">
                        <div className="phone-weather-compact-city">San Francisco</div>
                        <div className="phone-weather-compact-cond">{ snapshot.temp }° | { condition }</div>
                    </div> }
                <div className={ `phone-weather-pill${ offline ? ' is-warn' : (snapshot ? '' : ' is-warn') }` }>
                    <span className="phone-weather-pill-dot" />
                    { snapshot ? (offline ? `Offline · ${ snapshot.localTime }` : agoText(snapshot.fetchedAt, now)) : 'Connecting' }
                </div>
            </div>
            <div ref={ scrollRef } className="phone-weather-scroll" onScroll={ onScroll }>
                { offline && snapshot &&
                    <div className="phone-weather-notice">
                        <PhoneIcon icon="triangle-exclamation" size={ 17 } />
                        <div className="phone-weather-notice-text">
                            <b>Can't reach the weather service.</b>
                            <div>Showing the { snapshot.localTime } reading. Retrying every minute.</div>
                        </div>
                    </div> }
                { !snapshot && loadingBody }
                { snapshot &&
                    <div className={ `phone-weather-body${ offline ? ' is-stale' : '' }` }>
                        <div className="phone-weather-hero">
                            <div className="phone-weather-kicker is-center"><PhoneIcon icon="location-dot" size={ 11 } />SAN FRANCISCO, CA</div>
                            <div className="phone-weather-city">San Francisco</div>
                            <div className="phone-weather-temp">{ snapshot.temp }°</div>
                            <div className="phone-weather-cond">{ condition }</div>
                            <div className="phone-weather-hilo">H:{ snapshot.hi }°&nbsp;&nbsp;L:{ snapshot.lo }°</div>
                        </div>
                        <div className="phone-weather-card" style={ { animationDelay: '60ms' } }>
                            <div className="phone-weather-summary">{ summary }</div>
                            { hourlyStrip(snapshot.hourly) }
                        </div>
                        <div className="phone-weather-card" style={ { animationDelay: '120ms' } }>
                            <div className="phone-weather-kicker"><PhoneIcon icon="cloud" size={ 11 } />{ snapshot.daily.length }-day forecast</div>
                            <div className="phone-weather-days">{ dayRows(snapshot.daily) }</div>
                        </div>
                        { tiles(snapshot) }
                        <div className="phone-weather-foot">Real weather from the real San Francisco, refreshed every 10 minutes.</div>
                    </div> }
            </div>
        </div>
    );
}
