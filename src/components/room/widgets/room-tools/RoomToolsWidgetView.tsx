import { RateFlatMessageComposer } from '@nitrots/nitro-renderer';
import { FC, useState } from 'react';
import { CreateLinkEvent, GetRoomEngine, GetSessionDataManager, LocalizeText, SendMessageComposer } from '../../../../api';
import { Base, classNames, Column, Flex } from '../../../../common';
import { useNavigator, useRoom } from '../../../../hooks';

export const RoomToolsWidgetView: FC<{}> = props =>
{
    const [ isZoomedIn, setIsZoomedIn ] = useState<boolean>(false);
    const { navigatorData = null } = useNavigator();
    const { roomSession = null } = useRoom();
    // Staff-only, like the toolbar's navigator/catalog/inventory/camera
    // entries — regular players get no room tools in the RP hotel.
    const isMod = GetSessionDataManager().isModerator;

    const handleToolClick = (action: string, value?: string) =>
    {
        switch(action)
        {
            case 'settings':
                CreateLinkEvent('navigator/toggle-room-info');
                return;
            case 'zoom':
                setIsZoomedIn(prevValue =>
                {
                    let scale = GetRoomEngine().getRoomInstanceRenderingCanvasScale(roomSession.roomId, 1);

                    if(!prevValue) scale /= 2;
                    else scale *= 2;

                    GetRoomEngine().setRoomInstanceRenderingCanvasScale(roomSession.roomId, 1, scale);

                    return !prevValue;
                });
                return;
            case 'chat_history':
                CreateLinkEvent('chat-history/toggle');
                return;
            case 'like_room':
                SendMessageComposer(new RateFlatMessageComposer(1));
                return;
            case 'toggle_room_link':
                CreateLinkEvent('navigator/toggle-room-link');
                return;
        }
    }

    return (
        <>
            { /* Zoom and chat logs stay reachable for every player, staff or not. */ }
            <Flex gap={ 2 } className="nitro-room-quick-tools">
                <Flex center className="nitro-room-quick-tool">
                    <Base pointer title={ LocalizeText('room.zoom.button.text') } onClick={ () => handleToolClick('zoom') } className={ classNames('icon', (!isZoomedIn && 'icon-zoom-less'), (isZoomedIn && 'icon-zoom-more')) } />
                </Flex>
                <Flex center className="nitro-room-quick-tool">
                    <Base pointer title={ LocalizeText('room.chathistory.button.text') } onClick={ () => handleToolClick('chat_history') } className="icon icon-chat-history" />
                </Flex>
            </Flex>
            { isMod &&
                <Flex className="nitro-room-tools-container" gap={ 2 }>
                    <Column center className="nitro-room-tools p-2">
                        <Base pointer title={ LocalizeText('room.settings.button.text') } className="icon icon-cog" onClick={ () => handleToolClick('settings') } />
                        { navigatorData.canRate &&
                            <Base pointer title={ LocalizeText('room.like.button.text') } onClick={ () => handleToolClick('like_room') } className="icon icon-like-room" /> }
                    </Column>
                </Flex> }
        </>
    );
}
