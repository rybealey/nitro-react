import { FC, useEffect, useState } from 'react';
import { SendMessageComposer } from '../../../api';
import { CityAlertTarget, CityCapability, CityWorldState, CityWorldSwitch, RpCityAlertComposer, RpCityWorldComposer, RpCityWorldSetComposer, RpCityWorldStateEvent } from '../../../api/rp-city/RpCityMessages';
import { useMessageEvent } from '../../../hooks';
import { SanFranciscoMinutes } from '../../environment/SkyModel';
import { CityPanelContext } from '../CityPanelView';

// The City Panel's City tab: things that reach every player at once - the
// hotel alert, the sky over the city, maintenance and the combat switch - and
// a count of who is about. Emulator: CityWorld, WeatherStation.

// WMO codes, as the sky reads them (SkyModel.SkyKindOf).
const SKIES: [ string, number ][] = [
    [ 'Clear', 0 ],
    [ 'Partly', 2 ],
    [ 'Cloud', 3 ],
    [ 'Fog', 45 ],
    [ 'Rain', 61 ],
    [ 'Snow', 71 ]
];

const ALERT_TARGETS: [ string, number, number ][] = [
    [ 'City Alert', CityAlertTarget.Everyone, CityCapability.AlertHotel ],
    [ 'Room Alert', CityAlertTarget.ThisRoom, CityCapability.AlertRoom ]
];

const REFRESH_MS = 15000;
const MAX_ALERT = 500;

const has = (capabilities: number, capability: number) => ((capabilities & capability) === capability);

const clock = (minutes: number) => `${ String(Math.floor(minutes / 60)).padStart(2, '0') }:${ String(minutes % 60).padStart(2, '0') }`;

const skyName = (code: number) =>
{
    const exact = SKIES.find(([ , value ]) => (value === code));

    if(exact) return exact[0];
    if(code < 0) return 'no reading yet';
    if(code <= 1) return 'Clear';
    if(code <= 3) return 'Cloud';
    if((code === 45) || (code === 48)) return 'Fog';
    if((code >= 71) && (code <= 77)) return 'Snow';

    return 'Rain';
}

const Switch: FC<{ on: boolean, label: string, disabled?: boolean, onToggle: () => void }> = ({ on, label, disabled = false, onToggle }) =>
    <button type="button" className={ `mt-switch${ on ? ' is-on' : '' }` } role="switch" aria-checked={ on } aria-label={ label } disabled={ disabled } onClick={ onToggle }><span /></button>;

