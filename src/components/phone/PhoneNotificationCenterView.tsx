import { FC } from 'react';
import { PhoneNotifyCard } from './PhoneNotificationsView';
import { PhoneNotification, usePhoneNotifications } from './usePhoneNotifications';

interface PhoneNotificationCenterViewProps
{
    onOpen: (notification: PhoneNotification) => void;
    onClose: () => void;
}

/// Notification Center: everything the phone has been told, newest first.
///
/// A badge says how many things are waiting; this is where the player goes to
/// see what they are. It pulls down over whatever is on screen and closes by
/// tapping the ground behind it or the grab handle - the same gesture that
/// opened it.
export const PhoneNotificationCenterView: FC<PhoneNotificationCenterViewProps> = props =>
{
    const { onOpen = null, onClose = null } = props;
    const { notifications, context, markAllSeen, clearAll } = usePhoneNotifications();
    const unseen = notifications.filter(notification => !notification.seen).length;

    return (
        <div className="phone-notify-center">
            <div className="phone-notify-scrim" onClick={ event => (onClose && onClose()) } />
            <div className="phone-notify-sheet">
                <div className="phone-notify-sheet-glass" />
                <div className="phone-notify-sheet-body">
                    <div className="phone-notify-sheet-head">
                        <div>
                            <div className="phone-app-kicker">{ unseen ? `${ unseen } NEW` : 'ALL CAUGHT UP' }</div>
                            <div className="phone-notify-sheet-title">Notifications</div>
                        </div>
                        { !!notifications.length &&
                            <div className="phone-notify-sweep phone-tap" onClick={ event => (unseen ? markAllSeen() : clearAll()) }>{ unseen ? 'Mark read' : 'Clear all' }</div> }
                    </div>
                    { notifications.length
                        ? <div className="phone-notify-list">
                            { notifications.map(notification => (
                                <PhoneNotifyCard key={ notification.id } notification={ notification } context={ context } row={ true } onOpen={ onOpen } />
                            )) }
                        </div>
                        : <div className="phone-notify-empty">Nothing has happened yet. Invites, messages and events show up here.</div> }
                    <div className="phone-notify-grabber phone-tap" title="Close" onClick={ event => (onClose && onClose()) }>
                        <span />
                    </div>
                </div>
            </div>
        </div>
    );
}
