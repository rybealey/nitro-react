import { RoomObjectCategory } from '@nitrots/nitro-renderer';
import { FC, useState } from 'react';
import { FaCheck, FaTimes, FaUserPlus } from 'react-icons/fa';
import { LocalizeText, MessengerRequest } from '../../../../api';
import { Base, Flex, Text } from '../../../../common';
import { ObjectLocationView } from '../object-location/ObjectLocationView';

export const FriendRequestDialogView: FC<{ roomIndex: number, request: MessengerRequest, hideFriendRequest: (userId: number) => void, requestResponse: (requestId: number, flag: boolean) => void }> = props =>
{
    const { roomIndex = -1, request = null, requestResponse = null } = props;
    const [ expanded, setExpanded ] = useState(false);

    if(!request) return null;

    // PixelRP: a friend request shows as a small chrome chip over the requester's
    // avatar instead of a loud centered dialog. Click the chip to reveal the
    // compact accept/decline row; click the icon again to collapse it back.
    if(!expanded)
    {
        return (
            <ObjectLocationView objectId={ roomIndex } category={ RoomObjectCategory.UNIT }>
                <Base
                    className="nitro-friend-request-dialog frq-collapsed nitro-context-menu"
                    title={ LocalizeText('widget.friendrequest.from', [ 'username' ], [ request.name ]) }
                    onClick={ () => setExpanded(true) }>
                    <FaUserPlus className="frq-badge-icon" />
                </Base>
            </ObjectLocationView>
        );
    }

    return (
        <ObjectLocationView objectId={ roomIndex } category={ RoomObjectCategory.UNIT }>
            <Base className="nitro-friend-request-dialog frq-expanded nitro-context-menu px-2 py-1">
                <Flex alignItems="center" gap={ 2 }>
                    <FaUserPlus className="frq-badge-icon cursor-pointer" onClick={ () => setExpanded(false) } />
                    <Text variant="white" className="frq-name">{ request.name }</Text>
                    <Flex alignItems="center" gap={ 1 }>
                        <FaTimes className="frq-action decline cursor-pointer" title={ LocalizeText('widget.friendrequest.decline') } onClick={ () => requestResponse(request.requesterUserId, false) } />
                        <FaCheck className="frq-action accept cursor-pointer" title={ LocalizeText('widget.friendrequest.accept') } onClick={ () => requestResponse(request.requesterUserId, true) } />
                    </Flex>
                </Flex>
            </Base>
        </ObjectLocationView>
    );
}
