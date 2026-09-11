import { IRoomSession, RoomControllerLevel } from '@nitrots/nitro-renderer';
import { GetSessionDataManager } from '../..';
import { GetRoomEngine } from '../room/GetRoomEngine';
import { IsOwnerOfFurniture } from './IsOwnerOfFurniture';
import { HasAnyRoomRights } from '../../rp-rights/RpRoomRightsMessages';

export function CanManipulateFurniture(roomSession: IRoomSession, objectId: number, category: number): boolean
{
    if(!roomSession) return false;

    return (roomSession.isRoomOwner || (roomSession.controllerLevel >= RoomControllerLevel.GUEST) || HasAnyRoomRights() || IsOwnerOfFurniture(GetRoomEngine().getRoomObject(roomSession.roomId, objectId, category)));
}
