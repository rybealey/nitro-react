import { FC } from 'react';
import { SetCelsius, SetClock24, useUnitsPrefs } from '../../api/prefs/UnitsStore';
import { PhoneIcon } from './PhoneIcon';

// Settings > General: the clock format and the temperature unit, as two-way
// pills. Both are this player's own and only change how the phone writes
// times and temperatures.

interface PhoneGeneralViewProps
{
    onBack: () => void;
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
    const { onBack = null } = props;
    const { clock24, celsius } = useUnitsPrefs();

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
                        <div className="phone-section-label">Time and units</div>
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
                </div>
                <div className="phone-settings-footnote">The clock applies to the status bar, Calendar, News and Weather. Temperature applies to Weather and the sky behind rooms. Both are yours alone.</div>
                <div className="phone-scroll-spacer" />
            </div>
        </div>
    );
}
