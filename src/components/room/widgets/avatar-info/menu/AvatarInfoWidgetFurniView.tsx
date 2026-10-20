import { RoomControllerLevel, RoomObjectOperationType } from '@nitrots/nitro-renderer';
import { FC } from 'react';
import { FaArrowsAlt, FaSyncAlt, FaTrashRestore } from 'react-icons/fa';
import { AvatarInfoFurni, ProcessRoomObjectOperation } from '../../../../../api';
import { TakesPublicRoomFurni } from '../../../../../api/rp-rights/RpRanks';
import { PIXELRP_ROOM_OWNER } from '../../../../../api/rp-rights/RpRoomRightsMessages';
import { Flex } from '../../../../../common';
import { useNavigator } from '../../../../../hooks';
import { ContextMenuHeaderView } from '../../context-menu/ContextMenuHeaderView';
import { ContextMenuListItemView } from '../../context-menu/ContextMenuListItemView';
import { ContextMenuView } from '../../context-menu/ContextMenuView';

interface AvatarInfoWidgetFurniViewProps
{
    avatarInfo: AvatarInfoFurni;
    onClose: () => void;
}

export const AvatarInfoWidgetFurniView: FC<AvatarInfoWidgetFurniViewProps> = props =>
{
    const { avatarInfo = null, onClose = null } = props;
    const { navigatorData = null } = useNavigator();
    // pixelrp: in a public room (PixelRP's) a Builder or above with rights here
    // picks the piece up as theirs, as in the infostand.
    const takesIt = ((navigatorData?.enteredGuestRoom?.ownerName === PIXELRP_ROOM_OWNER) && TakesPublicRoomFurni() && (avatarInfo.roomControllerLevel >= RoomControllerLevel.GUEST));
    const canPickUp = (avatarInfo.isOwner || avatarInfo.isAnyRoomController || takesIt);

    const processAction = (name: string) =>
    {
        let hideMenu = true;

        if(name)
        {
            switch(name)
            {
                case 'move':
                    ProcessRoomObjectOperation(avatarInfo.id, avatarInfo.category, RoomObjectOperationType.OBJECT_MOVE);
                    break;
                case 'rotate':
                    ProcessRoomObjectOperation(avatarInfo.id, avatarInfo.category, RoomObjectOperationType.OBJECT_ROTATE_POSITIVE);
                    break;
                case 'pickup':
                    ProcessRoomObjectOperation(avatarInfo.id, avatarInfo.category, RoomObjectOperationType.OBJECT_PICKUP);
                    break;
                case 'eject':
                    ProcessRoomObjectOperation(avatarInfo.id, avatarInfo.category, RoomObjectOperationType.OBJECT_EJECT);
                    break;
            }
        }
    }

    return (
        <ContextMenuView objectId={ avatarInfo.id } category={ avatarInfo.category } onClose={ onClose } collapsable={ true }>
            <ContextMenuHeaderView>
                { avatarInfo.name }
            </ContextMenuHeaderView>
            <Flex className="menu-list-split-3">
                <ContextMenuListItemView onClick={ event => processAction('move') }>
                    <FaArrowsAlt className="center fa-icon" />
                </ContextMenuListItemView>
                <ContextMenuListItemView onClick={ event => processAction('rotate') } disabled={ avatarInfo.isWallItem }>
                    <FaSyncAlt className="center fa-icon" />
                </ContextMenuListItemView>
                { canPickUp &&
                    <ContextMenuListItemView onClick={ event => processAction('pickup') }>
                        <FaTrashRestore className="center fa-icon" />
                    </ContextMenuListItemView> }
                { !canPickUp && (avatarInfo.isRoomOwner || (avatarInfo.roomControllerLevel >= RoomControllerLevel.GUILD_ADMIN)) &&
                    <ContextMenuListItemView onClick={ event => processAction('eject') }>
                        <FaTrashRestore className="center fa-icon" />
                    </ContextMenuListItemView> }
            </Flex>
        </ContextMenuView>
    );
}
