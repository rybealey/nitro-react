import { GetTicker, GetTickerTime, RoomObjectCategory, RoomObjectType } from '@nitrots/nitro-renderer';
import { GetRoomEngine } from '../nitro/room/GetRoomEngine';
import { GetRoomSessionManager } from '../nitro/session/GetRoomSessionManager';

// ---------------------------------------------------------------------------
// BUFFERED PROXIMITY TRACE - diagnostics only, OFF unless armed.
//
// For the residual hitch that is only perceived when two real avatars interact:
// crossing, head-on, diagonal, following closely, or walking abreast. It exists
// to answer ONE question with evidence - is that hitch real V2 timing, a long
// render frame, an edge-boundary artefact, relative spacing drift, or purely a
// depth/render-order effect?
//
// ZERO OBSERVER EFFECT IS THE POINT. The previous round of movement forensics
// logged from the render path and the logging WAS the bug: hundreds of console
// calls per walk, each retaining and symbolising an object, stalled the main
// thread long enough to skip whole edges - the instrument manufactured its own
// subject. So while recording there is no console call, no string, no template
// literal, no JSON, no stack capture, no object inspection and no allocation.
// The per-frame path is exactly: read numbers -> write numbers into a
// preallocated Float64Array.
//
// EVERYTHING DERIVED IS DERIVED AT DUMP TIME. Deltas, phase error, expected
// advance, contiguity, spacing change and the verdicts are all differences
// between stored rows, so none of them cost anything per frame. Only one value
// is computed during capture - the summed length of edges skipped by a long
// frame - because the queue that answers it can be pruned before the dump, and
// it is computed only on the rare frame where the edge index jumps by more
// than one.
//
// IT CHANGES NO MOVEMENT CODE AND NEEDS NO RENDERER PATCH. The V2 store already
// publishes itself on window, so this reads it from the client side. It never
// calls getActive(): that has side effects - it bumps stats and can drop a
// stale unit - and a diagnostic must not be able to change what it measures.
// The edge/phase/ownership maths below is a READ-ONLY mirror of getActive's,
// used only for reporting, and every row also carries the position actually
// read off the room object, so if the mirror ever drifts the two disagree.
//
// Cost when disarmed: none. The ticker callback is not registered.
//
//     pixelrpProximityTrace()          arm, capture up to 3 events
//     pixelrpProximityTrace(true, 10)  arm, capture up to 10
//     pixelrpProximityTrace(false)     disarm
//     pixelrpProximityTrace.last       last event: summary, verdicts, rows
//     pixelrpProximityTrace.all        every event captured since arming
// ---------------------------------------------------------------------------

const NEAR_TILES = 2;
const NEAR_SQ = (NEAR_TILES * NEAR_TILES);

// frames kept before the trigger, so the approach into the 2-tile window is in
// the record rather than starting at it
const PRE_FRAMES = 10;

// keep recording after they separate; the pull-apart is where a hitch shows
const TAIL_FRAMES = 18;

// total cap including the pre-roll
const MAX_FRAMES = 200;

// scratch/ring width; a room cannot realistically exceed this, and anything
// past it is simply not sampled rather than allocating mid-frame
const MAX_UNITS = 64;

// while idle, look for a pair this often, in frames. The search is O(n) via a
// 2-tile spatial hash over a preallocated linked list - never a per-frame
// pairwise sweep, and it adds no synchronisation of any kind between units.
const SCAN_EVERY = 6;

// after an event ends, how long before a new one may start
const COOLDOWN_FRAMES = 60;

const CELL = 2;
const KEY_BASE = 4096;
const KEY_OFFSET = 512;

// One edge is 500ms. Edge LENGTH is read from the edge geometry rather than
// assumed, so a diagonal edge is correctly sqrt(2) tiles in 500ms and is never
// compared against phase as though it were one tile.
const EDGE_MS = 500;

// ---- thresholds: deliberately blunt, so ordinary float and frame-timing
// noise cannot trip them. A 60fps frame is 0.033 of an edge, so a phase error
// of 0.02 is over half a frame's worth of drift - clearly not rounding.
const T_PHASE_ERROR = 0.02;
const T_POSITION_ERROR = 0.08; // tiles
const T_LONG_FRAME_MS = 32; // two 60fps frames
const T_SPACING = 0.10; // tiles of UNEXPLAINED spacing change
const T_BACKWARDS = 0.002; // same session+revision+edge going back
const T_CONTIGUITY = 0.05; // tiles between prev edge end and next start

// ---- row layout -------------------------------------------------------------

const G_STRIDE = 8;
const G_TRACE = 0, G_FRAME = 1, G_PERF = 2, G_TICK = 3, G_DT = 4, G_SRV = 5, G_DIST = 6, G_HIDDEN = 7;

