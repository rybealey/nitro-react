import { FC, useEffect, useState } from 'react';
import { GetSessionDataManager } from '../../api';
import { FPS_MAX, FPS_MIN, SetMaxFps, useFpsPref } from '../../api/prefs/FpsStore';
import { SetCelsius, SetClock24, useUnitsPrefs } from '../../api/prefs/UnitsStore';
import { GetRpRegion, RpRegionLabel, SubscribeRpRegion } from '../../api/rp-region/RpRegionMessages';
import { PhoneIcon } from './PhoneIcon';

// Settings > General: the player's region, then the clock format and the
// temperature unit as two-way pills. The clock and the unit are this player's
// own and only change how the phone writes times and temperatures; the region
// is the one thing here other people see, which is why it sits apart at the
// top with its own note rather than in with them.
//
// Frame rate sits last because it is about this computer rather than about
// the player - a slider instead of pills, since it is a range and not a
// choice between two named things.

interface PhoneGeneralViewProps
{
    onBack: () => void;
    openRegion: () => void;
}

const Segmented: FC<{ options: [ string, string ], picked: number, onPick: (index: number) => void }> = ({ options, picked, onPick }) => (
    <div className="phone-segmented">
        <div className="phone-segmented-thumb" style={ { transform: `translateX(${ picked * 100 }%)` } } />
        { options.map((option, index) => (
            <div key={ option } className={ `phone-segmented-option phone-tap${ (picked === index) ? ' is-on' : '' }` } onClick={ event => onPick(index) }>{ option }</div>
        )) }
    </div>
);

export const PhoneGeneralView: FC<PhoneGeneralViewProps> = props =>
{
    const { onBack = null, openRegion = null } = props;
    const { clock24, celsius } = useUnitsPrefs();
    const { maxFps } = useFpsPref();
    const ownId = GetSessionDataManager().userId;
    const [ region, setRegion ] = useState<string>(() => GetRpRegion(ownId));

    // Seeded by the login push; re-read whenever the server says it changed.
    useEffect(() => SubscribeRpRegion(() => setRegion(GetRpRegion(ownId))), [ ownId ]);

    return (
        <div className="phone-screen phone-app-screen phone-general">
            <div className="phone-app-scroll">
                <div className="phone-app-header">
                    <div className="phone-app-header-lead">
                        <div className="phone-tap phone-thread-back" onClick={ event => (onBack && onBack()) }>
                            <PhoneIcon icon="chevron-left" size={ 24 } />
                        </div>
                        <div>
                            <div className="phone-app-kicker">SETTINGS</div>
                            <div className="phone-app-title">General</div>
                        </div>
                    </div>
                </div>
                <div className="phone-settings-list">
                    <div>
                        <div className="phone-section-label">REGION</div>
                        <div className="phone-settings-card">
                            <div className="phone-settings-item phone-tap" onClick={ event => (openRegion && openRegion()) }>
                                <div className="phone-settings-icon" style={ { background: '#7a5cc4' } }>
                                    <PhoneIcon icon="globe" size={ 17 } />
                                </div>
                                <div className="phone-settings-item-label">Region</div>
                                <div className="phone-settings-item-value">{ RpRegionLabel(region) || 'Not set' }</div>
                                <PhoneIcon icon="chevron-right" size={ 18 } className="phone-settings-chev" />
                            </div>
                        </div>
                    </div>
                    <div>
                        <div className="phone-section-label">TIME AND UNITS</div>
                        <div className="phone-settings-card">
                            <div className="phone-settings-item">
                                <div className="phone-settings-icon" style={ { background: '#3f8fbf' } }>
                                    <PhoneIcon icon="clock" size={ 17 } />
                                </div>
                                <div className="phone-settings-item-label">Clock</div>
                                <Segmented options={ [ '12-hour', '24-hour' ] } picked={ clock24 ? 1 : 0 } onPick={ index => SetClock24(index === 1) } />
                            </div>
                            <div className="phone-settings-item">
                                <div className="phone-settings-icon" style={ { background: '#f0954a' } }>
                                    <PhoneIcon icon="temperature-half" size={ 17 } />
                                </div>
                                <div className="phone-settings-item-label">Temperature</div>
                                <Segmented options={ [ '°F', '°C' ] } picked={ celsius ? 1 : 0 } onPick={ index => SetCelsius(index === 1) } />
                            </div>
                        </div>
                    </div>
                    <div>
                        <div className="phone-section-label">PERFORMANCE</div>
                        <div className="phone-settings-card">
                            <div className="phone-settings-item">
                                <div className="phone-settings-icon" style={ { background: '#2ba88f' } }>
                                    <PhoneIcon icon="gamepad" size={ 17 } />
                                </div>
                                <div className="phone-settings-item-label">Frame Rate</div>
                                <div className="phone-settings-item-value">{ maxFps } FPS</div>
                            </div>
                            <div className="phone-access-slider phone-fps-slider">
                                <span className="phone-access-slider-small">{ FPS_MIN }</span>
                                <input type="range" min={ FPS_MIN } max={ FPS_MAX } step={ 5 } value={ maxFps } aria-label="Frame rate cap" onChange={ event => SetMaxFps(parseInt(event.target.value)) } />
                                <span className="phone-access-slider-large">{ FPS_MAX }</span>
                            </div>
                        </div>
                    </div>
                </div>
                <div className="phone-settings-footnote">The clock applies to the status bar, Calendar, News and Weather. Temperature applies to Weather and the sky behind rooms. Both are yours alone. Frame rate caps how often the room redraws and is saved on this computer only - your screen sets the real ceiling, so a cap above the refresh rate of your screen will not add frames, but lowering it can help an older machine.</div>
                <div className="phone-scroll-spacer" />
            </div>
        </div>
    );
}
