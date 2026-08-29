import { FC, useEffect, useState } from 'react';
import { NotificationBubbleItem, NotificationBubbleType } from '../../../../api';
import { Base, Flex, LayoutNotificationBubbleView, LayoutNotificationBubbleViewProps, Text } from '../../../../common';

// Server-sent countdown token, e.g. "restarting in… %countdown:15% seconds."
// — the number ticks down locally once per second.
const COUNTDOWN_TOKEN = /%countdown:(\d+)%/;

interface ToastVariant
{
    badge: string;
    classNames: string[];
    persistent: boolean;
}

const TOAST_VARIANTS: { [key: string]: ToastVariant } = {
    [NotificationBubbleType.PLATFORM]: { badge: 'Platform', classNames: [ 'platform' ], persistent: false },
    [NotificationBubbleType.MODERATION]: { badge: 'Moderation', classNames: [ 'platform', 'moderation' ], persistent: true },
    [NotificationBubbleType.INFORMATION]: { badge: 'Information', classNames: [ 'platform', 'information' ], persistent: false }
};

export interface NotificationPlatformBubbleViewProps extends LayoutNotificationBubbleViewProps
{
    item: NotificationBubbleItem;
}

export const NotificationPlatformBubbleView: FC<NotificationPlatformBubbleViewProps> = props =>
{
    const { item = null, onClose = null, ...rest } = props;
    const countdownMatch = item.message.match(COUNTDOWN_TOKEN);
    const [ countdown, setCountdown ] = useState<number>(countdownMatch ? parseInt(countdownMatch[1]) : null);

    useEffect(() =>
    {
        if(countdown === null) return;

        const interval = setInterval(() => setCountdown(prev => ((prev > 0) ? (prev - 1) : 0)), 1000);

        return () => clearInterval(interval);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const variant = (TOAST_VARIANTS[item.notificationType] || TOAST_VARIANTS[NotificationBubbleType.PLATFORM]);

    let messageText = item.message;

    if(countdownMatch)
    {
        if(countdown === 0)
        {
            // done counting: drop the whole "in… 0 seconds" phrase so the
            // sentence just ends at "restarting."
            messageText = messageText.replace(/\s*\bin\b\s*(…|\.\.\.)?\s*%countdown:\d+%\s*seconds?/, '');
        }
        else
        {
            messageText = messageText.replace(COUNTDOWN_TOKEN, String(countdown));

            if(countdown === 1) messageText = messageText.replace(/\bseconds\b/, 'second');
        }
    }

    const htmlText = messageText.replace(/\r\n|\r|\n/g, '<br />');

    return (
        <LayoutNotificationBubbleView onClose={ onClose } fadesOut={ !variant.persistent } timeoutMs={ 45000 } column gap={ 1 } classNames={ variant.classNames } onClick={ null } { ...rest }>
            <Flex justifyContent="between" alignItems="center" fullWidth>
                <Base className="platform-badge no-select">{ variant.badge }</Base>
                <Base pointer className="platform-close no-select" onClick={ event => onClose() }>×</Base>
            </Flex>
            <Text wrap fullWidth variant="white" dangerouslySetInnerHTML={ { __html: htmlText } } />
        </LayoutNotificationBubbleView>
    );
}