const U_STRIDE = 20;
const U_ID = 0, U_SESSION = 1, U_REVISION = 2, U_EDGE = 3, U_CYCLE = 4, U_PHASE = 5;
const U_X = 6, U_Y = 7, U_Z = 8;
const U_FX = 9, U_FY = 10, U_FZ = 11;
const U_TX = 12, U_TY = 13, U_TZ = 14;
const U_DIR = 15, U_OWNED = 16, U_HOLD = 17, U_DEPTH = 18, U_SKIPLEN = 19;

const ROW = (G_STRIDE + (2 * U_STRIDE));

// ---- storage, all preallocated ----------------------------------------------

const buf = new Float64Array(MAX_FRAMES * ROW);

// the pre-trigger ring holds EVERY sampled unit, because which pair will
// trigger is not known until it does
const ringGlobal = new Float64Array(PRE_FRAMES * G_STRIDE);
const ringUnits = new Float64Array(PRE_FRAMES * MAX_UNITS * U_STRIDE);
const ringCount = new Int32Array(PRE_FRAMES);
let ringPos = 0;
let ringFilled = 0;

const bucketNext = new Int32Array(MAX_UNITS);
const bucketHead: Map<number, number> = new Map();
const lastEdgeOf: Map<number, number> = new Map();

// ---- state -------------------------------------------------------------------

let armed = false;
let capturesLeft = 0;
let frameCount = 0;
let cooldown = 0;
let nextTraceId = 1;

let tracing = false;
let traceId = 0;
let rows = 0;
let aId = 0;
let bId = 0;
let tail = 0;
let prevTick = NaN;
const events: any[] = [];

const cellKey = (cx: number, cy: number): number => (((cx + KEY_OFFSET) * KEY_BASE) + (cy + KEY_OFFSET));

const slotBase = (slot: number): number => (slot * MAX_UNITS * U_STRIDE);

// ---- per-frame sampling -------------------------------------------------------

// Writes this frame straight into the ring slot. No scratch copy, no
// allocation, no strings. Returns how many units were written.
const sampleFrame = (perfNow: number, tickerNow: number, slot: number): number =>
{
    const store = (window as any).pixelrpMovementV2;

    if(!store || !store.hasClock) return 0;

    const units: Map<number, any> = store._units;

    if(!units || !units.size) return 0;

    const roomEngine = GetRoomEngine();

    if(!roomEngine) return 0;

    const roomId = roomEngine.activeRoomId;
    const session = GetRoomSessionManager()?.getSession(roomId);

    if(!session) return 0;

    const estServerNow = (tickerNow - store.clockOffset);
    const base = slotBase(slot);
    let n = 0;

    units.forEach((unit, id) =>
    {
        if(n >= MAX_UNITS) return;

        const edges = unit.edges;

        if(!edges || !edges.length) return;

        // real players only - bots patrol and pets wander, and either would sit
        // in the trace looking exactly like the thing being hunted
        const userData = session.userDataManager.getUserDataByIndex(id);

        if(!userData || (userData.type !== RoomObjectType.USER)) return;

        // READ-ONLY mirror of getActive, ownership conditions included. Never
        // calls it: getActive deletes stale units and bumps counters, and this
        // must not be able to change what it observes.
        const stale = ((tickerNow - unit.lastPacketAtClient) > 1400);

        let edge = null;
        let phase = 0;
        let holding = 0;

        for(let i = (edges.length - 1); i >= 0; i--)
        {
            if(edges[i].cycleStart <= estServerNow) { edge = edges[i]; break; }
        }

        if(!edge)
        {
            edge = edges[0];
            holding = 1;
        }
        else phase = Math.min(1, Math.max(0, ((estServerNow - edge.cycleStart) / edge.interval)));

        if(!edge) return;

        // the pending hold only applies within MAX_HOLD_MS of the start
        const farFuture = (holding && ((edge.cycleStart - estServerNow) > 1200));
        const owned = ((!stale && !farFuture) ? 1 : 0);

        const roomObject = roomEngine.getRoomObject(roomId, id, RoomObjectCategory.UNIT);
        const location = (roomObject ? roomObject.getLocation() : null);
        const direction = (roomObject ? roomObject.getDirection() : null);

        // a long frame can carry the render past more than one edge; the queue
        // that explains it can be pruned before the dump, so the skipped length
        // is summed HERE - on the rare frame it happens, and nowhere else
        let skipLen = 0;
        const wasEdge = lastEdgeOf.get(id);

        if((wasEdge !== undefined) && ((edge.edgeIndex - wasEdge) > 1))
        {
            for(let i = 0; i < edges.length; i++)
            {
                const e = edges[i];

                if((e.edgeIndex > wasEdge) && (e.edgeIndex < edge.edgeIndex))
                {
                    skipLen += Math.sqrt((((e.gx - e.sx) * (e.gx - e.sx)) + ((e.gy - e.sy) * (e.gy - e.sy))));
                }
            }
        }

        lastEdgeOf.set(id, edge.edgeIndex);

        const o = (base + (n * U_STRIDE));

        ringUnits[o + U_ID] = id;
        ringUnits[o + U_SESSION] = edge.session;
        ringUnits[o + U_REVISION] = edge.revision;
        ringUnits[o + U_EDGE] = edge.edgeIndex;
        ringUnits[o + U_CYCLE] = edge.cycleStart;
        ringUnits[o + U_PHASE] = phase;
        ringUnits[o + U_X] = (location ? location.x : NaN);
        ringUnits[o + U_Y] = (location ? location.y : NaN);
        ringUnits[o + U_Z] = (location ? location.z : NaN);
        ringUnits[o + U_FX] = edge.sx;
        ringUnits[o + U_FY] = edge.sy;
        ringUnits[o + U_FZ] = edge.sz;
        ringUnits[o + U_TX] = edge.gx;
        ringUnits[o + U_TY] = edge.gy;
        ringUnits[o + U_TZ] = edge.gz;
        ringUnits[o + U_DIR] = (direction ? direction.x : NaN);
        ringUnits[o + U_OWNED] = owned;
        ringUnits[o + U_HOLD] = holding;
        // depth costs an allocating geometry call, so it is filled in later and
        // only for the two units actually being traced
        ringUnits[o + U_DEPTH] = NaN;
        ringUnits[o + U_SKIPLEN] = skipLen;

        n++;
    });

    const g = (slot * G_STRIDE);

    ringGlobal[g + G_TRACE] = traceId;
    ringGlobal[g + G_FRAME] = frameCount;
    ringGlobal[g + G_PERF] = perfNow;
    ringGlobal[g + G_TICK] = tickerNow;
    ringGlobal[g + G_DT] = (Number.isNaN(prevTick) ? 0 : (tickerNow - prevTick));
    ringGlobal[g + G_SRV] = estServerNow;
    ringGlobal[g + G_DIST] = NaN;
    ringGlobal[g + G_HIDDEN] = ((document.visibilityState === 'hidden') ? 1 : 0);

    return n;
}

