import { RoomEnterComposer } from '@nitrots/nitro-renderer';
import { SendMessageComposer } from '../SendMessageComposer';
import { CreateRoomSession } from './CreateRoomSession';
import { GetRoomSession } from './GetRoomSession';

// PixelRP: go to a room the way an arrow does. From inside a room, ask to
// enter and keep this room on screen: the server's RoomReady re-points the
// session at the new room (RoomSessionManager.sessionReinitialize) and the
// swap happens when the new room is there. CreateRoomSession tears the room
// down first and creates a new session, so the whole trip was a blank screen.
// Not for a doorbell or a password - the wait at the door belongs on its own
// screen - and from no room at all there is nothing to keep, so both still
// start a session as before.
export function GoToRoom(roomId: number): void
{
    const session = GetRoomSession();

    if(!session || (session.roomId === roomId))
    {
        CreateRoomSession(roomId);

        return;
    }

    SendMessageComposer(new RoomEnterComposer(roomId, null));
}
