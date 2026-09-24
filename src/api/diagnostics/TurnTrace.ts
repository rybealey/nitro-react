import { GetTicker, GetTickerTime, RoomObjectCategory, RoomObjectType } from '@nitrots/nitro-renderer';
import { GetRoomEngine } from '../nitro/room/GetRoomEngine';
import { GetRoomSessionManager } from '../nitro/session/GetRoomSessionManager';

// ---------------------------------------------------------------------------
// TURN TRACE - diagnostics only, ALWAYS ON, no command needed.
//
// For the "dragging" corner turn: the avatar seems to finish a step it should
// not, or to slide round a corner before it turns. Neither existing watcher
// can see that. [MV2/ANOMALY] fires on a started edge changing shape or on a
// >0.2-tile frame jump, and a drag is neither - it is smooth, and it is late.
// So this fires on the one thing a drag always involves: a TURN, meaning a
// handoff where the next edge runs in a different direction from the last.
//
// IT MEASURES TWO THINGS PER TURN, one for each suspect:
//
//   facingLagMs    ms from the turning edge's own start until the avatar is
//                  first DRAWN facing the new way. V2 owns position, but facing
//                  still comes from the native status packet, and the server
//                  only sets it when it commits the edge (RoomUserManager
//                  ApplyMovementFrame). The client starts that edge from
//                  lookahead at its cycleStart, before any packet. If this is
//                  ~one network trip on every turn, the avatar is walking the
//                  new way while facing the old one - a sideways slide.
//
//   turnOffset     for a turn created by a correction (a redirect), how many
//                  edges past the one being drawn the geometry first changed.
//                  1 is a normal turn. 2 means the server protected the next
//                  edge (MovementSettings.RedirectSafetyMarginMs) and the
//                  avatar took one extra step before turning. 0 means an edge
//                  already being drawn was rewritten.
//
// LOGGING IS EVENT-BASED AND CAPPED, because console logging from the render
// path has stalled this client before. The per-frame path reads numbers and
// writes them into a state object allocated once per unit. A turn allocates
// one small record. A console line is written only for a FLAGGED turn, at most
// LOG_LIMIT per page load, then a one-line summary every SUMMARY_MS. Every
// turn, flagged or not, is kept in pixelrpTurns (last MAX_KEPT).
//
// IT CHANGES NO MOVEMENT CODE AND NEEDS NO RENDERER PATCH. It reads the V2
// store off window, as ProximityTrace does, and never calls getActive(), which
// has side effects.
//
//     pixelrpTurns          recent turns, newest last
//     pixelrpTurnStats      counters and histograms since page load
// ---------------------------------------------------------------------------

// A turn's facing is "late" past this. One 60fps frame is ~17ms, and sampling
// is once per frame, so anything under ~2 frames is measurement noise.
const T_FACING_LAG_MS = 40;

// Give up waiting for the facing to match after this, and report it unmatched.
const FACING_WAIT_MS = 1500;

// A correction is linked to a turn if it arrived no longer ago than this.
const CORRECTION_LINK_MS = 1500;

const LOG_LIMIT = 100;
const SUMMARY_MS = 60000;
const MAX_KEPT = 200;

// V2 keeps at most 8 edges per unit (PixelRPMovementV2.MAX_EDGES).
const SNAP_EDGES = 8;
const S_IDX = 0, S_SX = 1, S_SY = 2, S_GX = 3, S_GY = 4;
const S_STRIDE = 5;

const STALE_MS = 1400;

// Emulator Rotation.Calculate, so the expected facing is the server's own.
const rotationOf = (x1: number, y1: number, x2: number, y2: number): number =>
{
    if((x1 > x2) && (y1 > y2)) return 7;
    if((x1 < x2) && (y1 < y2)) return 3;
    if((x1 > x2) && (y1 < y2)) return 5;
    if((x1 < x2) && (y1 > y2)) return 1;
    if(x1 > x2) return 6;
    if(x1 < x2) return 2;
    if(y1 < y2) return 4;
    if(y1 > y2) return 0;

    return -1;
}

