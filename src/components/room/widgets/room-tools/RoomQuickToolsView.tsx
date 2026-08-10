import { FC, useState } from 'react';
import { CreateLinkEvent, GetRoomEngine, LocalizeText } from '../../../../api';
import { Base, classNames, Flex } from '../../../../common';
import { useRoom } from '../../../../hooks';

// Zoom and chat logs, reachable by every player. Rendered inside the
// right-side purse/title row so the pills stay aligned with the purse.
export const RoomQuickToolsView: FC<{}> = props =>
{
    const [ isZoomedIn, setIsZoomedIn ] = useState<boolean>(false);
    const { roomSession = null } = useRoom();

    if(!roomSession) return null;

    const toggleZoom = () =>
    {
        setIsZoomedIn(prevValue =>
        {
            let scale = GetRoomEngine().getRoomInstanceRenderingCanvasScale(roomSession.roomId, 1);

            if(!prevValue) scale /= 2;
            else scale *= 2;

            GetRoomEngine().setRoomInstanceRenderingCanvasScale(roomSession.roomId, 1, scale);

            return !prevValue;
        });
    };

    return (
        <Flex gap={ 1 } className="nitro-room-quick-tools">
            <Flex center className="nitro-room-quick-tool">
                <Base pointer title={ LocalizeText('room.zoom.button.text') } onClick={ toggleZoom } className={ classNames('icon', (!isZoomedIn && 'icon-zoom-less'), (isZoomedIn && 'icon-zoom-more')) } />
            </Flex>
            <Flex center className="nitro-room-quick-tool">
                <Base pointer title={ LocalizeText('room.chathistory.button.text') } onClick={ () => CreateLinkEvent('chat-history/toggle') } className="icon icon-chat-history" />
            </Flex>
        </Flex>
    );
};
