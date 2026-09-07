import { FC } from 'react';
import { PhoneIcon } from './PhoneIcon';
import { PhoneAccess, TEXT_SIZE_NAMES, usePhonePrefs } from './usePhone';

// Accessibility sub-screen (reached from Settings): a live preview, then
// Vision (Text Size slider, Bold Text, Increase Contrast, Reduce
// Transparency, Switch Labels) and Motion (Reduce Motion). Everything applies
// to the phone at once via classes and a text-scale variable on the display.

interface PhoneAccessibilityViewProps
{
    onBack: () => void;
}

export const PhoneAccessibilityView: FC<PhoneAccessibilityViewProps> = props =>
{
    const { onBack = null } = props;
    const { access, setAccess } = usePhonePrefs();

    const toggle = (key: keyof PhoneAccess) => setAccess({ [key]: !access[key] } as Partial<PhoneAccess>);

    const row = (icon: string, iconBg: string, label: string, control: JSX.Element, onTap: () => void = null) =>
    {
        return (
            <div className={ `phone-settings-item${ onTap ? ' phone-tap' : '' }` } onClick={ event => (onTap && onTap()) }>
                <div className="phone-settings-icon" style={ { background: iconBg } }>
                    <PhoneIcon icon={ icon } size={ 17 } />
                </div>
                <div className="phone-settings-item-label">{ label }</div>
                { control }
            </div>
        );
    }

    const switchFor = (key: keyof PhoneAccess) =>
    {
        const on = !!access[key];

        return (
            <div className={ `phone-settings-switch${ on ? ' is-on' : '' }` }>
                <div className="phone-settings-switch-knob" />
            </div>
        );
    }

    return (
        <div className="phone-screen phone-app-screen phone-settings phone-access">
            <div className="phone-app-scroll">
                <div className="phone-app-header">
                    <div className="phone-app-header-lead">
                        <div className="phone-tap phone-thread-back" onClick={ event => (onBack && onBack()) }>
                            <PhoneIcon icon="chevron-left" size={ 24 } />
                        </div>
                        <div>
                            <div className="phone-app-kicker">SETTINGS</div>
                            <div className="phone-app-title">Accessibility</div>
                        </div>
                    </div>
                </div>
                <div className="phone-settings-list">
                    <div>
                        <div className="phone-section-label">Preview</div>
                        <div className="phone-settings-card">
                            <div className="phone-access-preview">
                                <div className="phone-access-preview-row">
                                    <div className="phone-access-preview-head" />
                                    <div className="phone-access-preview-body">
                                        <div className="phone-access-preview-line"><span className="phone-access-preview-name">Jeen</span><span className="phone-access-preview-time">14:02</span></div>
                                        <div className="phone-access-preview-text">Meet at the arcade after the shift?</div>
                                    </div>
                                </div>
                                <div className="phone-access-preview-switchrow">
                                    <span>This is how your phone will read</span>
                                    <div className="phone-settings-switch is-on"><div className="phone-settings-switch-knob" /></div>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div>
                        <div className="phone-section-label">Vision</div>
                        <div className="phone-settings-card">
                            { row('text-size', '#3f8fbf', 'Text Size', <span className="phone-settings-item-value">{ TEXT_SIZE_NAMES[access.textSize] }</span>) }
                            <div className="phone-access-slider">
                                <span className="phone-access-slider-small">A</span>
                                <input type="range" min={ 0 } max={ TEXT_SIZE_NAMES.length - 1 } step={ 1 } value={ access.textSize } aria-label="Text size" onChange={ event => setAccess({ textSize: parseInt(event.target.value) }) } />
                                <span className="phone-access-slider-large">A</span>
                            </div>
                            { row('bold', '#6e6e73', 'Bold Text', switchFor('bold'), () => toggle('bold')) }
                            { row('circle-half-stroke', '#1a1a1e', 'Increase Contrast', switchFor('contrast'), () => toggle('contrast')) }
                            { row('square-dashed', '#2ba88f', 'Reduce Transparency', switchFor('opaque'), () => toggle('opaque')) }
                            { row('toggle-on', '#f0954a', 'Switch Labels', switchFor('switchLabels'), () => toggle('switchLabels')) }
                        </div>
                    </div>
                    <div>
                        <div className="phone-section-label">Motion</div>
                        <div className="phone-settings-card">
                            { row('wave-pulse', '#e93a7d', 'Reduce Motion', switchFor('reduceMotion'), () => toggle('reduceMotion')) }
                        </div>
                    </div>
                </div>
                <div className="phone-settings-footnote">These change your phone only, and follow you like Appearance does.</div>
                <div className="phone-scroll-spacer" />
            </div>
        </div>
    );
}