interface TurnState
{
    session: number;
    revision: number;
    edgeIndex: number;
    sx: number;
    sy: number;
    gx: number;
    gy: number;
    cycleStart: number;
    provisional: boolean;
    x: number;
    y: number;
    z: number;
    tick: number;

    snap: Int32Array;
    snapCount: number;

    // the most recent correction, in server time
    corrAt: number;
    corrRevision: number;
    corrActive: number;
    corrActivePhase: number;
    corrChanged: number;
    corrLeadMs: number;

    turn: any;
}

const states: Map<number, TurnState> = new Map();
const turns: any[] = [];

const stats = {
    turns: 0,
    flagged: 0,
    logged: 0,
    suppressed: 0,
    facingLate: 0,
    facingUnmatched: 0,
    // facing lag histogram, ms
    lagUnder20: 0, lag20to60: 0, lag60to120: 0, lag120to250: 0, lagOver250: 0,
    worstFacingLagMs: 0,
    corrections: 0,
    // first changed edge, counted from the edge being drawn when it arrived
    correctionOffset0: 0, correctionOffset1: 0, correctionOffset2: 0, correctionOffset3plus: 0,
    correctionUnchanged: 0,
    turnsFromCorrection: 0,
    lateTurns: 0
};

let lastRoomId = -1;
let lastSummaryAt = 0;
let turnsAtLastSummary = 0;
let frame = 0;

const newState = (): TurnState => ({
    session: -1, revision: -1, edgeIndex: -1,
    sx: 0, sy: 0, gx: 0, gy: 0, cycleStart: 0, provisional: false,
    x: NaN, y: NaN, z: NaN, tick: NaN,
    snap: new Int32Array(SNAP_EDGES * S_STRIDE), snapCount: 0,
    corrAt: NaN, corrRevision: -1, corrActive: -1, corrActivePhase: NaN, corrChanged: -1, corrLeadMs: NaN,
    turn: null
});

const snapshot = (st: TurnState, edges: any[]): void =>
{
    const n = Math.min(edges.length, SNAP_EDGES);

    for(let i = 0; i < n; i++)
    {
        const e = edges[i];
        const o = (i * S_STRIDE);

        st.snap[o + S_IDX] = e.edgeIndex;
        st.snap[o + S_SX] = e.sx;
        st.snap[o + S_SY] = e.sy;
        st.snap[o + S_GX] = e.gx;
        st.snap[o + S_GY] = e.gy;
    }

    st.snapCount = n;
}

// The first edge index whose geometry differs from last frame's queue, or -1
// if the correction changed nothing that was already queued. Indexes that are
// new in this queue extend the route; they are not counted as changes.
const firstChanged = (st: TurnState, edges: any[]): number =>
{
    for(let i = 0; i < edges.length; i++)
    {
        const e = edges[i];

        for(let j = 0; j < st.snapCount; j++)
        {
            const o = (j * S_STRIDE);

            if(st.snap[o + S_IDX] !== e.edgeIndex) continue;

            if((st.snap[o + S_SX] !== e.sx) || (st.snap[o + S_SY] !== e.sy)
                || (st.snap[o + S_GX] !== e.gx) || (st.snap[o + S_GY] !== e.gy)) return e.edgeIndex;

            break;
        }
    }

    return -1;
}

const publish = (): void =>
{
    const install = (target: any) =>
    {
        target.pixelrpTurns = turns;
        target.pixelrpTurnStats = stats;
    };

    install(window);

    try
    {
        if(window.parent && (window.parent !== window)) install(window.parent);
    }
    catch (e)
    {
        // cross-origin parent - the in-frame handles still work
    }
}