const findInSlot = (slot: number, count: number, id: number): number =>
{
    const base = slotBase(slot);

    for(let i = 0; i < count; i++)
    {
        if(ringUnits[base + (i * U_STRIDE) + U_ID] === id) return (base + (i * U_STRIDE));
    }

    return -1;
}

// ---- pair search: O(n) through a 2-tile spatial hash -------------------------

const isMoving = (o: number): boolean =>
    (((ringUnits[o + U_FX] !== ringUnits[o + U_TX]) || (ringUnits[o + U_FY] !== ringUnits[o + U_TY])) && (ringUnits[o + U_PHASE] < 1));

const tryStart = (slot: number, count: number): boolean =>
{
    const base = slotBase(slot);

    bucketHead.clear();

    for(let i = 0; i < count; i++)
    {
        const o = (base + (i * U_STRIDE));

        if(!isMoving(o) || !ringUnits[o + U_OWNED]) continue;

        const key = cellKey(Math.floor(ringUnits[o + U_X] / CELL), Math.floor(ringUnits[o + U_Y] / CELL));
        const head = bucketHead.get(key);

        bucketNext[i] = ((head === undefined) ? -1 : head);
        bucketHead.set(key, i);
    }

    let bestSq = Number.POSITIVE_INFINITY;
    let bestA = -1;
    let bestB = -1;

    for(let i = 0; i < count; i++)
    {
        const oi = (base + (i * U_STRIDE));

        if(!isMoving(oi) || !ringUnits[oi + U_OWNED]) continue;

        const cx = Math.floor(ringUnits[oi + U_X] / CELL);
        const cy = Math.floor(ringUnits[oi + U_Y] / CELL);

        for(let ox = -1; ox <= 1; ox++)
        {
            for(let oy = -1; oy <= 1; oy++)
            {
                let j = bucketHead.get(cellKey((cx + ox), (cy + oy)));

                while((j !== undefined) && (j >= 0))
                {
                    if(j > i)
                    {
                        const oj = (base + (j * U_STRIDE));
                        const dx = (ringUnits[oj + U_X] - ringUnits[oi + U_X]);
                        const dy = (ringUnits[oj + U_Y] - ringUnits[oi + U_Y]);
                        const dsq = ((dx * dx) + (dy * dy));

                        if((dsq <= NEAR_SQ) && (dsq < bestSq))
                        {
                            bestSq = dsq;
                            bestA = i;
                            bestB = j;
                        }
                    }

                    j = bucketNext[j];
                }
            }
        }
    }

    if(bestA < 0) return false;

    tracing = true;
    traceId = nextTraceId++;
    rows = 0;
    tail = 0;
    aId = ringUnits[base + (bestA * U_STRIDE) + U_ID];
    bId = ringUnits[base + (bestB * U_STRIDE) + U_ID];

    // replay the pre-roll: oldest ring slot first, skipping the current one and
    // any frame where either unit was absent
    for(let back = (Math.min(ringFilled, PRE_FRAMES) - 1); back >= 1; back--)
    {
        const s = (((ringPos - back) % PRE_FRAMES) + PRE_FRAMES) % PRE_FRAMES;

        emitRow(s, ringCount[s], false);
    }

    return true;
}

