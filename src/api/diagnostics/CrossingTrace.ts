import { GetTicker, GetTickerTime, RoomObjectCategory, RoomObjectType } from '@nitrots/nitro-renderer';
import { GetRoomEngine } from '../nitro/room/GetRoomEngine';
import { GetRoomSessionManager } from '../nitro/session/GetRoomSessionManager';

// ---------------------------------------------------------------------------
// BUFFERED CROSSING TRACE - diagnostics only, OFF unless armed.
//
// Why buffered. The last round of movement forensics logged from the render
// path and the logging WAS the bug: ~280 console calls per walk per avatar,
// each holding an object DevTools retains and symbolises, stalled the main
// thread long enough to skip whole edges - so the instrument manufactured the
// very hitch it was pointed at. Nothing here writes to the console while a
// capture is running. Every per-frame value is a primitive number written into
// a preallocated Float64Array; there is no string building, no stack capture,
// no object allocation and nothing cloned out of Nitro. One dump happens after
// the interaction has finished, deferred to an idle callback.
//
// Why it touches no movement code. It reads the V2 store through the handle
// the store already publishes on window, and it reads positions off the room
// objects. It never calls getActive(), because getActive() has side effects -
// it bumps stats and can drop a stale unit - and a diagnostic must not be able
// to change what it is measuring. The edge/phase maths below is therefore a
// READ-ONLY mirror of getActive's, used only for reporting; the rendered
// position recorded alongside it is the ground truth the eye sees, so if the
// mirror ever drifts, the two columns disagree and say so.
//
// Cost when disarmed: none. The ticker callback is not even registered.
//
//     pixelrpCrossingTrace()          arm, capture up to 3 interactions
//     pixelrpCrossingTrace(true, 10)  arm, capture up to 10
//     pixelrpCrossingTrace(false)     disarm
//     pixelrpCrossingTrace.last       the last capture, summary and rows
// ---------------------------------------------------------------------------

const NEAR_TILES = 2;
const NEAR_SQ = (NEAR_TILES * NEAR_TILES);

// keep recording after they separate, so the frames where a hitch would show
// as the pair pulls apart are inside the capture rather than just past its end
const TAIL_FRAMES = 18;

// 720 frames is ~12s at 60fps - longer than any crossing, and a hard stop so a
// pair that walks together across the whole room cannot grow the buffer
const MAX_FRAMES = 720;
const STRIDE = 18;

// units sampled per frame; the scratch arrays are fixed, so anything past this
// is simply not sampled rather than allocating mid-frame
const MAX_UNITS = 64;

// while idle, look for a pair this often, in frames. The search is O(n) via a
// 2-tile spatial hash, NOT a pairwise sweep - this stays a diagnostic and never
// becomes an every-frame O(n^2) proximity system.
const SCAN_EVERY = 6;

// after a capture, wait before the same pair can trigger another
const COOLDOWN_FRAMES = 90;

const CELL = 2;
const KEY_BASE = 4096;
const KEY_OFFSET = 512;

// row layout, as indexes into the frame buffer
const R_T = 0, R_DT = 1;
const R_AX = 2, R_AY = 3, R_APHASE = 4, R_AEDGE = 5, R_ACYCLE = 6;
const R_BX = 7, R_BY = 8, R_BPHASE = 9, R_BEDGE = 10, R_BCYCLE = 11;
const R_DIST = 12, R_AEDGECH = 13, R_BEDGECH = 14;
const R_ASTEP = 15, R_BSTEP = 16, R_SPACING_D = 17;

// ---- scratch, reused every frame, never reallocated ------------------------

const sId = new Int32Array(MAX_UNITS);
const sX = new Float64Array(MAX_UNITS);
const sY = new Float64Array(MAX_UNITS);
const sPhase = new Float64Array(MAX_UNITS);
const sEdge = new Int32Array(MAX_UNITS);
const sCycle = new Float64Array(MAX_UNITS);
const sMoving = new Uint8Array(MAX_UNITS);
const bucketNext = new Int32Array(MAX_UNITS);
const bucketHead: Map<number, number> = new Map();
let sCount = 0;

const buf = new Float64Array(MAX_FRAMES * STRIDE);

// ---- state -----------------------------------------------------------------

let armed = false;
let capturesLeft = 0;
let frameCount = 0;
let cooldown = 0;

let tracing = false;
let rows = 0;
let aId = 0;
let bId = 0;
let tail = 0;
let prevT = NaN;
let prevDist = NaN;
let prevAEdge = -1;
let prevBEdge = -1;
let prevAX = NaN, prevAY = NaN, prevBX = NaN, prevBY = NaN;

