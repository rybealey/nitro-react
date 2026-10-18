import { FC, useState } from 'react';
import { LocalizeText, NotificationAlertItem, NotificationAlertType, OpenUrl } from '../../../../api';
import { Base, LayoutNotificationAlertView, LayoutNotificationAlertViewProps } from '../../../../common';
import { isCommandListText, NotificationCommandListView } from './NotificationCommandListView';

interface NotificationDefaultAlertViewProps extends LayoutNotificationAlertViewProps
{
    item: NotificationAlertItem;
}

export const NotificationDefaultAlertView: FC<NotificationDefaultAlertViewProps> = props =>
{
    const { item = null, title = ((props.item && props.item.title) || ''), onClose = null, ...rest } = props;
    const [ imageFailed, setImageFailed ] = useState<boolean>(false)

    const visitUrl = () =>
    {
        OpenUrl(item.clickUrl);

        onClose();
    }

    const hasFrank = (item.alertType === NotificationAlertType.DEFAULT);

    // The `:commands` list arrives as a MOTD; when detected, render it as the
    // Commands window (a group rail beside a searchable list). Every other
    // MOTD/alert is untouched. The header's close is its only close, and the
    // corner grip resizes it.
    const messageText = (item.messages || []).join('\n');
    const isCommandList = isCommandListText(messageText);

    if(isCommandList)
    {
        return (
            <LayoutNotificationAlertView title="Commands" onClose={ onClose } { ...rest } resizable classNames={ [ 'nitro-alert-commands' ] } type={ item.alertType }>
                <NotificationCommandListView text={ messageText } />
            </LayoutNotificationAlertView>
        );
    }

    // In the light style of the confirm windows (NotificationDefaultConfirmView):
    // the picture, if any, beside the text, and one blue button - the link
    // when the alert has one, otherwise Close.
    const hasLink = !!(item.clickUrl && item.clickUrl.length);

    return (
        <LayoutNotificationAlertView title={ title } onClose={ onClose } { ...rest } classNames={ [ 'rp-dialog' ] } type={ hasFrank ? NotificationAlertType.DEFAULT : item.alertType }>
            <div className="rp-dialog-body">
                { hasFrank && !item.imageUrl && <Base className="notification-frank flex-shrink-0" /> }
                { item.imageUrl && !imageFailed && <img src={ item.imageUrl } alt={ item.title } onError={ () =>
                {
                    setImageFailed(true)
                } } className="align-self-baseline" /> }
                <div className="rp-dialog-message rp-dialog-scroll">
                    { (item.messages.length > 0) && item.messages.map((message, index) =>
                    {
                        const htmlText = message.replace(/\r\n|\r|\n/g, '<br />');

                        return <Base key={ index } dangerouslySetInnerHTML={ { __html: htmlText } } />;
                    }) }
                </div>
            </div>
            <div className="rp-dialog-actions">
                { hasLink
                    ? <button type="button" className="rp-dialog-button is-primary" onClick={ visitUrl }>{ LocalizeText(item.clickUrlText) }</button>
                    : <button type="button" className="rp-dialog-button is-primary" onClick={ onClose }>{ LocalizeText('generic.close') }</button> }
            </div>
        </LayoutNotificationAlertView>
    );

}
