import { RoomSettingsComposer } from '@nitrots/nitro-renderer';
import { SendMessageComposer } from '../../../../api';

// The Room tool reads a room's settings with the same request the owner's
// Room settings window uses, and the answer (RoomSettingsDataEvent) opens
// that window wherever it arrives. A request made here is remembered for a
// few seconds so the window knows the answer is the Room tool's and stays shut.
const REQUEST_WINDOW_MS = 5000;

const pendingRequests: Map<number, number> = new Map();

export const RequestModToolsRoomSettings = (roomId: number) =>
{
    pendingRequests.set(roomId, Date.now());

    SendMessageComposer(new RoomSettingsComposer(roomId));
}

export const IsModToolsRoomSettingsRequest = (roomId: number): boolean =>
{
    const requestedAt = pendingRequests.get(roomId);

    return ((requestedAt !== undefined) && ((Date.now() - requestedAt) < REQUEST_WINDOW_MS));
}
