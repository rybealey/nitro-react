import { CallForHelpTopicData, DefaultSanctionMessageComposer, ModAlertMessageComposer, ModBanMessageComposer, ModKickMessageComposer, ModMessageMessageComposer, ModMuteMessageComposer, ModTradingLockMessageComposer } from '@nitrots/nitro-renderer';
import { FC, useMemo, useState } from 'react';
import { ISelectedUser, LocalizeText, ModActionDefinition, NotificationAlertType, SendMessageComposer } from '../../../../api';
import { useModTools, useNotification } from '../../../../hooks';

interface ModToolsUserModActionViewProps
{
    user: ISelectedUser;
    // called once the action has gone out (the User window keeps the tab open)
    onCloseClick?: () => void;
}

const MOD_ACTION_DEFINITIONS = [
    new ModActionDefinition(1, 'Alert', ModActionDefinition.ALERT, 1, 0),
    new ModActionDefinition(2, 'Mute 1h', ModActionDefinition.MUTE, 2, 0),
    new ModActionDefinition(3, 'Ban 18h', ModActionDefinition.BAN, 3, 0),
    new ModActionDefinition(4, 'Ban 7 days', ModActionDefinition.BAN, 4, 0),
    new ModActionDefinition(5, 'Ban 30 days (step 1)', ModActionDefinition.BAN, 5, 0),
    new ModActionDefinition(7, 'Ban 30 days (step 2)', ModActionDefinition.BAN, 7, 0),
    new ModActionDefinition(6, 'Ban 100 years', ModActionDefinition.BAN, 6, 0),
    new ModActionDefinition(106, 'Ban avatar-only 100 years', ModActionDefinition.BAN, 6, 0),
    new ModActionDefinition(101, 'Kick', ModActionDefinition.KICK, 0, 0),
    new ModActionDefinition(102, 'Lock trade 1 week', ModActionDefinition.TRADE_LOCK, 0, 168),
    new ModActionDefinition(104, 'Lock trade permanent', ModActionDefinition.TRADE_LOCK, 0, 876000),
    new ModActionDefinition(105, 'Message', ModActionDefinition.MESSAGE, 0, 0),
];