// ---- recording ----------------------------------------------------------------

// Copies one ring slot into the trace buffer as a two-unit row. Depth is the
// only value fetched here rather than during sampling, because the geometry
// call allocates - so it is paid for two units, only while tracing.
const emitRow = (slot: number, count: number, live: boolean): void =>
{
    if(rows >= MAX_FRAMES) return;

    const ao = findInSlot(slot, count, aId);
    const bo = findInSlot(slot, count, bId);

    if((ao < 0) || (bo < 0)) return;

    const g = (slot * G_STRIDE);
    const r = (rows * ROW);

    const dx = (ringUnits[bo + U_X] - ringUnits[ao + U_X]);
    const dy = (ringUnits[bo + U_Y] - ringUnits[ao + U_Y]);

    buf[r + G_TRACE] = traceId;
    buf[r + G_FRAME] = ringGlobal[g + G_FRAME];
    buf[r + G_PERF] = ringGlobal[g + G_PERF];
    buf[r + G_TICK] = ringGlobal[g + G_TICK];
    buf[r + G_DT] = ringGlobal[g + G_DT];
    buf[r + G_SRV] = ringGlobal[g + G_SRV];
    buf[r + G_DIST] = Math.sqrt(((dx * dx) + (dy * dy)));
    buf[r + G_HIDDEN] = ringGlobal[g + G_HIDDEN];

    for(let k = 0; k < U_STRIDE; k++)
    {
        buf[r + G_STRIDE + k] = ringUnits[ao + k];
        buf[r + G_STRIDE + U_STRIDE + k] = ringUnits[bo + k];
    }

    if(live)
    {
        // the exact key the canvas sorts units by: geometry.getScreenPosition().z
        const roomEngine = GetRoomEngine();
        const geometry = (roomEngine ? roomEngine.getRoomInstanceGeometry(roomEngine.activeRoomId) : null);

        if(geometry)
        {
            const roomId = roomEngine.activeRoomId;
            const aObject = roomEngine.getRoomObject(roomId, aId, RoomObjectCategory.UNIT);
            const bObject = roomEngine.getRoomObject(roomId, bId, RoomObjectCategory.UNIT);
            const aScreen = (aObject ? geometry.getScreenPosition(aObject.getLocation()) : null);
            const bScreen = (bObject ? geometry.getScreenPosition(bObject.getLocation()) : null);

            buf[r + G_STRIDE + U_DEPTH] = (aScreen ? aScreen.z : NaN);
            buf[r + G_STRIDE + U_STRIDE + U_DEPTH] = (bScreen ? bScreen.z : NaN);
        }
    }

    rows++;
}

// ---- the ticker hook -----------------------------------------------------------

// Negative priority so this runs AFTER the room objects have been updated for
// the frame: the positions read are the ones about to be drawn. It only reads.
const onTick = (): void =>
{
    if(!armed && !tracing) return;

    const tickerNow = GetTickerTime();
    const perfNow = performance.now();
    const slot = ringPos;

    // ONE time sample per frame, shared by both avatars - never a separate
    // performance.now() per unit, which would make their rows incomparable
    const count = sampleFrame(perfNow, tickerNow, slot);

    ringCount[slot] = count;
    ringPos = ((ringPos + 1) % PRE_FRAMES);

    if(ringFilled < PRE_FRAMES) ringFilled++;

    prevTick = tickerNow;
    frameCount++;

    if(tracing)
    {
        const before = rows;

        emitRow(slot, count, true);

        // a unit that vanished mid-trace ends it; what is buffered still counts
        if(rows === before)
        {
            finish();

            return;
        }

        const dist = buf[((rows - 1) * ROW) + G_DIST];

        if(dist > NEAR_TILES) tail++;
        else tail = 0;

        if((tail >= TAIL_FRAMES) || (rows >= MAX_FRAMES)) finish();

        return;
    }

    if(cooldown > 0)
    {
        cooldown--;

        return;
    }

    if((frameCount % SCAN_EVERY) === 0) tryStart(slot, count);
}

// ---- output --------------------------------------------------------------------

const schedule = (fn: () => void): void =>
{
    const idle = (window as any).requestIdleCallback;

    if(typeof idle === 'function') idle(fn, { timeout: 2000 });
    else window.setTimeout(fn, 0);
}

