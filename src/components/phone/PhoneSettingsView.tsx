import { FC } from 'react';
import { PhoneIcon } from './PhoneIcon';
import { usePhonePrefs, usePhoneTheme } from './usePhone';

// Settings app — Appearance for now, iOS Display & Brightness style: two
// mini phone previews (Light / Dark) plus an Automatic toggle that follows
// the device's prefers-color-scheme. Only the phone UI themes; the hotel
// around it never changes.

interface PhoneSettingsViewProps
{
    onBack: () => void;
}

export const PhoneSettingsView: FC<PhoneSettingsViewProps> = props =>
{
    const { onBack = null } = props;
    const { theme, setTheme } = usePhonePrefs();
    const { resolvedDark = false, systemDark = false } = usePhoneTheme();

    const isAuto = (theme === 'auto');

    // A preview shows as "chosen" when it's the pinned mode, or — under
    // Automatic — the mode the system currently resolves to.
    const lightChosen = (isAuto ? !resolvedDark : (theme === 'light'));
    const darkChosen = (isAuto ? resolvedDark : (theme === 'dark'));

    const previewCard = (dark: boolean, label: string, chosen: boolean) =>
    {
        return (
            <div className="phone-tap phone-settings-appearance-option" onClick={ event => setTheme(dark ? 'dark' : 'light') }>
                <div className={ `phone-settings-preview${ dark ? ' is-dark-preview' : '' }` }>
                    <div className="phone-settings-preview-bar" />
                    <div className="phone-settings-preview-bubble" />
                    <div className="phone-settings-preview-bubble is-mine" />
                    <div className="phone-settings-preview-bubble" />
                </div>
                <div className="phone-settings-preview-label">{ label }</div>
                <div className={ `phone-settings-preview-check${ chosen ? ' is-chosen' : '' }${ (chosen && isAuto) ? ' is-auto' : '' }` }>
                    { chosen && <PhoneIcon icon="check" size={ 12 } /> }
                </div>
            </div>
        );
    }

    return (
        <div className="phone-screen phone-app-screen phone-settings">
            <div className="phone-app-scroll">
                <div className="phone-app-header">
                    <div className="phone-app-header-lead">
                        <div className="phone-tap phone-thread-back" onClick={ event => (onBack && onBack()) }>
                            <PhoneIcon icon="chevron-left" size={ 24 } />
                        </div>
                        <div>
                            <div className="phone-app-kicker">PIXELRP SETTINGS</div>
                            <div className="phone-app-title">Settings</div>
                        </div>
                    </div>
                </div>
                <div className="phone-section-label">APPEARANCE</div>
                <div className="phone-settings-card">
                    <div className="phone-settings-appearance">
                        { previewCard(false, 'Light', lightChosen) }
                        { previewCard(true, 'Dark', darkChosen) }
                    </div>
                    <div className="phone-settings-row">
                        <div className="phone-settings-row-body">
                            <div className="phone-settings-row-title">Automatic</div>
                            <div className="phone-settings-row-sub">{ isAuto ? `Following your device — ${ systemDark ? 'dark' : 'light' } right now` : 'Match your device\'s appearance' }</div>
                        </div>
                        <div className={ `phone-tap phone-settings-switch${ isAuto ? ' is-on' : '' }` } onClick={ event => setTheme(isAuto ? (resolvedDark ? 'dark' : 'light') : 'auto') }>
                            <div className="phone-settings-switch-knob" />
                        </div>
                    </div>
                </div>
                <div className="phone-settings-footnote">Appearance only changes your phone — the rest of the hotel stays as it is.</div>
                <div className="phone-scroll-spacer" />
            </div>
        </div>
    );
}
