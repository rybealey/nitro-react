import { FC, useEffect, useState } from 'react';
import { GetSessionDataManager } from '../../api';
import { SetCelsius, useUnitsPrefs } from '../../api/prefs/UnitsStore';
import { GetRpRegion, RpRegionLabel, SubscribeRpRegion } from '../../api/rp-region/RpRegionMessages';
import { PhoneIcon } from './PhoneIcon';

// Settings > General: the player's region, then the clock format and the
// temperature unit as two-way pills. The clock and the unit are this player's
// own and only change how the phone writes times and temperatures; the region
// is the one thing here other people see, which is why it sits apart at the
// top with its own note rather than in with them.

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
    const { celsius } = useUnitsPrefs();
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
                        { /* pixelrp: the 12/24-hour clock moved to the main Settings >
                             General (Twist, 2026-10-18); only Temperature is left here. */ }
                        <div className="phone-section-label">UNITS</div>
                        <div className="phone-settings-card">
                            <div className="phone-settings-item">
                                <div className="phone-settings-icon" style={ { background: '#f0954a' } }>
                                    <PhoneIcon icon="temperature-half" size={ 17 } />
                                </div>
                                <div className="phone-settings-item-label">Temperature</div>
                                <Segmented options={ [ '°F', '°C' ] } picked={ celsius ? 1 : 0 } onPick={ index => SetCelsius(index === 1) } />
                            </div>
                        </div>
                    </div>
                </div>
                <div className="phone-settings-footnote">Temperature applies to Weather and the sky behind rooms. It's yours alone. The 12/24-hour clock is in the game's Settings, under General.</div>
                <div className="phone-scroll-spacer" />
            </div>
        </div>
    );
}
