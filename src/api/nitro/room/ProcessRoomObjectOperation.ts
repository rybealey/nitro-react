import { FurnitureFloorUpdateComposer, RoomObjectCategory, RoomObjectOperationType, RoomObjectVariable } from '@nitrots/nitro-renderer';
import { SendMessageComposer } from '../SendMessageComposer';
import { GetRoomEngine } from './GetRoomEngine';

export function ProcessRoomObjectOperation(objectId: number, category: number, operation: string): void
{
    if(((operation === RoomObjectOperationType.OBJECT_ROTATE_POSITIVE) || (operation === RoomObjectOperationType.OBJECT_ROTATE_NEGATIVE)) &&
        RotateFurniInPlace(objectId, category, (operation === RoomObjectOperationType.OBJECT_ROTATE_POSITIVE))) return;

    GetRoomEngine().processRoomObjectOperation(objectId, category, operation);
}

/**
 * pixelrp: turn a floor furni where it stands, whatever is under it (Twist,
 * 2026-10-22: rotate furni in the air without losing its height).
 *
 * The renderer will not even ask to turn a piece whose turned footprint does
 * not fit the room's stacking map (RoomObjectEventHandler.isValidLocation): a
 * long piece floating over empty floor or over other furni never turned, and
 * the only way round was to drag it, which re-stacks it and loses its height.
 * The server already treats a turn in place as no placement at all - it keeps
 * the height the piece has and only asks that its tiles are on the map
 * (RoomItemHandling.SetFloorItem, inPlace) - so the turn goes as it is and the
 * server decides; a refused one comes back as the piece's own update.
 *
 * The next direction is picked the way the renderer picks it
 * (getValidRoomObjectDirection): the furni's own allowed directions, in order.
 */
export function RotateFurniInPlace(objectId: number, category: number, positive: boolean): boolean
{
    if(category !== RoomObjectCategory.FLOOR) return false;

    const roomEngine = GetRoomEngine();
    const roomObject = roomEngine.getRoomObject(roomEngine.activeRoomId, objectId, category);

    if(!roomObject || !roomObject.model || !roomObject.getDirection() || !roomObject.getLocation()) return false;

    const allowed = roomObject.model.getValue<number[]>(RoomObjectVariable.FURNITURE_ALLOWED_DIRECTIONS);
    let direction = roomObject.getDirection().x;

    if(allowed && allowed.length)
    {
        let index = allowed.indexOf(direction);

        if(index < 0)
        {
            index = 0;

            while((index < allowed.length) && (direction > allowed[index])) index++;

            index = (index % allowed.length);
        }

        index = positive ? ((index + 1) % allowed.length) : (((index - 1) + allowed.length) % allowed.length);
        direction = allowed[index];
    }

    const location = roomObject.getLocation();

    SendMessageComposer(new FurnitureFloorUpdateComposer(objectId, location.x, location.y, Math.trunc(direction / 45)));

    return true;
}
