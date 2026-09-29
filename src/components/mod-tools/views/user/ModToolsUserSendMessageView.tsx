import { ModMessageMessageComposer } from '@nitrots/nitro-renderer';
import { FC, useState } from 'react';
import { ISelectedUser, SendMessageComposer } from '../../../../api';
import { useNotification } from '../../../../hooks';

interface ModToolsUserSendMessageViewProps
{
    user: ISelectedUser;
    // called once the action has gone out (the User window keeps the tab open)
    onCloseClick?: () => void;
}

export const ModToolsUserSendMessageView: FC<ModToolsUserSendMessageViewProps> = props =>
{
    const { user = null, onCloseClick = null } = props;
    const [ message, setMessage ] = useState('');
    const { simpleAlert = null } = useNotification();

    if(!user) return null;

    const sendMessage = () =>
    {
        if(message.trim().length === 0)
        {
            simpleAlert('Please write a message to user.', null, null, null, 'Error', null);
            
            return;
        }

        SendMessageComposer(new ModMessageMessageComposer(user.userId, message, -999));

        setMessage('');
        if(onCloseClick) onCloseClick();
    }

    return (
        <div className="mt-card mt-panel">
            <label className="mt-label" htmlFor={ `mt-pm-${ user.userId }` }>Private message to { user.username }</label>
            <textarea id={ `mt-pm-${ user.userId }` } className="form-control form-control-sm mt-message is-tall" placeholder="Only they will see this." value={ message } onChange={ event => setMessage(event.target.value) } />
            <button type="button" className="mt-chrome align-self-end" disabled={ !message.trim().length } onClick={ sendMessage }>Send message</button>
        </div>
    );
}
