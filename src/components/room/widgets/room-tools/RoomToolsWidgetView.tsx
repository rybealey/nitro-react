import { FC } from 'react';
import { CreateLinkEvent, GetSessionDataManager, LocalizeText } from '../../../../api';
import { Base, Column, Flex } from '../../../../common';

export const RoomToolsWidgetView: FC<{}> = props =>
{
    // Staff-only, like the toolbar's navigator/catalog/inventory/camera
    // entries — regular players get no room tools in the RP hotel. Zoom and
    // chat history live in RoomQuickToolsView, which everyone gets.
    const isMod = GetSessionDataManager().isModerator;

    // Room likes are disabled hotel-wide, so the like button is gone and the
    // 'like_room' action no longer exists here.
    const handleToolClick = (action: string, value?: string) =>
    {
        switch(action)
        {
            case 'settings':
                CreateLinkEvent('navigator/toggle-room-info');
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
            </Column>
        </Flex>
    );
}
