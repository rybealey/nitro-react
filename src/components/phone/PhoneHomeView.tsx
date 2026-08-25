import { FC } from 'react';
import { PhoneIcon } from './PhoneIcon';
import { usePhoneBadges } from './usePhone';

// Phone home screen: terrace wallpaper, a 4-wide app grid and the dock.
// Only Messages and Contacts are live apps for now — the rest are visible
// but disabled (grayed out) until their features ship.

interface PhoneApp
{
    key: string;
    icon: string;
    active?: boolean;
}

const GRID_APPS: PhoneApp[] = [
    { key: 'Contacts', icon: 'users', active: true },
    { key: 'Settings', icon: 'sliders' },
    { key: 'Characters', icon: 'user' },
    { key: 'App Store', icon: 'download' },
    { key: 'Mercury', icon: 'dollar' },
    { key: 'Sitch', icon: 'heart' }
];

const DOCK_APPS: PhoneApp[] = [
    { key: 'Messages', icon: 'message', active: true },
    { key: 'Camera', icon: 'camera' },
    { key: 'Gallery', icon: 'image' }
];

interface PhoneHomeViewProps
{
    openApp: (app: string) => void;
}

export const PhoneHomeView: FC<PhoneHomeViewProps> = props =>
{
    const { openApp = null } = props;
    const { unreadMessages = 0, requestCount = 0 } = usePhoneBadges();

    const badgeFor = (app: PhoneApp) =>
    {
        const count = ((app.key === 'Messages') ? unreadMessages : ((app.key === 'Contacts') ? requestCount : 0));

        if(count <= 0) return null;

        return <div className="phone-app-badge">{ (count > 99) ? '99+' : count }</div>;
    }

    const appTile = (app: PhoneApp, showLabel: boolean) =>
    {
        return (
            <div key={ app.key } className={ `phone-app${ app.active ? ' phone-tap' : ' is-disabled' }` } title={ app.active ? app.key : `${ app.key } — coming soon` } onClick={ event => (app.active && openApp && openApp(app.key)) }>
                <div className="phone-app-tile">
                    <PhoneIcon icon={ app.icon } size={ 26 } />
                    { badgeFor(app) }
                </div>
                { showLabel &&
                    <div className="phone-app-label">{ app.key }</div> }
            </div>
        );
    }

    return (
        <div className="phone-screen phone-home">
            <div className="phone-home-wallpaper" />
            <div className="phone-home-shade" />
            <div className="phone-home-grid">
                { GRID_APPS.map(app => appTile(app, true)) }
            </div>
            <div className="phone-home-dock">
                { DOCK_APPS.map(app => appTile(app, false)) }
            </div>
        </div>
    );
}
