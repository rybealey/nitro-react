import { FC, useState } from 'react';
import { FaComments, FaSearchMinus, FaSearchPlus } from 'react-icons/fa';
import { CreateLinkEvent, GetRoomEngine, LocalizeText } from '../../../../api';
import { Flex } from '../../../../common';
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
                <i className="cursor-pointer fa-brands fa-discord quick-tool-discord" title="Join us on Discord" aria-hidden="true" onClick={ event => window.open('https://discord.gg/pH5TQF84UZ', '_blank', 'noopener,noreferrer') } />
            </Flex>
            { /* the magnifier shows the zoom you'd get by clicking: minus
                 (zoom out) at full scale, plus (zoom back in) once zoomed out */ }
            <Flex center className="nitro-room-quick-tool">
                { isZoomedIn
                    ? <FaSearchPlus className="cursor-pointer quick-tool-glyph" role="button" aria-label={ LocalizeText('room.zoom.button.text') } title={ LocalizeText('room.zoom.button.text') } onClick={ toggleZoom } />
                    : <FaSearchMinus className="cursor-pointer quick-tool-glyph" role="button" aria-label={ LocalizeText('room.zoom.button.text') } title={ LocalizeText('room.zoom.button.text') } onClick={ toggleZoom } /> }
            </Flex>
            <Flex center className="nitro-room-quick-tool">
                <FaComments className="cursor-pointer quick-tool-glyph" role="button" aria-label={ LocalizeText('room.chathistory.button.text') } title={ LocalizeText('room.chathistory.button.text') } onClick={ () => CreateLinkEvent('chat-history/toggle') } />
            </Flex>
        </Flex>
    );
};
