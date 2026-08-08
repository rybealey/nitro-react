import { FC } from 'react';
import { Flex, Text } from '../../common';
import { useNavigator, useRoom } from '../../hooks';

export const RoomTitleView: FC<{}> = props =>
{
    const { navigatorData = null } = useNavigator();
    const { roomSession = null } = useRoom();

    const roomName = navigatorData?.enteredGuestRoom?.roomName;

    if(!roomSession || !roomName || !roomName.length) return null;

    return (
        <Flex justifyContent="end" className="nitro-room-title rounded p-1 px-2">
            <Text wrap variant="white" className="text-end">{ roomName }</Text>
        </Flex>
    );
}
