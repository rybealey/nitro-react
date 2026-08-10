import { RateFlatMessageComposer } from '@nitrots/nitro-renderer';
import { FC } from 'react';
import { CreateLinkEvent, GetSessionDataManager, LocalizeText, SendMessageComposer } from '../../../../api';
import { Base, Column, Flex } from '../../../../common';
import { useNavigator } from '../../../../hooks';

export const RoomToolsWidgetView: FC<{}> = props =>
{
    const { navigatorData = null } = useNavigator();
    // Staff-only, like the toolbar's navigator/catalog/inventory/camera
    // entries — regular players get no room tools in the RP hotel. Zoom and
    // chat history live in RoomQuickToolsView, which everyone gets.
    const isMod = GetSessionDataManager().isModerator;

    const handleToolClick = (action: string, value?: string) =>
    {
        switch(action)
        {
            case 'settings':
                CreateLinkEvent('navigator/toggle-room-info');
                return;
            case 'like_room':
                SendMessageComposer(new RateFlatMessageComposer(1));
                return;
            case 'toggle_room_link':
                CreateLinkEvent('navigator/toggle-room-link');
                return;
        }
    }

    if(!isMod) return null;

    return (
        <Flex className="nitro-room-tools-container" gap={ 2 }>
            <Column center className="nitro-room-tools p-2">
                <Base pointer title={ LocalizeText('room.settings.button.text') } className="icon icon-cog" onClick={ () => handleToolClick('settings') } />
                { navigatorData.canRate &&
                    <Base pointer title={ LocalizeText('room.like.button.text') } onClick={ () => handleToolClick('like_room') } className="icon icon-like-room" /> }
            </Column>
        </Flex>
    );
}
