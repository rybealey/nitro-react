import { IRoomSession, RoomControllerLevel } from '@nitrots/nitro-renderer';
import { HasAnyRoomRights, IsRoomOwnerNow } from '../../rp-rights/RpRoomRightsMessages';

/**
 * Whether this player may MOVE, ROTATE or otherwise edit a furni in place.
 *
 * This is the gate behind every gesture that makes a room feel editable:
 * alt+drag and shift+click (the renderer dispatches REQUEST_MOVE and
 * REQUEST_ROTATE and asks here), decorating mode, the stack-height widget and
 * the toner.
 *
 * It deliberately does NOT accept owning the furni. MoveObjectEvent,
 * UpdateMagicTileEvent and SetTonerEvent all want ROOM rights and none of them
 * has an owner exception - so accepting it let a player drag their own block
 * around a room they hold no rights in, watch it move, and find it back where
 * it started on the next reload. The room felt editable and was not.
 *
 * Getting your own furni back is a different question with a different answer:
 * PickupObjectEvent honours item.UserId, and Pick Up is gated on that instead.
 */
export function CanManipulateFurniture(roomSession: IRoomSession, objectId: number, category: number): boolean
{
    if(!roomSession) return false;

    return (IsRoomOwnerNow(roomSession) || (roomSession.controllerLevel >= RoomControllerLevel.GUEST) || HasAnyRoomRights());
}
