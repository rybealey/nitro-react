import { NotificationBubbleItem, NotificationBubbleType } from '../../../../api';
import { NotificationClubGiftBubbleView } from './NotificationClubGiftBubbleView';
import { NotificationDefaultBubbleView } from './NotificationDefaultBubbleView';
import { NotificationPlatformBubbleView } from './NotificationPlatformBubbleView';

export const GetBubbleLayout = (item: NotificationBubbleItem, onClose: () => void) =>
{
    if(!item) return null;

    const props = { key: item.id, item, onClose };

    switch(item.notificationType)
    {
        case NotificationBubbleType.CLUBGIFT:
            return <NotificationClubGiftBubbleView { ...props } />
        case NotificationBubbleType.PLATFORM:
            return <NotificationPlatformBubbleView { ...props } />
        case NotificationBubbleType.MODERATION:
            return <NotificationPlatformBubbleView { ...props } />
        default:
            return <NotificationDefaultBubbleView { ...props } />
    }
}
