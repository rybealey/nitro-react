import { FC } from 'react';
import { NotificationAlertType, NotificationConfirmItem, NotificationConfirmType } from '../../../../api';
import { LayoutNotificationAlertView, LayoutNotificationAlertViewProps } from '../../../../common';

export interface NotificationDefaultConfirmViewProps extends LayoutNotificationAlertViewProps
{
    item: NotificationConfirmItem;
}

// Every showConfirm window, in the light style of the backpack's Delete Item
// window: the question, a white cancel, and one solid button - red when the
// caller passes NotificationConfirmType.DANGER, blue otherwise.
export const NotificationDefaultConfirmView: FC<NotificationDefaultConfirmViewProps> = props =>
{
    const { item = null, onClose = null, ...rest } = props;
    const { message = null, onConfirm = null, onCancel = null, confirmText = null, cancelText = null, title = null, confirmType = null } = item;
    const danger = (confirmType === NotificationConfirmType.DANGER);

    const confirm = () =>
    {
        if(onConfirm) onConfirm();

        onClose();
    }

    const cancel = () =>
    {
        if(onCancel) onCancel();

        onClose();
    }

    return (
        <LayoutNotificationAlertView title={ title } onClose={ onClose } { ...rest } classNames={ [ 'rp-dialog', 'rp-confirm' ] } type={ NotificationAlertType.ALERT }>
            <div className="rp-dialog-message">{ message }</div>
            <div className="rp-dialog-actions">
                <button type="button" className="rp-dialog-button is-secondary" onClick={ cancel }>{ cancelText }</button>
                <button type="button" className={ `rp-dialog-button ${ danger ? 'is-danger' : 'is-primary' }` } onClick={ confirm }>{ confirmText }</button>
            </div>
        </LayoutNotificationAlertView>
    );
}
