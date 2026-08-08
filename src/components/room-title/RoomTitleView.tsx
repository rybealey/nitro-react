import { FC } from 'react';
import { GetSessionDataManager } from '../../api';
import { Flex, Text } from '../../common';
import { useNavigator, useRoom } from '../../hooks';

export const RoomTitleView: FC<{}> = props =>
{
    const { navigatorData = null } = useNavigator();
    const { roomSession = null } = useRoom();

    const roomName = navigatorData?.enteredGuestRoom?.roomName;

    if(!roomSession || !roomName || !roomName.length) return null;

    const roomId = navigatorData?.enteredGuestRoom?.roomId;
    const title = (GetSessionDataManager().isModerator && roomId) ? `#${ roomId } – ${ roomName }` : roomName;

    return (
        <Flex justifyContent="end" className="nitro-room-title rounded-bottom p-1 px-2">
            <Text wrap variant="white" className="text-end">{ title }</Text>
        </Flex>
    );
}