const cellKey = (cx: number, cy: number): number => (((cx + KEY_OFFSET) * KEY_BASE) + (cy + KEY_OFFSET));

// ---- sampling ---------------------------------------------------------------

// Fill the scratch with this frame's real, moving, V2-owned players. Everything
// read is a number already held by the store or the room object; nothing is
// copied out by reference and nothing is allocated per unit.
const collect = (now: number): void =>
{
    sCount = 0;

    const store = (window as any).pixelrpMovementV2;

    if(!store || !store.hasClock) return;

    const units: Map<number, any> = store._units;

    if(!units || !units.size) return;

    const roomEngine = GetRoomEngine();

    if(!roomEngine) return;

    const roomId = roomEngine.activeRoomId;
    const session = GetRoomSessionManager()?.getSession(roomId);

    if(!session) return;

    const estServerNow = (now - store.clockOffset);

    units.forEach((unit, id) =>
    {
        if(sCount >= MAX_UNITS) return;

        const edges = unit.edges;

        if(!edges || !edges.length) return;

        // real players only - bots patrol and pets wander, and either would sit
        // in the trace looking exactly like the thing being hunted
        const userData = session.userDataManager.getUserDataByIndex(id);

        if(!userData || (userData.type !== RoomObjectType.USER)) return;

        // read-only mirror of getActive's edge choice, including its pending
        // hold: nothing started yet means the earliest edge, pinned at phase 0
        let edge = null;
        let phase = 0;

        for(let i = (edges.length - 1); i >= 0; i--)
        {
            if(edges[i].cycleStart <= estServerNow) { edge = edges[i]; break; }
        }

        if(!edge) edge = edges[0];
        else phase = Math.min(1, Math.max(0, ((estServerNow - edge.cycleStart) / edge.interval)));

        if(!edge) return;

        // the position actually on screen, not the one this file recomputed
        const roomObject = roomEngine.getRoomObject(roomId, id, RoomObjectCategory.UNIT);
        const location = (roomObject ? roomObject.getLocation() : null);

        sId[sCount] = id;
        sX[sCount] = (location ? location.x : (edge.sx + ((edge.gx - edge.sx) * phase)));
        sY[sCount] = (location ? location.y : (edge.sy + ((edge.gy - edge.sy) * phase)));
        sPhase[sCount] = phase;
        sEdge[sCount] = edge.edgeIndex;
        sCycle[sCount] = edge.cycleStart;
        sMoving[sCount] = ((((edge.sx !== edge.gx) || (edge.sy !== edge.gy)) && (phase < 1)) ? 1 : 0);
        sCount++;
    });
}

const indexOfUnit = (id: number): number =>
{
    for(let i = 0; i < sCount; i++) if(sId[i] === id) return i;

    return -1;
}

// ---- pair search, O(n) through a 2-tile spatial hash -----------------------