const finish = (): void =>
{
    tracing = false;
    cooldown = COOLDOWN_FRAMES;

    const captured = rows;

    if(capturesLeft > 0) capturesLeft--;

    if(capturesLeft <= 0) armed = false;

    if(!armed) detach();

    // a handful of frames is a brush past, not an interaction
    if(captured < 8) return;

    schedule(() => dump(captured));
}

const len2 = (dx: number, dy: number): number => Math.sqrt(((dx * dx) + (dy * dy)));

const unitVec = (dx: number, dy: number): number[] =>
{
    const l = len2(dx, dy);

    return ((l < 1e-6) ? [ 0, 0 ] : [ (dx / l), (dy / l) ]);
}

const dump = (count: number): void =>
{
    // Everything below - every string, object, ratio and verdict - is built
    // HERE, once, after the event is over. None of it runs per frame.
    const out: any[] = [];

    let maxDt = 0, maxDtAt = 0;
    let maxPhaseErr = 0, maxPhaseErrAt = 0;
    let maxPosErr = 0, maxPosErrAt = 0;
    let maxSpacing = 0, maxSpacingAt = 0;
    let handoffs = 0, nonContiguous = 0, multiSkips = 0;
    let backwards = 0, ownershipLoss = 0, depthSwaps = 0;
    let minDist = Number.POSITIVE_INFINITY, minDistAt = 0;
    let prevDepthOrder = 0;

    for(let i = 0; i < count; i++)
    {
        const r = (i * ROW);
        const p = ((i - 1) * ROW);
        const first = (i === 0);

        const dt = buf[r + G_DT];
        const tickerProgress = (dt / EDGE_MS);
        const dist = buf[r + G_DIST];

        if(dist < minDist)
        {
            minDist = dist;
            minDistAt = i;
        }
        if(!first && (dt > maxDt))
        {
            maxDt = dt;
            maxDtAt = i;
        }

        const row: any = {
            traceId: buf[r + G_TRACE],
            frame: buf[r + G_FRAME],
            perfNow: +buf[r + G_PERF].toFixed(2),
            tickerNow: +buf[r + G_TICK].toFixed(2),
            tickerDelta: +dt.toFixed(2),
            tickerProgress: +tickerProgress.toFixed(5),
            estServerNow: Math.round(buf[r + G_SRV]),
            distance: +dist.toFixed(4),
            hidden: !!buf[r + G_HIDDEN],
            spacingDelta: (first ? 0 : +(dist - buf[p + G_DIST]).toFixed(4))
        };

        for(let u = 0; u < 2; u++)
        {
            const b = (r + G_STRIDE + (u * U_STRIDE));
            const pb = (p + G_STRIDE + (u * U_STRIDE));
            const tag = (u === 0 ? 'a' : 'b');

            const edgeLen = len2((buf[b + U_TX] - buf[b + U_FX]), (buf[b + U_TY] - buf[b + U_FY]));
            const prevEdgeLen = (first ? NaN : len2((buf[pb + U_TX] - buf[pb + U_FX]), (buf[pb + U_TY] - buf[pb + U_FY])));
            const edgeSteps = (first ? 0 : (buf[b + U_EDGE] - buf[pb + U_EDGE]));
            const changed = (edgeSteps !== 0);

            const moved = (first ? 0 : len2((buf[b + U_X] - buf[pb + U_X]), (buf[b + U_Y] - buf[pb + U_Y])));

            // AN EDGE BOUNDARY IS NOT BACKWARDS PROGRESS. phase 0.99 -> 0.02
            // across a boundary is a full edge completed plus a sliver of the
            // next, so phaseDelta/phaseError are same-edge-only quantities and
            // the boundary is measured in distance instead.
            let phaseDelta = NaN;
            let phaseError = NaN;
            let expected = NaN;
            let contiguity: any = null;

            if(!first)
            {
                if(!changed)
                {
                    phaseDelta = (buf[b + U_PHASE] - buf[pb + U_PHASE]);
                    phaseError = (phaseDelta - tickerProgress);
                    expected = (phaseDelta * edgeLen);
                }
                else if(edgeSteps > 0)
                {
                    // remaining on the old edge + whole skipped edges + progress
                    // into the new one
                    expected = (((1 - buf[pb + U_PHASE]) * prevEdgeLen) + buf[b + U_SKIPLEN] + (buf[b + U_PHASE] * edgeLen));
                    handoffs++;

                    if(edgeSteps === 1)
                    {
                        // adjacency only means anything between neighbours; a
                        // multi-edge skip is a long frame, NOT broken geometry
                        const gap = len2((buf[b + U_FX] - buf[pb + U_TX]), (buf[b + U_FY] - buf[pb + U_TY]));

                        contiguity = +gap.toFixed(4);

                        if(gap > T_CONTIGUITY) nonContiguous++;
                    }
                    else
                    {
                        multiSkips++;
                        contiguity = 'multi-edge skip';
                    }
                }
            }

            const posError = ((first || Number.isNaN(expected)) ? NaN : (moved - expected));

            if(!first && !changed && !Number.isNaN(phaseError) && (Math.abs(phaseError) > Math.abs(maxPhaseErr)))
            {
                maxPhaseErr = phaseError;
                maxPhaseErrAt = i;
            }

            if(!Number.isNaN(posError) && (Math.abs(posError) > Math.abs(maxPosErr)))
            {
                maxPosErr = posError;
                maxPosErrAt = i;
            }

            // real regression: same walk, same revision, same edge, phase down
            if(!first && !changed
                && (buf[b + U_SESSION] === buf[pb + U_SESSION])
                && (buf[b + U_REVISION] === buf[pb + U_REVISION])
                && (phaseDelta < -T_BACKWARDS)) backwards++;

            if(!first && buf[pb + U_OWNED] && !buf[b + U_OWNED]) ownershipLoss++;

            row[tag] = {
                unitId: buf[b + U_ID],
                walkSessionId: buf[b + U_SESSION],
                routeRevision: buf[b + U_REVISION],
                edgeIndex: buf[b + U_EDGE],
                previousEdgeIndex: (first ? null : buf[pb + U_EDGE]),
                edgeChanged: changed,
                edgeSteps,
                cycleStart: buf[b + U_CYCLE],
                gridPhase: ((((buf[b + U_CYCLE] % EDGE_MS) + EDGE_MS) % EDGE_MS)),
                phase: +buf[b + U_PHASE].toFixed(5),
                previousPhase: (first ? null : +buf[pb + U_PHASE].toFixed(5)),
                phaseDelta: (Number.isNaN(phaseDelta) ? null : +phaseDelta.toFixed(5)),
                phaseError: (Number.isNaN(phaseError) ? null : +phaseError.toFixed(5)),
                x: +buf[b + U_X].toFixed(4), y: +buf[b + U_Y].toFixed(4), z: +buf[b + U_Z].toFixed(4),
                previousX: (first ? null : +buf[pb + U_X].toFixed(4)),
                previousY: (first ? null : +buf[pb + U_Y].toFixed(4)),
                previousZ: (first ? null : +buf[pb + U_Z].toFixed(4)),
                edgeFromX: buf[b + U_FX], edgeFromY: buf[b + U_FY], edgeFromZ: buf[b + U_FZ],
                edgeToX: buf[b + U_TX], edgeToY: buf[b + U_TY], edgeToZ: buf[b + U_TZ],
                edgeLength: +edgeLen.toFixed(4),
                direction: buf[b + U_DIR],
                v2OwnsXYZ: !!buf[b + U_OWNED],
                pendingHold: !!buf[b + U_HOLD],
                depth: (Number.isNaN(buf[b + U_DEPTH]) ? null : +buf[b + U_DEPTH].toFixed(5)),
                positionDeltaTiles: +moved.toFixed(5),
                expectedSpatialDelta: (Number.isNaN(expected) ? null : +expected.toFixed(5)),
                positionError: (Number.isNaN(posError) ? null : +posError.toFixed(5)),
                edgeContiguityGap: contiguity
            };
        }

        // Spacing change is only an anomaly when GEOMETRY does not explain it.
        // Two avatars on different edge geometry - one diagonal at sqrt(2) per
        // 500ms, one orthogonal at 1 - legitimately change spacing, and so does
        // a corner. What is left after subtracting the difference in their
        // expected advance is the part that needs explaining.
        let unexplained = 0;

        if(i > 0)
        {
            const ea = row.a.expectedSpatialDelta;
            const eb = row.b.expectedSpatialDelta;
            const geometryDelta = (((ea === null) || (eb === null)) ? 0 : Math.abs(ea - eb));

            unexplained = Math.max(0, (Math.abs(row.spacingDelta) - geometryDelta));

            if(unexplained > maxSpacing)
            {
                maxSpacing = unexplained;
                maxSpacingAt = i;
            }
        }

        row.unexplainedSpacingChange = +unexplained.toFixed(5);

        const order = ((row.a.depth === null || row.b.depth === null) ? 0 : (row.a.depth < row.b.depth ? -1 : 1));

        row.depthOrder = order;

        if(order && prevDepthOrder && (order !== prevDepthOrder))
        {
            depthSwaps++;
            row.depthOrderChanged = true;
        }

        if(order) prevDepthOrder = order;

        out.push(row);
    }

    // ---- interaction type, judged at closest approach ------------------------

    const f = 0;
    const l = ((count - 1) * ROW);
    const m = (minDistAt * ROW);

    const dirA = unitVec((buf[l + G_STRIDE + U_X] - buf[f + G_STRIDE + U_X]), (buf[l + G_STRIDE + U_Y] - buf[f + G_STRIDE + U_Y]));
    const dirB = unitVec((buf[l + G_STRIDE + U_STRIDE + U_X] - buf[f + G_STRIDE + U_STRIDE + U_X]), (buf[l + G_STRIDE + U_STRIDE + U_Y] - buf[f + G_STRIDE + U_STRIDE + U_Y]));
    const heading = ((dirA[0] * dirB[0]) + (dirA[1] * dirB[1]));

    const sep0 = unitVec((buf[f + G_STRIDE + U_STRIDE + U_X] - buf[f + G_STRIDE + U_X]), (buf[f + G_STRIDE + U_STRIDE + U_Y] - buf[f + G_STRIDE + U_Y]));
    const sepN = unitVec((buf[l + G_STRIDE + U_STRIDE + U_X] - buf[l + G_STRIDE + U_X]), (buf[l + G_STRIDE + U_STRIDE + U_Y] - buf[l + G_STRIDE + U_Y]));
    const sepM = unitVec((buf[m + G_STRIDE + U_STRIDE + U_X] - buf[m + G_STRIDE + U_X]), (buf[m + G_STRIDE + U_STRIDE + U_Y] - buf[m + G_STRIDE + U_Y]));
    const sepFlip = ((sep0[0] * sepN[0]) + (sep0[1] * sepN[1]));

    // measured at closest approach: the capture deliberately runs on past
    // separation, so the final gap describes them walking away, not the event
    const align = Math.abs(((sepM[0] * dirA[0]) + (sepM[1] * dirA[1])));

    let interactionType = 'UNKNOWN';

    if((heading > 0.7) && (align > 0.7)) interactionType = 'FOLLOWING';
    else if((heading > 0.7) && (align < 0.45)) interactionType = 'SIDE_BY_SIDE';
    else if((sepFlip < 0) && (minDist < 1.5)) interactionType = 'CROSSING';
    else if((heading < -0.5) && (buf[l + G_DIST] < buf[f + G_DIST])) interactionType = 'APPROACHING';
    else if(sepFlip < 0) interactionType = 'CROSSING';

    const gridA = ((((buf[l + G_STRIDE + U_CYCLE] % EDGE_MS) + EDGE_MS) % EDGE_MS));
    const gridB = ((((buf[l + G_STRIDE + U_STRIDE + U_CYCLE] % EDGE_MS) + EDGE_MS) % EDGE_MS));

    const summary: any = {
        traceId: buf[G_TRACE],
        interactionType,
        unitA: aId,
        unitB: bId,
        frames: count,
        preRollFrames: Math.min(PRE_FRAMES - 1, count),
        durationMs: Math.round((buf[l + G_TICK] - buf[G_TICK])),
        minDistance: +minDist.toFixed(4),
        minDistanceAtFrame: minDistAt,

        maxTickerDeltaMs: +maxDt.toFixed(2),
        maxTickerDeltaAtFrame: maxDtAt,

        maxSameEdgePhaseError: +maxPhaseErr.toFixed(5),
        maxSameEdgePhaseErrorAtFrame: maxPhaseErrAt,

        maxPositionError: +maxPosErr.toFixed(5),
        maxPositionErrorAtFrame: maxPosErrAt,

        maxUnexplainedSpacingChange: +maxSpacing.toFixed(5),
        maxUnexplainedSpacingAtFrame: maxSpacingAt,

        edgeHandoffCount: handoffs,
        nonContiguousHandoffCount: nonContiguous,
        multiEdgeSkipCount: multiSkips,
        backwardsProgressCount: backwards,
        ownershipLossCount: ownershipLoss,
        depthOrderChangeCount: depthSwaps,

        gridPhaseA: gridA,
        gridPhaseB: gridB,
        gridsMatch: (gridA === gridB),
        headingDot: +heading.toFixed(3),
        separationAlignment: +align.toFixed(3),
        anyFrameHidden: out.some(r => r.hidden)
    };

    if(interactionType === 'FOLLOWING')
    {
        const projA = ((buf[m + G_STRIDE + U_X] * dirA[0]) + (buf[m + G_STRIDE + U_Y] * dirA[1]));
        const projB = ((buf[m + G_STRIDE + U_STRIDE + U_X] * dirA[0]) + (buf[m + G_STRIDE + U_STRIDE + U_Y] * dirA[1]));
        const leaderIsA = (projA >= projB);
        const w = out[maxSpacingAt];

        summary.following = {
            leaderUnit: (leaderIsA ? aId : bId),
            followerUnit: (leaderIsA ? bId : aId),
            worstFrame: maxSpacingAt,
            leaderEdgeIndex: (leaderIsA ? w.a.edgeIndex : w.b.edgeIndex),
            followerEdgeIndex: (leaderIsA ? w.b.edgeIndex : w.a.edgeIndex),
            leaderPhase: (leaderIsA ? w.a.phase : w.b.phase),
            followerPhase: (leaderIsA ? w.b.phase : w.a.phase),
            phaseDifference: +Math.abs(w.a.phase - w.b.phase).toFixed(5),
            distance: w.distance,
            spacingChange: w.spacingDelta,
            unexplainedSpacingChange: w.unexplainedSpacingChange,
            samePhaseGrid: (gridA === gridB),
            edgeBoundaryThisFrame: (w.a.edgeChanged || w.b.edgeChanged),
            spacingHeld: (maxSpacing < T_SPACING)
        };
    }

    // ---- verdicts, each tied to the evidence above ---------------------------

    const verdicts: string[] = [];

    if((Math.abs(maxPhaseErr) > T_PHASE_ERROR) || backwards) verdicts.push('MOVEMENT_TIMING_ANOMALY');
    if(maxDt > T_LONG_FRAME_MS) verdicts.push('FRAME_HITCH');
    if(nonContiguous > 0) verdicts.push('EDGE_HANDOFF_ANOMALY');
    if(maxSpacing > T_SPACING) verdicts.push('FOLLOWING_SPACING_ANOMALY');
    if(Math.abs(maxPosErr) > T_POSITION_ERROR) verdicts.push('MOVEMENT_TIMING_ANOMALY');

    // the question the eye cannot answer: did the worst measured moment land on
    // the frame the draw order flipped?
    const worstAt = [ maxDtAt, maxPhaseErrAt, maxPosErrAt, maxSpacingAt ];
    let orderCorrelated = false;

    for(let i = 0; i < out.length; i++)
    {
        if(!out[i].depthOrderChanged) continue;

        for(let k = 0; k < worstAt.length; k++)
        {
            if(Math.abs(worstAt[k] - i) <= 2) orderCorrelated = true;
        }
    }

    if(orderCorrelated) verdicts.push('RENDER_ORDER_CORRELATION');

    const unique = verdicts.filter((v, i) => (verdicts.indexOf(v) === i));

    if(!unique.length) unique.push('NO_MEASURABLE_MOVEMENT_ANOMALY');

    summary.verdicts = unique;

    const payload = { summary, rows: out };

    events.push(payload);

    const publish = (target: any) =>
    {
        if(!target || !target.pixelrpProximityTrace) return;

        target.pixelrpProximityTrace.last = payload;
        target.pixelrpProximityTrace.all = events;
    };

    publish(window);

    try
    {
        if(window.parent && (window.parent !== window)) publish(window.parent);
    }
    catch (e)
    {
        // cross-origin parent - the in-frame handle still holds it
    }

    console.log('[MV2/PROXIMITY-TRACE]', summary, payload.rows);
}