const closeTurn = (turn: any, matched: boolean, lagMs: number): void =>
{
    turn.facingMatched = matched;
    turn.facingLagMs = (matched ? Math.round(lagMs) : null);
    turn.facingWaitedMs = Math.round(lagMs);

    stats.turns++;

    if(matched)
    {
        if(lagMs < 20) stats.lagUnder20++;
        else if(lagMs < 60) stats.lag20to60++;
        else if(lagMs < 120) stats.lag60to120++;
        else if(lagMs < 250) stats.lag120to250++;
        else stats.lagOver250++;

        if(lagMs > stats.worstFacingLagMs) stats.worstFacingLagMs = Math.round(lagMs);
    }
    else stats.facingUnmatched++;

    const reasons: string[] = [];

    if(!matched) reasons.push('FACING_NEVER_MATCHED');
    else if(lagMs > T_FACING_LAG_MS) reasons.push('FACING_LATE');

    if(turn.turnOffset === 0) reasons.push('ACTIVE_EDGE_REWRITTEN');
    else if(turn.turnOffset >= 2) reasons.push('TURN_EXTRA_STEP');

    if(reasons.indexOf('FACING_LATE') >= 0) stats.facingLate++;
    if(turn.turnOffset >= 2) stats.lateTurns++;

    turn.flags = reasons;

    turns.push(turn);

    while(turns.length > MAX_KEPT) turns.shift();

    if(!reasons.length) return;

    stats.flagged++;

    if(stats.logged >= LOG_LIMIT)
    {
        stats.suppressed++;
        return;
    }

    stats.logged++;

    console.log('[MV2/TURN] ' + reasons.join(' ') + ' unit ' + turn.unit
        + (turn.ownAvatar ? ' (own)' : ' (remote)')
        + ' dir ' + turn.fromDir + '->' + turn.toDir
        + ' at ' + turn.cornerX + ',' + turn.cornerY
        + (matched ? (' facingLag ' + turn.facingLagMs + 'ms') : (' facing unmatched after ' + turn.facingWaitedMs + 'ms'))
        + ((turn.turnOffset !== null) ? (' turnOffset ' + turn.turnOffset) : ''), turn);

    if(stats.logged === LOG_LIMIT)
        console.log('[MV2/TURN] line cap reached - turns still recorded in pixelrpTurns, counters in pixelrpTurnStats, summary every ' + (SUMMARY_MS / 1000) + 's.');
}

const onTick = (): void =>
{
    // a diagnostic must never be able to break the render loop
    try
    {
        sample();
    }
    catch (e)
    { /* ignore */ }
}