export const CityWorldView: FC<{ context: CityPanelContext }> = props =>
{
    const { context } = props;
    const [ state, setState ] = useState<CityWorldState>(null);
    const [ notice, setNotice ] = useState('');
    const [ message, setMessage ] = useState('');
    const [ target, setTarget ] = useState(-1);
    const [ minutes, setMinutes ] = useState<number>(null);

    useEffect(() =>
    {
        SendMessageComposer(new RpCityWorldComposer());

        const interval = setInterval(() => SendMessageComposer(new RpCityWorldComposer()), REFRESH_MS);

        return () => clearInterval(interval);
    }, []);

    useMessageEvent<RpCityWorldStateEvent>(RpCityWorldStateEvent, event =>
    {
        const parser = event.getParser();

        setState(parser.state);

        if(parser.notice) setNotice(parser.notice);
    });

    // The first alert target this staff member may use.
    useEffect(() =>
    {
        if(target >= 0) return;

        const first = ALERT_TARGETS.find(([ , , capability ]) => has(context.capabilities, capability));

        if(first) setTarget(first[1]);
    }, [ context.capabilities, target ]);

    const canWorld = has(context.capabilities, CityCapability.World);
    const canHotel = has(context.capabilities, CityCapability.Hotel);
    const following = (!!state && (state.overrideCode < 0) && (state.pinnedMinutes < 0));
    const shownMinutes = (minutes ?? ((state && (state.pinnedMinutes >= 0)) ? state.pinnedMinutes : SanFranciscoMinutes(Date.now())));

    const set = (what: number, value: number) => SendMessageComposer(new RpCityWorldSetComposer(what, value));

    const toggleFollow = () =>
    {
        if(!state) return;

        if(following)
        {
            // Off: hold the sky as it is right now, then change it from there.
            set(CityWorldSwitch.Weather, Math.max(0, state.liveCode));
            set(CityWorldSwitch.Time, SanFranciscoMinutes(Date.now()));

            return;
        }

        set(CityWorldSwitch.Weather, -1);
        set(CityWorldSwitch.Time, -1);
        setMinutes(null);
    }

    const sendAlert = () =>
    {
        const text = message.trim();

        if(!text || (target < 0)) return;

        SendMessageComposer(new RpCityAlertComposer(target, text));
        setMessage('');
    }

    return (
        <div className="city-world">
            { notice && <div className="city-notice" role="status">{ notice }</div> }
            <div className="city-world-grid">
                <section className="mt-card mt-panel">
                    <span className="mt-label">Hotel alert</span>
                    <textarea className="form-control form-control-sm city-alert-text" aria-label="Alert message" rows={ 3 } maxLength={ MAX_ALERT } placeholder="What should everyone hear?" value={ message } onChange={ event => setMessage(event.target.value) } />
                    <div className="mt-seg" role="group" aria-label="Send to">
                        { ALERT_TARGETS.map(([ label, value, capability ]) =>
                            <button key={ value } type="button" className={ `mt-seg-button${ (target === value) ? ' is-on' : '' }` } aria-pressed={ (target === value) } disabled={ !has(context.capabilities, capability) } onClick={ () => setTarget(value) }>{ label }</button>) }
                    </div>
                    <button type="button" className="mt-success" disabled={ !message.trim() || (target < 0) } onClick={ sendAlert }>Send</button>
                </section>
                <section className="mt-card mt-panel">
                    <span className="mt-label">Sky over the city</span>
                    <div className="city-world-line">
                        <div className="city-world-text">
                            <b>Follow San Francisco</b>
                            <span className="mt-muted">Live weather and the city clock{ state ? ` - now ${ skyName(state.liveCode).toLowerCase() }` : '' }.</span>
                        </div>
                        <Switch on={ following } label="Follow San Francisco" disabled={ !canWorld || !state } onToggle={ toggleFollow } />
                    </div>
                    <div className="mt-seg city-seg-6" role="group" aria-label="Hold the weather">
                        { SKIES.map(([ label, code ]) =>
                            <button key={ code } type="button" className={ `mt-seg-button${ (state?.overrideCode === code) ? ' is-on' : '' }` } aria-pressed={ (state?.overrideCode === code) } disabled={ !canWorld } onClick={ () => set(CityWorldSwitch.Weather, code) }>{ label }</button>) }
                    </div>
                    <div className="city-world-time">
                        <div className="city-world-line">
                            <label className="mt-label" htmlFor="city-world-time">Time of day</label>
                            <b className="city-mono">{ clock(shownMinutes) }{ (state && (state.pinnedMinutes < 0) && (minutes === null)) ? ' · live' : '' }</b>
                        </div>
                        <input id="city-world-time" className="city-world-slider" type="range" min={ 0 } max={ 1430 } step={ 10 } value={ shownMinutes } disabled={ !canWorld }
                            onChange={ event => setMinutes(Number(event.target.value)) }
                            onPointerUp={ () => (minutes !== null) && set(CityWorldSwitch.Time, minutes) }
                            onKeyUp={ () => (minutes !== null) && set(CityWorldSwitch.Time, minutes) } />
                        { state && (state.pinnedMinutes >= 0) &&
                            <button type="button" className="mt-ghost mt-small" disabled={ !canWorld } onClick={ () => 
                            {
                                set(CityWorldSwitch.Time, -1); setMinutes(null); 
                            } }>Follow the clock</button> }
                    </div>
                </section>
                <section className="mt-card mt-panel">
                    <span className="mt-label">Right now</span>
                    <div className="mt-chips">
                        <div className="mt-chip"><b>{ state?.online ?? '-' }</b><span>Online</span></div>
                        <div className="mt-chip"><b>{ state?.onDuty ?? '-' }</b><span>On duty</span></div>
                        <div className="mt-chip"><b>{ state?.wanted ?? '-' }</b><span>Wanted</span></div>
                        <div className="mt-chip"><b>{ state?.jailed ?? '-' }</b><span>In jail</span></div>
                    </div>
                </section>
                <section className="mt-card mt-panel">
                    <span className="mt-label">Hotel state</span>
                    <div className="city-world-line">
                        <div className="city-world-text">
                            <b>Maintenance</b>
                            <span className="mt-muted">Only staff can log in. Everyone else is warned, then taken offline a minute later.</span>
                        </div>
                        <Switch on={ !!state?.maintenance } label="Maintenance" disabled={ !canHotel || !state } onToggle={ () => set(CityWorldSwitch.Maintenance, state.maintenance ? 0 : 1) } />
                    </div>
                    <div className="city-world-line">
                        <div className="city-world-text">
                            <b>Combat</b>
                            <span className="mt-muted">Off pauses fighting everywhere, safe zones or not.</span>
                        </div>
                        <Switch on={ !!state && !state.combatPaused } label="Combat" disabled={ !canHotel || !state } onToggle={ () => set(CityWorldSwitch.Combat, state.combatPaused ? 1 : 0) } />
                    </div>
                </section>
            </div>
        </div>
    );
}
