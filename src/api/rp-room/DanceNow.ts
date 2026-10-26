import { IRoomSession, RoomObjectCategory, RoomObjectVariable, RoomSessionDanceEvent } from '@nitrots/nitro-renderer';
import { GetRoomEngine } from '../nitro/room/GetRoomEngine';
import { GetRoomSession } from '../nitro/session/GetRoomSession';
import { GetRoomSessionManager } from '../nitro/session/GetRoomSessionManager';
import { GetRpUnitStats } from '../rp-stats/RpStatsStore';

// PixelRP: a dance starts the moment it is picked, not a round trip later.
//
// The server's DanceEvent turns a dance down for one reason only - the dancer
// is knocked out - and that is known here, so a knocked-out player's dance is
// never shown. Everyone else's is put on their avatar at once, and the
// server's DanceComposer for each pick, when it comes, confirms it (or puts
// whatever it decided in its place). If the last one never comes - the packet
// limit dropped the request - the dance is taken back after a few seconds.

const CONFIRM_TIMEOUT_MS = 3000;

interface WaitingDance
{
    session: IRoomSession;
    roomId: number;
    roomIndex: number;
    /** The dance the server last confirmed, put back if this one is not. */
    previous: number;
    /** The latest pick, and how many picks are still to be answered. */
    latest: number;
    unanswered: number;
    timer: ReturnType<typeof setTimeout>;
}

let waiting: WaitingDance = null;
let listening = false;

// the events this module dispatches itself, which are not the server's answers
const previews = new WeakSet<RoomSessionDanceEvent>();

const showDance = (session: IRoomSession, danceId: number) =>
{
    GetRoomEngine().updateRoomObjectUserAction(session.roomId, session.ownRoomIndex, RoomObjectVariable.FIGURE_DANCE, danceId);

    // the avatar menu's Dance / Stop dancing follows the same event
    const event = new RoomSessionDanceEvent(session, session.ownRoomIndex, danceId);

    previews.add(event);

    GetRoomSessionManager().events.dispatchEvent(event);
}

// Still the room the dance was picked in - a room change makes a new session.
const stillThere = (dance: WaitingDance) => ((GetRoomSession() === dance.session) && (dance.session.roomId === dance.roomId));

const onDance = (event: RoomSessionDanceEvent) =>
{
    if(!waiting || previews.has(event) || (event.session !== waiting.session) || (event.roomIndex !== waiting.roomIndex)) return;

    // The answer to an earlier pick of a quick run: the renderer has just put
    // that one on, so the latest goes back on until its own answer comes.
    if(--waiting.unanswered > 0)
    {
        if(event.danceId !== waiting.latest) showDance(waiting.session, waiting.latest);

        return;
    }

    clearTimeout(waiting.timer);

    waiting = null;
}

export const DanceNow = (roomSession: IRoomSession, danceId: number): void =>
{
    if(!roomSession) return;

    roomSession.sendDanceMessage(danceId);

    const stats = GetRpUnitStats(roomSession.ownRoomIndex);

    if(stats && (stats.hp <= 0)) return;

    const roomObject = GetRoomEngine().getRoomObject(roomSession.roomId, roomSession.ownRoomIndex, RoomObjectCategory.UNIT);

    if(!roomObject) return;

    if(!listening)
    {
        GetRoomSessionManager().events.addEventListener(RoomSessionDanceEvent.RSDE_DANCE, onDance);

        listening = true;
    }

    // a pick still waiting from a room since left is forgotten, not carried over
    if(waiting && !stillThere(waiting))
    {
        clearTimeout(waiting.timer);

        waiting = null;
    }

    if(waiting) clearTimeout(waiting.timer);

    const dance: WaitingDance = waiting ?? {
        session: roomSession,
        roomId: roomSession.roomId,
        roomIndex: roomSession.ownRoomIndex,
        previous: (roomObject.model.getValue<number>(RoomObjectVariable.FIGURE_DANCE) || 0),
        latest: danceId,
        unanswered: 0,
        timer: null
    };

    dance.latest = danceId;
    dance.unanswered++;
    dance.timer = setTimeout(() =>
    {
        if(waiting === dance) waiting = null;

        if(stillThere(dance)) showDance(dance.session, dance.previous);
    }, CONFIRM_TIMEOUT_MS);

    waiting = dance;

    showDance(roomSession, danceId);
}
