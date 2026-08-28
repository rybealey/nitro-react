import { FC } from 'react';
import { PhoneIcon } from './PhoneIcon';
import { usePhonePrefs, usePhoneTheme } from './usePhone';

// Appearance sub-screen (reached from Settings): two live phone-screen
// previews plus a Light / Dark / Automatic option list. Automatic follows
// the device's prefers-color-scheme; only the phone UI themes.

interface PhoneAppearanceViewProps
{
    onBack: () => void;
}

export const PhoneAppearanceView: FC<PhoneAppearanceViewProps> = props =>
{
    const { onBack = null } = props;
    const { theme, setTheme } = usePhonePrefs();
    const { resolvedDark = false, systemDark = false } = usePhoneTheme();

    const isAuto = (theme === 'auto');

    // A preview shows as "chosen" when it's the pinned mode, or - under
    // Automatic - the mode the system currently resolves to.
    const lightChosen = (isAuto ? !resolvedDark : (theme === 'light'));
    const darkChosen = (isAuto ? resolvedDark : (theme === 'dark'));

    const preview = (dark: boolean, label: string, chosen: boolean) =>
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

    const option = (icon: string, label: string, chosen: boolean, onTap: () => void) =>
    {
        return (
            <div className="phone-tap phone-appearance-option" onClick={ event => onTap() }>
                <PhoneIcon icon={ icon } size={ 19 } />
                <span>{ label }</span>
                { chosen &&
                    <PhoneIcon icon="check" size={ 20 } className="phone-appearance-check" /> }
            </div>
        );
    }

    return (
        <div className="phone-screen phone-app-screen phone-settings phone-appearance">
            <div className="phone-app-scroll">
                <div className="phone-app-header">
                    <div className="phone-app-header-lead">
                        <div className="phone-tap phone-thread-back" onClick={ event => (onBack && onBack()) }>
                            <PhoneIcon icon="chevron-left" size={ 24 } />
                        </div>
                        <div>
                            <div className="phone-app-kicker">DISPLAY</div>
                            <div className="phone-app-title">Appearance</div>
                        </div>
                    </div>
                </div>
                <div className="phone-settings-list">
                    <div className="phone-settings-card">
                        <div className="phone-settings-appearance">
                            { preview(false, 'Light', lightChosen) }
                            { preview(true, 'Dark', darkChosen) }
                        </div>
                    </div>
                    <div className="phone-settings-card">
                        { option('sun', 'Light', (theme === 'light'), () => setTheme('light')) }
                        { option('moon', 'Dark', (theme === 'dark'), () => setTheme('dark')) }
                        { option('clock', 'Automatic', isAuto, () => setTheme('auto')) }
                    </div>
                </div>
                <div className="phone-settings-footnote">{ isAuto ? `Automatic follows your device - ${ systemDark ? 'dark' : 'light' } right now.` : 'Appearance only changes your phone - the rest of the hotel stays as it is.' }</div>
                <div className="phone-scroll-spacer" />
            </div>
        </div>
    );
}