export const ModToolsUserModActionView: FC<ModToolsUserModActionViewProps> = props =>
{
    const { user = null, onCloseClick = null } = props;
    const [ selectedTopic, setSelectedTopic ] = useState(-1);
    const [ selectedAction, setSelectedAction ] = useState(-1);
    const [ message, setMessage ] = useState<string>('');
    const { cfhCategories = null, settings = null } = useModTools();
    const { simpleAlert = null } = useNotification();

    const topics = useMemo(() =>
    {
        const values: CallForHelpTopicData[] = [];

        if(cfhCategories && cfhCategories.length)
        {
            for(const category of cfhCategories)
            {
                for(const topic of category.topics) values.push(topic);
            }
        }

        return values;
    }, [ cfhCategories ]);

    const reset = () =>
    {
        setSelectedTopic(-1);
        setSelectedAction(-1);
        setMessage('');

        if(onCloseClick) onCloseClick();
    }

    const sendAlert = (message: string) => simpleAlert(message, NotificationAlertType.DEFAULT, null, null, 'Error');

    const sendDefaultSanction = () =>
    {
        let errorMessage: string = null;

        const category = topics[selectedTopic];

        if(selectedTopic === -1) errorMessage = 'You must select a CFH topic';

        if(errorMessage) return sendAlert(errorMessage);

        const messageOrDefault = (message.trim().length === 0) ? LocalizeText(`help.cfh.topic.${ category.id }`) : message;

        SendMessageComposer(new DefaultSanctionMessageComposer(user.userId, selectedTopic, messageOrDefault));
        
        reset();
    }

    const sendSanction = () =>
    {
        let errorMessage: string = null;

        const category = topics[selectedTopic];
        const sanction = MOD_ACTION_DEFINITIONS[selectedAction];

        if((selectedTopic === -1) || (selectedAction === -1)) errorMessage = 'You must select a CFH topic and Sanction';
        else if(!settings || !settings.cfhPermission) errorMessage = 'You do not have permission to do this';
        else if(!category) errorMessage = 'You must select a CFH topic';
        else if(!sanction) errorMessage = 'You must select a sanction';

        if(errorMessage)
        {
            sendAlert(errorMessage);
            
            return;
        }

        const messageOrDefault = (message.trim().length === 0) ? LocalizeText(`help.cfh.topic.${ category.id }`) : message;

        switch(sanction.actionType)
        {
            case ModActionDefinition.ALERT: {
                if(!settings.alertPermission)
                {
                    sendAlert('You have insufficient permissions');

                    return;
                }

                SendMessageComposer(new ModAlertMessageComposer(user.userId, messageOrDefault, category.id));
                break;
            }
            case ModActionDefinition.MUTE: 
                SendMessageComposer(new ModMuteMessageComposer(user.userId, messageOrDefault, category.id));
                break;
            case ModActionDefinition.BAN: {
                if(!settings.banPermission)
                {
                    sendAlert('You have insufficient permissions');

                    return;
                }

                SendMessageComposer(new ModBanMessageComposer(user.userId, messageOrDefault, category.id, selectedAction, (sanction.actionId === 106)));
                break;
            }
            case ModActionDefinition.KICK: {
                if(!settings.kickPermission)
                {
                    sendAlert('You have insufficient permissions');
                    return;
                }

                SendMessageComposer(new ModKickMessageComposer(user.userId, messageOrDefault, category.id));
                break;
            }
            case ModActionDefinition.TRADE_LOCK: {
                const numSeconds = (sanction.actionLengthHours * 60);

                SendMessageComposer(new ModTradingLockMessageComposer(user.userId, messageOrDefault, numSeconds, category.id));
                break;
            }
            case ModActionDefinition.MESSAGE: {
                if(message.trim().length === 0)
                {
                    sendAlert('Please write a message to user');

                    return;
                }

                SendMessageComposer(new ModMessageMessageComposer(user.userId, message, category.id));
                break;
            }
        }

        reset();
    }

    if(!user) return null;

    return (
        <div className="mt-card mt-panel">
            <div className="mt-grid2">
                <div className="mt-field">
                    <label className="mt-label">Reason</label>
                    <select className="form-select form-select-sm" value={ selectedTopic } onChange={ event => setSelectedTopic(parseInt(event.target.value)) }>
                        <option value={ -1 } disabled>Pick a reason</option>
                        { topics.map((topic, index) => <option key={ index } value={ index }>{ LocalizeText('help.cfh.topic.' + topic.id) }</option>) }
                    </select>
                </div>
                <div className="mt-field">
                    <label className="mt-label">Sanction</label>
                    <select className="form-select form-select-sm" value={ selectedAction } onChange={ event => setSelectedAction(parseInt(event.target.value)) }>
                        <option value={ -1 } disabled>Pick a sanction</option>
                        { MOD_ACTION_DEFINITIONS.map((action, index) => <option key={ index } value={ index }>{ action.name }</option>) }
                    </select>
                </div>
            </div>
            <label className="mt-label" htmlFor={ `mt-sanction-${ user.userId }` }>Message <span className="mt-label-note">(optional, replaces the default)</span></label>
            <textarea id={ `mt-sanction-${ user.userId }` } className="form-control form-control-sm mt-message" value={ message } onChange={ event => setMessage(event.target.value) } />
            <div className="d-flex justify-content-between gap-1">
                <button type="button" className="mt-chrome" onClick={ sendDefaultSanction }>Default sanction</button>
                <button type="button" className="mt-danger" onClick={ sendSanction }>Sanction</button>
            </div>
        </div>
    );
}
