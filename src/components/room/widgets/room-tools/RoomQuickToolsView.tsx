import { FC, useState } from 'react';
import { CreateLinkEvent, GetRoomEngine, LocalizeText } from '../../../../api';
import { classNames, Flex, HoverBubble } from '../../../../common';
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
                <HoverBubble text="Join us on Discord" placement="bottom">
                    <i className="cursor-pointer fa-brands fa-discord quick-tool-discord" aria-hidden="true" onClick={ event => window.open('https://discord.gg/pH5TQF84UZ', '_blank', 'noopener,noreferrer') } />
                </HoverBubble>
            </Flex>
            <Flex center className="nitro-room-quick-tool">
                <HoverBubble text={ LocalizeText('room.zoom.button.text') } placement="bottom">
                    <div onClick={ toggleZoom } className={ classNames('cursor-pointer', 'icon', (!isZoomedIn && 'icon-zoom-less'), (isZoomedIn && 'icon-zoom-more')) } />
                </HoverBubble>
            </Flex>
            <Flex center className="nitro-room-quick-tool">
                <HoverBubble text={ LocalizeText('room.chathistory.button.text') } placement="bottom">
                    <div onClick={ () => CreateLinkEvent('chat-history/toggle') } className="cursor-pointer icon icon-chat-history" />
                </HoverBubble>
            </Flex>
        </Flex>
    );
};
