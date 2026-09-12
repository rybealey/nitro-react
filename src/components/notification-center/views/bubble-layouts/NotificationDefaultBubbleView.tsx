import { FC, useState } from 'react';
import { NotificationBubbleItem, OpenUrl } from '../../../../api';
import { Flex, LayoutNotificationBubbleView, LayoutNotificationBubbleViewProps, Text } from '../../../../common';

export interface NotificationDefaultBubbleViewProps extends LayoutNotificationBubbleViewProps
{
    item: NotificationBubbleItem;
}

export const NotificationDefaultBubbleView: FC<NotificationDefaultBubbleViewProps> = props =>
{
    const { item = null, onClose = null, ...rest } = props;
    // pixelrp: most bubbles have no icon on disk.
    //
    // The icon url is SYNTHESIZED from the notification type when the server
    // does not send one - `furni_placement_error` becomes
    // …/notifications/furni_placement_error.png - and the great majority of
    // those files were never shipped. A missing one still reserved its 50x50
    // box and the gap beside it, so the message sat indented against nothing.
    //
    // Dropping the box on the load error covers every one of them at once,
    // including types that do not exist yet, rather than special-casing them by
    // name the way hotel.alert and the moderation bubbles had to be.
    const [ iconFailed, setIconFailed ] = useState(false);

    const htmlText = item.message.replace(/\r\n|\r|\n/g, '<br />');
    const showIcon = !!(item.iconUrl && item.iconUrl.length) && !iconFailed;

    return (
        <LayoutNotificationBubbleView onClose={ onClose } gap={ 2 } alignItems="center" onClick={ event => (item.linkUrl && item.linkUrl.length && OpenUrl(item.linkUrl)) } { ...rest }>
            { showIcon &&
                <Flex center className="bubble-image-container">
                    <img className="no-select" src={ item.iconUrl } alt="" onError={ event => setIconFailed(true) } />
                </Flex> }
            <Text wrap fullWidth variant="white" dangerouslySetInnerHTML={ { __html: htmlText } } />
        </LayoutNotificationBubbleView>
    );
}
