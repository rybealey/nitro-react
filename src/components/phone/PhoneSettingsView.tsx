import { FC, ReactNode } from 'react';
import { GetSessionDataManager } from '../../api';
import { PhoneAvatar } from './PhoneAvatar';
import { PhoneIcon } from './PhoneIcon';
import { WallpaperName } from './PhoneWallpapers';
import { useAirplane, usePhonePrefs } from './usePhone';

// Settings app, iOS grouped-list style: a real account row (the player's own
// avatar + name) on top, then the familiar system groups. Every row is a
// visible-but-inert placeholder except Appearance, which opens its own
// sub-screen and drives the phone's live light/dark theme.

interface PhoneSettingsViewProps
{
    onBack: () => void;
    openAppearance: () => void;
    openAccount: () => void;
    openGeneral: () => void;
    openWallpaper: () => void;
    openAccessibility: () => void;
}

export const PhoneSettingsView: FC<PhoneSettingsViewProps> = props =>
{
    const { onBack = null, openAppearance = null, openAccount = null, openGeneral = null, openWallpaper = null, openAccessibility = null } = props;
    const { theme, wallpaper } = usePhonePrefs();
    const { enabled: airplane, setEnabled: setAirplane } = useAirplane();

    const ownId = GetSessionDataManager().userId;
    const ownFigure = GetSessionDataManager().figure;
    const ownName = (GetSessionDataManager().userName || 'You');

    const appearanceLabel = ((theme === 'auto') ? 'Automatic' : ((theme === 'dark') ? 'Dark' : 'Light'));

    // One list row. Inert rows (the placeholders) are greyed and take no tap;
    // live rows get the tap affordance + handler.
    const item = (icon: string, iconBg: string, label: string, options: { value?: string, chevron?: boolean, inert?: boolean, switchOn?: boolean, onTap?: () => void } = {}) =>
    {
        const { value = null, chevron = true, inert = true, switchOn = undefined, onTap = null } = options;

        return (
            <div className={ `phone-settings-item${ inert ? ' is-inert' : ' phone-tap' }` } onClick={ event => (!inert && onTap && onTap()) }>
                <div className="phone-settings-icon" style={ { background: iconBg } }>
                    <PhoneIcon icon={ icon } size={ 17 } />
                </div>
                <div className="phone-settings-item-label">{ label }</div>
                { (value !== null) &&
                    <span className="phone-settings-item-value">{ value }</span> }
                { (switchOn !== undefined) &&
                    <div className={ `phone-settings-switch${ switchOn ? ' is-on' : '' }` }>
                        <div className="phone-settings-switch-knob" />
                    </div> }
                { chevron &&
                    <PhoneIcon icon="chevron-right" size={ 18 } className="phone-settings-chev" /> }
            </div>
        );
    }

    const group = (children: ReactNode) => <div className="phone-settings-card">{ children }</div>;

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
                <div className="phone-settings-list">
                    { group(
                        <div className="phone-settings-account phone-tap" onClick={ event => (openAccount && openAccount()) }>
                            <PhoneAvatar portrait id={ ownId } figure={ ownFigure } size={ 54 } />
                            <div className="phone-settings-account-body">
                                <div className="phone-settings-account-name">{ ownName }</div>
                                <div className="phone-settings-account-sub">PixelRP ID, Wallet & more</div>
                            </div>
                            <PhoneIcon icon="chevron-right" size={ 20 } className="phone-settings-chev" />
                        </div>
                    ) }
                    { group(<>
                        { item('plane-up', '#f0954a', 'Airplane Mode', { chevron: false, inert: false, switchOn: airplane, onTap: () => setAirplane(!airplane) }) }
                    </>) }
                    { group(<>
                        { item('sliders', '#8a8a90', 'General', { inert: false, onTap: () => (openGeneral && openGeneral()) }) }
                        { item('human', '#3f6fbf', 'Accessibility', { inert: false, onTap: () => (openAccessibility && openAccessibility()) }) }
                        { item('sun', '#f0954a', 'Appearance', { value: appearanceLabel, inert: false, onTap: () => (openAppearance && openAppearance()) }) }
                        { item('image', '#2ba88f', 'Wallpaper', { value: WallpaperName(wallpaper), inert: false, onTap: () => (openWallpaper && openWallpaper()) }) }
                    </>) }
                    { group(<>
                        { item('shield', '#e03131', 'Emergency SOS') }
                        { item('lock', '#3f8fbf', 'Privacy & Security') }
                    </>) }
                    { group(<>
                        { item('gamepad', '#e93a7d', 'Game Center') }
                        { item('wallet', '#1a0a14', 'Wallet') }
                    </>) }
                </div>
                <div className="phone-settings-footnote">Placeholder services aside, General, Accessibility, Appearance and Wallpaper are live - they only change your phone.</div>
                <div className="phone-scroll-spacer" />
            </div>
        </div>
    );
}
