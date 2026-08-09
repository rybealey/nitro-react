import { FC } from 'react';
import { NotificationBubbleItem, NotificationBubbleType } from '../../../../api';
import { Base, Flex, LayoutNotificationBubbleView, LayoutNotificationBubbleViewProps, Text } from '../../../../common';

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

    const variant = (TOAST_VARIANTS[item.notificationType] || TOAST_VARIANTS[NotificationBubbleType.PLATFORM]);
    const htmlText = item.message.replace(/\r\n|\r|\n/g, '<br />');

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