const tryStartTrace = (): void =>
{
    bucketHead.clear();

    for(let i = 0; i < sCount; i++)
    {
        if(!sMoving[i]) continue;

        const key = cellKey(Math.floor(sX[i] / CELL), Math.floor(sY[i] / CELL));
        const head = bucketHead.get(key);

        bucketNext[i] = ((head === undefined) ? -1 : head);
        bucketHead.set(key, i);
    }

    let bestSq = Number.POSITIVE_INFINITY;
    let bestA = -1;
    let bestB = -1;

    for(let i = 0; i < sCount; i++)
    {
        if(!sMoving[i]) continue;

        const cx = Math.floor(sX[i] / CELL);
        const cy = Math.floor(sY[i] / CELL);

        for(let ox = -1; ox <= 1; ox++)
        {
            for(let oy = -1; oy <= 1; oy++)
            {
                let j = bucketHead.get(cellKey((cx + ox), (cy + oy)));

                while((j !== undefined) && (j >= 0))
                {
                    // j > i visits each pair exactly once
                    if(j > i)
                    {
                        const dx = (sX[j] - sX[i]);
                        const dy = (sY[j] - sY[i]);
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

    if(bestA < 0) return;

    tracing = true;
    rows = 0;
    tail = 0;
    aId = sId[bestA];
    bId = sId[bestB];
    prevT = NaN;
    prevDist = NaN;
    prevAEdge = -1;
    prevBEdge = -1;
    prevAX = NaN; prevAY = NaN; prevBX = NaN; prevBY = NaN;
}

// ---- recording ---------------------------------------------------------------

const recordFrame = (now: number): void =>
{
    const ai = indexOfUnit(aId);
    const bi = indexOfUnit(bId);

    // one of them stopped, left, or was dropped by the store: that ends the
    // interaction, and what is already buffered is still worth reading
    if((ai < 0) || (bi < 0))
    {
        finish();

        return;
    }

    const ax = sX[ai], ay = sY[ai];
    const bx = sX[bi], by = sY[bi];
    const dx = (bx - ax), dy = (by - ay);
    const dist = Math.sqrt((dx * dx) + (dy * dy));

    const o = (rows * STRIDE);

    buf[o + R_T] = now;
    buf[o + R_DT] = (Number.isNaN(prevT) ? 0 : (now - prevT));
    buf[o + R_AX] = ax;
    buf[o + R_AY] = ay;
    buf[o + R_APHASE] = sPhase[ai];
    buf[o + R_AEDGE] = sEdge[ai];
    buf[o + R_ACYCLE] = sCycle[ai];
    buf[o + R_BX] = bx;
    buf[o + R_BY] = by;
    buf[o + R_BPHASE] = sPhase[bi];
    buf[o + R_BEDGE] = sEdge[bi];
    buf[o + R_BCYCLE] = sCycle[bi];
    buf[o + R_DIST] = dist;
    buf[o + R_AEDGECH] = (((prevAEdge >= 0) && (sEdge[ai] !== prevAEdge)) ? 1 : 0);
    buf[o + R_BEDGECH] = (((prevBEdge >= 0) && (sEdge[bi] !== prevBEdge)) ? 1 : 0);
    buf[o + R_ASTEP] = (Number.isNaN(prevAX) ? 0 : Math.sqrt((((ax - prevAX) * (ax - prevAX)) + ((ay - prevAY) * (ay - prevAY)))));
    buf[o + R_BSTEP] = (Number.isNaN(prevBX) ? 0 : Math.sqrt((((bx - prevBX) * (bx - prevBX)) + ((by - prevBY) * (by - prevBY)))));
    buf[o + R_SPACING_D] = (Number.isNaN(prevDist) ? 0 : (dist - prevDist));

    rows++;

    prevT = now;
    prevDist = dist;
    prevAEdge = sEdge[ai];
    prevBEdge = sEdge[bi];
    prevAX = ax; prevAY = ay; prevBX = bx; prevBY = by;

    if(dist > NEAR_TILES) tail++;
    else tail = 0;

    if((tail >= TAIL_FRAMES) || (rows >= MAX_FRAMES)) finish();
}

// ---- the one dump, deferred --------------------------------------------------

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

    // fewer than a handful of frames is a brush past, not an interaction
    if(captured < 6) return;

    schedule(() => dump(captured));
}

const unitVector = (dx: number, dy: number): number[] =>
{
    const length = Math.sqrt(((dx * dx) + (dy * dy)));

    return ((length < 1e-6) ? [ 0, 0 ] : [ (dx / length), (dy / length) ]);
}

const dump = (count: number): void =>
{
    // Every string, object and derived number below is built HERE, once, after
    // the interaction is over - never while it is being recorded.
    const rowsOut: any[] = [];

    for(let i = 0; i < count; i++)
    {
        const o = (i * STRIDE);

        rowsOut.push({
            t: Math.round(buf[o + R_T]),
            dt: +buf[o + R_DT].toFixed(2),
            aX: +buf[o + R_AX].toFixed(4), aY: +buf[o + R_AY].toFixed(4),
            aEdge: buf[o + R_AEDGE], aPhase: +buf[o + R_APHASE].toFixed(4),
            bX: +buf[o + R_BX].toFixed(4), bY: +buf[o + R_BY].toFixed(4),
            bEdge: buf[o + R_BEDGE], bPhase: +buf[o + R_BPHASE].toFixed(4),
            dist: +buf[o + R_DIST].toFixed(4),
            phaseDiff: +Math.abs((buf[o + R_APHASE] - buf[o + R_BPHASE])).toFixed(4),
            spacingDelta: +buf[o + R_SPACING_D].toFixed(4),
            aStep: +buf[o + R_ASTEP].toFixed(4), bStep: +buf[o + R_BSTEP].toFixed(4),
            edgeChange: (((buf[o + R_AEDGECH] ? 'A' : '') + (buf[o + R_BEDGECH] ? 'B' : '')) || '-')
        });
    }

    const first = 0;
    const last = ((count - 1) * STRIDE);

    const dirA = unitVector((buf[last + R_AX] - buf[first + R_AX]), (buf[last + R_AY] - buf[first + R_AY]));
    const dirB = unitVector((buf[last + R_BX] - buf[first + R_BX]), (buf[last + R_BY] - buf[first + R_BY]));
    const heading = ((dirA[0] * dirB[0]) + (dirA[1] * dirB[1]));

    // the gap at the start and at the end; if it flipped sign, they passed
    const sep0 = unitVector((buf[first + R_BX] - buf[first + R_AX]), (buf[first + R_BY] - buf[first + R_AY]));
    const sepN = unitVector((buf[last + R_BX] - buf[last + R_AX]), (buf[last + R_BY] - buf[last + R_AY]));
    const sepFlip = ((sep0[0] * sepN[0]) + (sep0[1] * sepN[1]));

    let minDist = Number.POSITIVE_INFINITY;
    let minAt = 0;
    let maxDt = 0;
    let maxPhaseDiff = 0;
    let maxSpacingDelta = 0;
    let maxSpacingAt = 0;
    let maxStepDiff = 0;
    let aTravel = 0;
    let bTravel = 0;
    let edgeBoundaryFrames = 0;

    for(let i = 0; i < count; i++)
    {
        const o = (i * STRIDE);
        const d = buf[o + R_DIST];

        if(d < minDist)
        {
            minDist = d;
            minAt = i;
        }
        if(buf[o + R_DT] > maxDt) maxDt = buf[o + R_DT];

        const pd = Math.abs((buf[o + R_APHASE] - buf[o + R_BPHASE]));

        if(pd > maxPhaseDiff) maxPhaseDiff = pd;

        const sd = Math.abs(buf[o + R_SPACING_D]);

        if(sd > maxSpacingDelta)
        {
            maxSpacingDelta = sd;
            maxSpacingAt = i;
        }

        const stepDiff = Math.abs((buf[o + R_ASTEP] - buf[o + R_BSTEP]));

        if(stepDiff > maxStepDiff) maxStepDiff = stepDiff;

        aTravel += buf[o + R_ASTEP];
        bTravel += buf[o + R_BSTEP];

        if(buf[o + R_AEDGECH] || buf[o + R_BEDGECH]) edgeBoundaryFrames++;
    }

    // How the gap sits against the direction of travel: along it means one is
    // behind the other, across it means they are abreast. Measured at CLOSEST
    // APPROACH, not at the last frame - the capture deliberately runs on for
    // TAIL_FRAMES after they separate, so the final gap describes them walking
    // away from each other rather than the interaction being classified.
    const minOffset = (minAt * STRIDE);
    const sepMin = unitVector((buf[minOffset + R_BX] - buf[minOffset + R_AX]), (buf[minOffset + R_BY] - buf[minOffset + R_AY]));
    const align = Math.abs(((sepMin[0] * dirA[0]) + (sepMin[1] * dirA[1])));

    let interactionType = 'UNKNOWN';

    if((heading > 0.7) && (align > 0.7)) interactionType = 'FOLLOWING';
    else if((heading > 0.7) && (align < 0.45)) interactionType = 'SIDE_BY_SIDE';
    else if((sepFlip < 0) && (minDist < 1.5)) interactionType = 'CROSSING';
    else if((heading < -0.5) && (buf[last + R_DIST] < buf[first + R_DIST])) interactionType = 'APPROACHING';
    else if(sepFlip < 0) interactionType = 'CROSSING';

    const gridPhaseA = ((((buf[last + R_ACYCLE] % 500) + 500) % 500));
    const gridPhaseB = ((((buf[last + R_BCYCLE] % 500) + 500) % 500));

    const summary: any = {
        interactionType,
        unitA: aId,
        unitB: bId,
        frames: count,
        durationMs: Math.round((buf[last + R_T] - buf[first + R_T])),
        minDistance: +minDist.toFixed(4),
        minDistanceAtFrame: minAt,

        // the invariant: on a shared 500ms grid, spacing should hold
        maxPhaseDifference: +maxPhaseDiff.toFixed(4),
        maxSpacingChangePerFrame: +maxSpacingDelta.toFixed(4),
        maxSpacingChangeAtFrame: maxSpacingAt,
        spacingChangedAtEdgeBoundary: !!(buf[((maxSpacingAt * STRIDE) + R_AEDGECH)] || buf[((maxSpacingAt * STRIDE) + R_BEDGECH)]),
        edgeBoundaryFrames,

        // a long frame is the client stalling, not the movement maths
        maxTickerDeltaMs: +maxDt.toFixed(2),
        longFrame: (maxDt > 25),

        // did they genuinely travel at different speeds, or only look like it
        maxPerFrameStepDifference: +maxStepDiff.toFixed(4),
        totalTravelA: +aTravel.toFixed(3),
        totalTravelB: +bTravel.toFixed(3),
        travelDifference: +Math.abs((aTravel - bTravel)).toFixed(3),

        gridPhaseA,
        gridPhaseB,
        gridsMatch: (gridPhaseA === gridPhaseB),
        headingDot: +heading.toFixed(3),
        separationAlignment: +align.toFixed(3)
    };

    if(interactionType === 'FOLLOWING')
    {
        // whoever is further along the shared direction of travel is in front
        const projA = ((buf[minOffset + R_AX] * dirA[0]) + (buf[minOffset + R_AY] * dirA[1]));
        const projB = ((buf[minOffset + R_BX] * dirA[0]) + (buf[minOffset + R_BY] * dirA[1]));
        const leaderIsA = (projA >= projB);
        const w = (maxSpacingAt * STRIDE);

        summary.following = {
            leaderUnit: (leaderIsA ? aId : bId),
            followerUnit: (leaderIsA ? bId : aId),
            atFrame: maxSpacingAt,
            leaderEdgeIndex: (leaderIsA ? buf[w + R_AEDGE] : buf[w + R_BEDGE]),
            followerEdgeIndex: (leaderIsA ? buf[w + R_BEDGE] : buf[w + R_AEDGE]),
            leaderPhase: +(leaderIsA ? buf[w + R_APHASE] : buf[w + R_BPHASE]).toFixed(4),
            followerPhase: +(leaderIsA ? buf[w + R_BPHASE] : buf[w + R_APHASE]).toFixed(4),
            phaseDifference: +Math.abs((buf[w + R_APHASE] - buf[w + R_BPHASE])).toFixed(4),
            distance: +buf[w + R_DIST].toFixed(4),
            sameDirection: (heading > 0.7),
            gridsMatch: (gridPhaseA === gridPhaseB),
            edgeChangedThisFrame: (((buf[w + R_AEDGECH] ? 'A' : '') + (buf[w + R_BEDGECH] ? 'B' : '')) || 'neither'),
            spacingHeld: (maxSpacingDelta < 0.02)
        };
    }

    const payload = { summary, rows: rowsOut };
    const handle = (window as any).pixelrpCrossingTrace;

    if(handle) handle.last = payload;

    try
    {
        const parentHandle = ((window.parent && (window.parent !== window)) ? (window.parent as any).pixelrpCrossingTrace : null);

        if(parentHandle) parentHandle.last = payload;
    }
    catch (e)
    {
        // cross-origin parent - the in-frame handle still holds it
    }

    console.log('[MV2/crossing]', summary, count + ' frames buffered - read pixelrpCrossingTrace.last.rows for the full trace');
}

// ---- the ticker hook ---------------------------------------------------------

// Negative priority so this runs AFTER the room objects have been updated for
// the frame: the positions read are the ones about to be drawn, not the
// previous frame's. It only ever reads.
const onTick = (): void =>
{
    if(!armed && !tracing) return;

    const now = GetTickerTime();

    collect(now);

    if(tracing)
    {
        recordFrame(now);

        return;
    }

    if(cooldown > 0)
    {
        cooldown--;

        return;
    }

    frameCount++;

    if((frameCount % SCAN_EVERY) === 0) tryStartTrace();
}

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

export const ArmCrossingTrace = (on = true, captures = 3): string =>
{
    armed = !!on;
    capturesLeft = (armed ? Math.max(1, captures) : 0);
    tracing = false;
    rows = 0;
    cooldown = 0;
    frameCount = 0;

    if(armed) attach();
    else detach();

    return (armed
        ? '[MV2/crossing] armed for ' + capturesLeft + ' interaction(s). Walk two real players within ' + NEAR_TILES + ' tiles of each other; the trace dumps itself once they separate.'
        : '[MV2/crossing] disarmed.');
}

// Installed on the iframe AND its parent: the client is served inside
// <iframe id="nitro">, and DevTools evaluates against the top frame by
// default, where an in-frame-only handle is a ReferenceError.
export const InstallCrossingTrace = (): void =>
{
    if(typeof window === 'undefined') return;

    const install = (target: any) =>
    {
        const handle: any = (on = true, captures = 3) =>
        {
            const message = ArmCrossingTrace(on, captures);

            console.info(message);

            return message;
        };

        handle.last = null;
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
