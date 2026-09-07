import { FC, MouseEvent, useMemo } from 'react';
import { useFriends } from '../../hooks';
import { NotifyApp } from '../../api/rp-phone/RpNotificationMessages';
import { AppGlyph, APP_DEFS } from './PhoneHomeView';
import { PhoneFace } from './PhoneAvatar';
import { PhoneIcon } from './PhoneIcon';
import { NOTIFY_APP_TILES, NotificationText, NotifyContext, PhoneNotification, usePhoneNotifications } from './usePhoneNotifications';

// The banner that drops in at the top of the phone screen, and the row the
// Notification Center uses - the same anatomy at two sizes, so a notification
// looks like itself wherever it is read.
//
// One material for every app: the phone's own glass, so it reads the same
// over a wallpaper, over a light app screen and in dark mode.

// Notifications with a person behind them lead with that person, the way a
// phone shows a text; the rest lead with the app.
const PERSONAL_KINDS: string[] = [ 'message', 'friend_request', 'friend_on', 'friend_off', 'album_invite', 'album_photo', 'note_shared', 'note_updated' ];

/// The app's icon plate, at whatever size the surface needs.
export const NotifyAppPlate: FC<{ app: NotifyApp, size: number }> = ({ app, size }) =>
{
    const def = (APP_DEFS[NOTIFY_APP_TILES[app]] ?? { icon: 'bell' });

    return (
        <div className="phone-notify-plate" style={ { width: size, height: size, borderRadius: Math.round(size * 0.32), background: def.plate } }>
            <AppGlyph icon={ def.icon } pri={ def.pri } sec={ def.sec } faStyle={ def.faStyle } />
        </div>
    );
}

/// The leading art: the actor's head with the app on its corner, or just the
/// app when nobody is behind it.
const NotifyLead: FC<{ notification: PhoneNotification, size: number }> = ({ notification, size }) =>
{
    const { friends = [] } = useFriends();
    const personal = (PERSONAL_KINDS.indexOf(notification.kind) >= 0);
    // The actor is nearly always a friend, so their head is usually to hand;
    // PhoneFace falls back to their initial when it is not.
    const who = useMemo(() =>
    {
        const name = (notification.actor || notification.subject);

        return friends.find(friend => (friend.name === name));
    }, [ friends, notification.actor, notification.subject ]);

    if(!personal) return <NotifyAppPlate app={ notification.app } size={ size } />;

    return (
        <div className="phone-notify-lead">
            <PhoneFace id={ who ? who.id : notification.targetId } figure={ who ? who.figure : null } name={ notification.actor || notification.subject } size={ size } />
            <div className="phone-notify-lead-chip">
                <NotifyAppPlate app={ notification.app } size={ Math.round(size * 0.5) } />
            </div>
        </div>
    );
}

/// How long ago it arrived, in the few words a phone uses.
export const NotifyWhen = (at: number): string =>
{
    const seconds = Math.max(0, Math.round((Date.now() - at) / 1000));

    if(seconds < 45) return 'now';
    if(seconds < 3600) return `${ Math.max(1, Math.round(seconds / 60)) }m`;
    if(seconds < 86400) return `${ Math.round(seconds / 3600) }h`;

    return `${ Math.round(seconds / 86400) }d`;
}

interface NotifyCardProps
{
    notification: PhoneNotification;
    context: NotifyContext;
    // the Center's flatter, denser variant
    row?: boolean;
    onOpen?: (notification: PhoneNotification) => void;
    onDismiss?: (notification: PhoneNotification) => void;
}

export const PhoneNotifyCard: FC<NotifyCardProps> = props =>
{
    const { notification = null, context = null, row = false, onOpen = null, onDismiss = null } = props;
    const { title, body } = useMemo(() => NotificationText(notification, context), [ notification, context ]);

    const dismiss = (event: MouseEvent<HTMLDivElement>) =>
    {
        event.stopPropagation();

        if(onDismiss) onDismiss(notification);
    }

    return (
        <div className={ `phone-notify-card${ row ? ' is-row' : ''}${ (row && !notification.seen) ? ' is-unseen' : '' }` } onClick={ event => (onOpen && onOpen(notification)) }>
            { !row &&
                <div className="phone-notify-glass" /> }
            <div className="phone-notify-body">
                <NotifyLead notification={ notification } size={ row ? 30 : 34 } />
                <div className="phone-notify-text">
                    <div className="phone-notify-head">
                        <span className="phone-notify-app">{ NOTIFY_APP_TILES[notification.app] }</span>
                        <span className="phone-notify-when">{ NotifyWhen(notification.at) }</span>
                    </div>
                    <div className="phone-notify-title">{ title }</div>
                    { !!body &&
                        <div className="phone-notify-sub">{ body }</div> }
                </div>
                { !row && onDismiss &&
                    <div className="phone-notify-close phone-tap" title="Dismiss" onClick={ dismiss }>
                        <PhoneIcon icon="close" size={ 11 } />
                    </div> }
            </div>
        </div>
    );
}

interface PhoneNotificationsViewProps
{
    onOpen: (notification: PhoneNotification) => void;
    openCenter: () => void;
}

/// The live stack: the newest banner in front, the rest collapsed behind it
/// with a count, exactly as they arrive. Each one leaves on its own after a
/// few seconds, so nothing that landed while the phone was away is waiting
/// to pop when it opens.
export const PhoneNotificationsView: FC<PhoneNotificationsViewProps> = props =>
{
    const { onOpen = null, openCenter = null } = props;
    const { banners, context, dismissBanner } = usePhoneNotifications();

    if(!banners.length) return null;

    // banners arrive oldest-first; the newest is the one in front
    const front = banners[banners.length - 1];
    const behind = banners.slice(0, -1);

    return (
        <div className="phone-notify-stack">
            <div className="phone-notify-pile">
                { behind.map((notification, index) => (
                    <div key={ notification.id } className="phone-notify-behind" style={ { top: ((behind.length - index) * 10), left: ((behind.length - index) * 9), right: ((behind.length - index) * 9) } } />
                )) }
                <PhoneNotifyCard notification={ front } context={ context } onOpen={ onOpen } onDismiss={ entry => dismissBanner(entry.id) } />
            </div>
            { (behind.length > 0) &&
                <div className="phone-notify-more phone-tap" onClick={ event => (openCenter && openCenter()) }>{ behind.length } more</div> }
        </div>
    );
}
