import { FC } from 'react';
import { NotifyApp } from '../../api/rp-phone/RpNotificationMessages';
import { NotifyAppPlate } from './PhoneNotificationsView';
import { PhoneIcon } from './PhoneIcon';
import { PhoneNotify, usePhonePrefs } from './usePhone';

// Notifications sub-screen (reached from Settings): the master switch, then a
// row per app, then the two triggers that deserve their own say - event
// reminders, and friends coming and going.
//
// Turning an app off stops its banners AND its badge: a number nobody can see
// the reason for is worse than no number.

interface PhoneNotifySettingsViewProps
{
    onBack: () => void;
}

// The six apps that notify, in the order they read best - the ones about
// people first.
const APP_ROWS: { app: NotifyApp, key: keyof PhoneNotify, label: string, sub: string }[] = [
    { app: 'messages', key: 'messages', label: 'Messages', sub: 'New direct messages.' },
    { app: 'contacts', key: 'contacts', label: 'Contacts', sub: 'Friend requests.' },
    { app: 'calendar', key: 'calendar', label: 'Calendar', sub: 'New, changed and cancelled events.' },
    { app: 'notes', key: 'notes', label: 'Notes', sub: 'Notes shared with you and their edits.' },
    { app: 'photos', key: 'photos', label: 'Photos', sub: 'Shared album invites and new photos.' },
    { app: 'news', key: 'news', label: 'News', sub: 'Stories as they are posted.' }
];

export const PhoneNotifySettingsView: FC<PhoneNotifySettingsViewProps> = props =>
{
    const { onBack = null } = props;
    const { notify, setNotify } = usePhonePrefs();

    const toggle = (key: keyof PhoneNotify) => setNotify({ [key]: !notify[key] } as Partial<PhoneNotify>);

    const switchFor = (key: keyof PhoneNotify) => (
        <div className={ `phone-settings-switch${ notify[key] ? ' is-on' : '' }` }>
            <div className="phone-settings-switch-knob" />
        </div>
    );

    // A row carrying a title and the line under it, like Appearance's.
    const wideRow = (key: keyof PhoneNotify, title: string, sub: string) => (
        <div className="phone-settings-row phone-tap" onClick={ event => toggle(key) }>
            <div className="phone-settings-row-body">
                <div className="phone-settings-row-title">{ title }</div>
                <div className="phone-settings-row-sub">{ sub }</div>
            </div>
            { switchFor(key) }
        </div>
    );

    return (
        <div className="phone-screen phone-app-screen phone-settings phone-notify-settings">
            <div className="phone-app-scroll">
                <div className="phone-app-header">
                    <div className="phone-app-header-lead">
                        <div className="phone-tap phone-thread-back" onClick={ event => (onBack && onBack()) }>
                            <PhoneIcon icon="chevron-left" size={ 24 } />
                        </div>
                        <div>
                            <div className="phone-app-kicker">SETTINGS</div>
                            <div className="phone-app-title">Notifications</div>
                        </div>
                    </div>
                </div>
                <div className="phone-settings-list">
                    <div>
                        <div className="phone-settings-card">
                            { wideRow('allow', 'Allow notifications', 'Banners appear at the top of the phone screen.') }
                        </div>
                    </div>
                    <div className={ notify.allow ? undefined : 'phone-notify-settings-off' }>
                        <div className="phone-section-label">Apps</div>
                        <div className="phone-settings-card">
                            { APP_ROWS.map(row => (
                                <div key={ row.key } className="phone-settings-item phone-tap" onClick={ event => toggle(row.key) }>
                                    <NotifyAppPlate app={ row.app } size={ 28 } />
                                    <div className="phone-settings-row-body">
                                        <div className="phone-settings-item-label">{ row.label }</div>
                                        <div className="phone-settings-row-sub">{ row.sub }</div>
                                    </div>
                                    { switchFor(row.key) }
                                </div>
                            )) }
                        </div>
                    </div>
                    <div className={ notify.allow ? undefined : 'phone-notify-settings-off' }>
                        <div className="phone-section-label">Fine tuning</div>
                        <div className="phone-settings-card">
                            { wideRow('reminders', 'Event reminders', 'Ten minutes before an event starts.') }
                            { wideRow('friends', 'Friends coming online', 'A banner when a friend logs in or out. Never badges.') }
                        </div>
                    </div>
                </div>
                <div className="phone-settings-footnote">Airplane mode silences every banner. Badges keep counting, so nothing is lost while you are away.</div>
                <div className="phone-scroll-spacer" />
            </div>
        </div>
    );
}