const sample = (): void =>
{
    frame++;

    const store = (window as any).pixelrpMovementV2;

    if(!store || !store.hasClock) return;

    const units: Map<number, any> = store._units;

    if(!units) return;

    const roomEngine = GetRoomEngine();

    if(!roomEngine) return;

    const roomId = roomEngine.activeRoomId;

    if(roomId !== lastRoomId)
    {
        states.clear();
        lastRoomId = roomId;
    }

    const session = GetRoomSessionManager()?.getSession(roomId);

    if(!session) return;

    const tickerNow = GetTickerTime();
    const estServerNow = (tickerNow - store.clockOffset);

    units.forEach((unit, id) =>
    {
        const edges = unit.edges;

        if(!edges || !edges.length) return;

        // real players only - bots patrol and would drown the record
        const userData = session.userDataManager.getUserDataByIndex(id);

        if(!userData || (userData.type !== RoomObjectType.USER)) return;

        let st = states.get(id);

        if(!st)
        {
            st = newState();
            states.set(id, st);
        }

        // READ-ONLY mirror of getActive's edge choice
        let edge = null;

        for(let i = (edges.length - 1); i >= 0; i--)
        {
            if(edges[i].cycleStart <= estServerNow)
            {
                edge = edges[i];
                break;
            }
        }

        const stale = ((tickerNow - unit.lastPacketAtClient) > STALE_MS);
        const phase = (edge ? Math.min(1, Math.max(0, ((estServerNow - edge.cycleStart) / (edge.interval || 500)))) : 0);

        // ---- correction: the revision moved within the same walk session ----
        if((unit.session === st.session) && (unit.revision > st.revision) && (st.revision >= 0))
        {
            const changed = firstChanged(st, edges);

            stats.corrections++;

            st.corrAt = estServerNow;
            st.corrRevision = unit.revision;
            st.corrActive = (edge ? edge.edgeIndex : -1);
            st.corrActivePhase = phase;
            st.corrChanged = changed;
            st.corrLeadMs = NaN;

            if(changed < 0) stats.correctionUnchanged++;
            else
            {
                const offset = (changed - st.corrActive);

                if(offset <= 0) stats.correctionOffset0++;
                else if(offset === 1) stats.correctionOffset1++;
                else if(offset === 2) stats.correctionOffset2++;
                else stats.correctionOffset3plus++;

                for(let i = 0; i < edges.length; i++)
                {
                    if(edges[i].edgeIndex === changed)
                    {
                        st.corrLeadMs = (edges[i].cycleStart - estServerNow);
                        break;
                    }
                }
            }
        }

        const roomObject = roomEngine.getRoomObject(roomId, id, RoomObjectCategory.UNIT);
        const location = (roomObject ? roomObject.getLocation() : null);
        const direction = (roomObject ? roomObject.getDirection() : null);
        const facing = (direction ? (((Math.round(direction.x / 45) % 8) + 8) % 8) : -1);

        // ---- an open turn: wait for the drawn facing to catch up ----
        if(st.turn)
        {
            const turn = st.turn;
            const waited = (estServerNow - turn.cycleStart);

            if(facing === turn.toDir)
            {
                turn.drawnAtMatch = (location ? [ +location.x.toFixed(3), +location.y.toFixed(3), +location.z.toFixed(3) ] : null);
                st.turn = null;
                closeTurn(turn, true, Math.max(0, waited));
            }
            else if((waited > FACING_WAIT_MS) || (unit.session !== turn.session)
                || (edge && (edge.edgeIndex > (turn.edgeIndex + 1))))
            {
                st.turn = null;
                closeTurn(turn, false, waited);
            }
        }

        // ---- handoff: did the direction change? ----
        if(edge && (st.edgeIndex >= 0) && (edge.edgeIndex !== st.edgeIndex) && (unit.session === st.session) && !stale)
        {
            const fromDir = rotationOf(st.sx, st.sy, st.gx, st.gy);
            const toDir = rotationOf(edge.sx, edge.sy, edge.gx, edge.gy);

            if((fromDir >= 0) && (toDir >= 0) && (fromDir !== toDir))
            {
                // a turn still waiting when the next one begins never matched
                if(st.turn)
                {
                    const open = st.turn;
                    st.turn = null;
                    closeTurn(open, false, (estServerNow - open.cycleStart));
                }

                // the first turn at or after the changed edge is the one the
                // correction made; it is consumed below so a later, ordinary
                // turn on the same route is not blamed on it
                const linked = (Number.isFinite(st.corrAt) && ((estServerNow - st.corrAt) <= CORRECTION_LINK_MS)
                    && (st.corrChanged >= 0) && (st.corrChanged <= edge.edgeIndex));

                if(linked) stats.turnsFromCorrection++;

                st.turn = {
                    unit: id,
                    ownAvatar: !!(roomObject && roomObject.model && (roomObject.model.getValue('own_user') > 0)),
                    session: unit.session,
                    atPerfMs: Math.round(tickerNow),

                    fromDir,
                    toDir,
                    facingAtHandoff: facing,
                    cornerX: edge.sx,
                    cornerY: edge.sy,

                    previousEdge: { index: st.edgeIndex, from: [ st.sx, st.sy ], to: [ st.gx, st.gy ], cycleStart: st.cycleStart, provisional: st.provisional },
                    edge: { index: edge.edgeIndex, from: [ edge.sx, edge.sy ], to: [ edge.gx, edge.gy ], cycleStart: edge.cycleStart, provisional: !!edge.provisional },
                    edgeIndex: edge.edgeIndex,
                    cycleStart: edge.cycleStart,
                    previousRevision: st.revision,
                    revision: edge.revision,

                    // how far into the turning edge the first frame that drew it was
                    phaseAtHandoff: +phase.toFixed(4),
                    msIntoEdgeAtHandoff: Math.round(estServerNow - edge.cycleStart),
                    frameDeltaMs: (Number.isFinite(st.tick) ? +(tickerNow - st.tick).toFixed(2) : null),

                    drawnBefore: (Number.isFinite(st.x) ? [ +st.x.toFixed(3), +st.y.toFixed(3), +st.z.toFixed(3) ] : null),
                    drawnAtHandoff: (location ? [ +location.x.toFixed(3), +location.y.toFixed(3), +location.z.toFixed(3) ] : null),

                    // the correction that produced this turn, if any
                    fromCorrection: linked,
                    turnOffset: (linked ? (st.corrChanged - st.corrActive) : null),
                    correctionMsBeforeTurn: (linked ? Math.round(edge.cycleStart - st.corrAt) : null),
                    correctionActiveEdge: (linked ? st.corrActive : null),
                    correctionActivePhase: (linked ? +st.corrActivePhase.toFixed(4) : null),
                    correctionLeadMs: (linked && Number.isFinite(st.corrLeadMs) ? Math.round(st.corrLeadMs) : null),
                    correctionRevision: (linked ? st.corrRevision : null),

                    queue: edges.map(e => ({ index: e.edgeIndex, revision: e.revision, provisional: !!e.provisional, from: [ e.sx, e.sy ], to: [ e.gx, e.gy ] })),
                    msSinceLastPacket: Math.round(tickerNow - unit.lastPacketAtClient)
                };

                if(linked) st.corrChanged = -1;

                // facing already right on the first frame: zero lag
                if(facing === toDir)
                {
                    const turn = st.turn;

                    turn.drawnAtMatch = turn.drawnAtHandoff;
                    st.turn = null;
                    closeTurn(turn, true, Math.max(0, (estServerNow - edge.cycleStart)));
                }
            }
        }

        // ---- remember this frame, mutating in place ----
        if(unit.session !== st.session) st.turn = null;

        st.session = unit.session;
        st.revision = unit.revision;

        if(edge)
        {
            st.edgeIndex = edge.edgeIndex;
            st.sx = edge.sx;
            st.sy = edge.sy;
            st.gx = edge.gx;
            st.gy = edge.gy;
            st.cycleStart = edge.cycleStart;
            st.provisional = !!edge.provisional;
        }

        if(location)
        {
            st.x = location.x;
            st.y = location.y;
            st.z = location.z;
        }

        st.tick = tickerNow;
        snapshot(st, edges);
    });

    // units that left the room
    if((frame % 300) === 0) states.forEach((_, id) =>
    {
        if(!units.has(id)) states.delete(id);
    });

    if((tickerNow - lastSummaryAt) >= SUMMARY_MS)
    {
        if(lastSummaryAt && (stats.turns > turnsAtLastSummary)) console.log('[MV2/TURN] summary', { ...stats });

        lastSummaryAt = tickerNow;
        turnsAtLastSummary = stats.turns;
    }
}

let attached = false;

// ON BY DEFAULT: called once at connection, it registers the ticker callback
// itself. The ticker may not exist yet that early, so it retries until it does.
export const InstallTurnTrace = (): void =>
{
    if((typeof window === 'undefined') || attached) return;

    publish();

    const tryAttach = (attempt: number) =>
    {
        if(attached) return;

        const ticker = GetTicker();

        if(!ticker)
        {
            if(attempt < 60) setTimeout(() => tryAttach(attempt + 1), 1000);

            return;
        }

        // after the room engine's own update, so the object's facing and
        // location are this frame's
        ticker.add(onTick, null, -50);
        attached = true;
    };

    tryAttach(0);
}
