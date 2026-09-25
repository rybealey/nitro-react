import { GetTicker, RoomObjectCategory, RoomObjectVariable, RoomSessionEvent, RpMovementV2Event } from '@nitrots/nitro-renderer';
import { GetCommunication } from '../GetCommunication';
import { GetRoomSessionManager } from '../session/GetRoomSessionManager';
import { GetRoomEngine } from './GetRoomEngine';

// PixelRP Movement V2: the legs stop when the walk does.
//
// The walking pose ("mv") is set and cleared by the server's status packets,
// so an avatar kept walking on the spot after arriving until the stop status
// reached this client - 50-200ms on a bad link, and every stop showed it. But
// the server already marks the last step of a walk (FinalEdge, flag 0x20) on
// the 4110 that carries it, and nothing read that.
//
// So: remember each unit's newest step, and when that step is the FINAL one
// and V2's clock says it has been fully drawn, switch the unit to standing.
// The server's stop status still arrives afterwards and has the last word (a
// chair makes it "sit").
//
// DELIBERATELY NARROW:
// - once per final step, and only if the unit is still in the walking pose -
//   never over a sit, a lay or anything else a status set;
// - a newer step of any kind (a redirect, a new walk), a walk-end or a
//   displacement cancels it before it fires;
// - nothing but the pose changes. Position, facing and timing stay V2's.

const FINAL_EDGE = 0x0020;
const EDGE_KEY_SPAN = 1e6; // keeps (revision, edgeIndex) ordered in one number

interface PendingStop
{
    session: number;
    order: number;
    endsAt: number;
}

const pending = new Map<number, PendingStop>();

// (walkSessionId, routeRevision, edgeIndex): the store's own total order.
const isOlder = (session: number, order: number, than: PendingStop): boolean =>
    ((session < than.session) || ((session === than.session) && (order < than.order)));

const onMovement = (event: RpMovementV2Event): void =>
{
    const parser = event.getParser();

    if(!parser || !parser.ok) return;

    const id = parser.virtualId;

    if(parser.isWalkEnd || parser.isDisplacement)
    {
        pending.delete(id);

        return;
    }

    const order = ((parser.routeRevision * EDGE_KEY_SPAN) + parser.edgeIndex);
    const existing = pending.get(id);

    if(existing && isOlder(parser.walkSessionId, order, existing)) return;

    if(parser.flags & FINAL_EDGE)
    {
        pending.set(id, { session: parser.walkSessionId, order, endsAt: (parser.cycleStart + parser.intervalMs) });

        return;
    }

    // A newer, non-final step: the walk goes on.
    if(existing) pending.delete(id);
}

const onTick = (): void =>
{
    if(!pending.size) return;

    const store = (window as any).pixelrpMovementV2;

    if(!store || !store.hasClock) return;

    // performance.now(), the store's own clock domain (see its updateClock).
    const serverNow = (performance.now() - store.clockOffset);
    const roomEngine = GetRoomEngine();
    const roomId = roomEngine?.activeRoomId;

    for(const [ id, stop ] of pending)
    {
        if(serverNow < stop.endsAt) continue;

        pending.delete(id);

        if(!roomEngine || (roomId === undefined) || (roomId === null)) continue;

        const roomObject = roomEngine.getRoomObject(roomId, id, RoomObjectCategory.UNIT);

        if(!roomObject || !roomObject.model) continue;
        if(roomObject.model.getValue<string>(RoomObjectVariable.FIGURE_POSTURE) !== 'mv') continue;

        roomEngine.updateRoomObjectUserPosture(roomId, id, 'std', '');
    }
}

// A ROOM CHANGE CLEARS MOVEMENT STATE, before the new room's data arrives
// (a room session is created as the client starts entering, ahead of the
// server's room packets). Virtual ids are per room and reused, and each unit's
// (session, revision, edge) order restarts there, so a unit left over from the
// last room could make its namesake's new steps look OLDER and have them
// ignored - and a pending stop here could stand the wrong avatar still. The
// server now sends each walker's current step on entry (EntryCatchUp), and
// this is what lets the client take it.
const onRoomChange = (): void =>
{
    pending.clear();

    const store = (window as any).pixelrpMovementV2;

    if(store && (typeof store.clearUnits === 'function')) store.clearUnits();
}

let installed = false;

// Registered once at connection, beside the renderer's own 4110 handler.
// The ticker may not exist yet that early, so it retries until it does.
export const InstallFinalStepStance = (): void =>
{
    if((typeof window === 'undefined') || installed) return;

    installed = true;
    GetCommunication().registerMessageEvent(new RpMovementV2Event(onMovement));

    const sessions = GetRoomSessionManager();

    if(sessions && sessions.events)
    {
        sessions.events.addEventListener(RoomSessionEvent.CREATED, onRoomChange);
        sessions.events.addEventListener(RoomSessionEvent.ENDED, onRoomChange);
    }

    const attach = (attempt: number) =>
    {
        const ticker = GetTicker();

        if(!ticker)
        {
            if(attempt < 60) setTimeout(() => attach(attempt + 1), 1000);

            return;
        }

        ticker.add(onTick, null, -50);
    };

    attach(0);
}