// ---- arming --------------------------------------------------------------------

let attached = false;

const attach = (): void =>
{
    if(attached) return;

    const ticker = GetTicker();

    if(!ticker) return;

    ticker.add(onTick, null, -50);
    attached = true;
}

const detach = (): void =>
{
    if(!attached) return;

    const ticker = GetTicker();

    if(ticker) ticker.remove(onTick, null);

    attached = false;
}

export const ArmProximityTrace = (on = true, captures = 3): string =>
{
    armed = !!on;
    capturesLeft = (armed ? Math.max(1, captures) : 0);
    tracing = false;
    rows = 0;
    cooldown = 0;
    frameCount = 0;
    ringPos = 0;
    ringFilled = 0;
    prevTick = NaN;
    lastEdgeOf.clear();

    if(armed)
    {
        events.length = 0;
        attach();
    }
    else detach();

    return (armed
        ? '[MV2/PROXIMITY-TRACE] armed for ' + capturesLeft + ' event(s). Two real players, both walking, within ' + NEAR_TILES + ' tiles - it keeps ' + PRE_FRAMES + ' frames of run-up and dumps itself once they separate.'
        : '[MV2/PROXIMITY-TRACE] disarmed.');
}

// Installed on the iframe AND its parent: the client is served inside
// <iframe id="nitro">, and DevTools evaluates against the top frame by default,
// where an in-frame-only handle is a ReferenceError - the reason an earlier
// diagnostic could never be switched on.
export const InstallProximityTrace = (): void =>
{
    if(typeof window === 'undefined') return;

    const install = (target: any) =>
    {
        const handle: any = (on = true, captures = 3) =>
        {
            const message = ArmProximityTrace(on, captures);

            console.info(message);

            return message;
        };

        handle.last = null;
        handle.all = [];

        target.pixelrpProximityTrace = handle;
        // the previous name, kept so it still answers rather than throwing
        target.pixelrpCrossingTrace = handle;
    };

    install(window);

    try
    {
        if(window.parent && (window.parent !== window)) install(window.parent);
    }
    catch (e)
    {
        // cross-origin parent - the in-frame handle still works
    }
}
