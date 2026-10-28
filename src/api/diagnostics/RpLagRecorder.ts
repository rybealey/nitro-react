import { AvatarImage, ExtendedSprite, FurnitureFloorEvent, GetTicker, IMessageComposer, LoadScale, LoadStats, MouseEventType, RoomEngineEvent, RoomObjectCategory, RoomReadyMessageEvent, RoomSpriteCanvas, SocketConnection, TextureUtils } from '@nitrots/nitro-renderer';
import { GetCommunication, GetConnection, GetNitroInstance, GetRoomSession, SendMessageComposer } from '../nitro';
import { GetAutoFrameRate, OnAutoFrameRateChange } from '../prefs/AutoFrameRate';
import { AvatarInfoUtilities } from '../room/widgets/AvatarInfoUtilities';

// PixelRP: the lag recorder (Twist, 2026-10-26 - "when i stand still for a few
// minutes, then click again, theres a burst of lag"). Staff only. A frame that
// takes longer than HITCH_MS is written up with what the client did in it and
// sent to the emulator, which logs it as a "[lag]" line (RpClientLagReportEvent)
// - so a stutter on somebody's own machine can be read without DevTools.
//
// ONE LINE PER SLOW FRAME, with:
//   t       how long the frame took (ms), from one game step to the next
//   in      ms since the last click or key, and idle = how long nothing had been
//           pressed before that one - "stood still 5 min, clicked, hitched"
//   tick    time in the game's frame step: room, avatars, furni and the draw
//   draw    time inside the renderer's draw of the stage (ms)
//   up      textures sent to the graphics card: count / megapixels / ms
//   gc      texture clean-ups run / textures they let go
//   av      avatar pictures drawn for the room: calls / ms; crop = UI pictures
//   pk      server messages handled: count / ms, and the slowest by header
//   hit, map, rb, pic - what a click spent its time on, each only when it
//           happened (Twist, 2026-10-26): hit = the room's tests of what is
//           under a click (not a mouse move), map = click shapes made on the
//           spot, rb = pictures read back from the graphics card while it
//           waits (a map can include one), pic = the info box's furni picture;
//           each count / ms
//   xt, ls  the frame loops besides the game's own (Twist, 2026-10-27 - a
//           0.63 s stall in the crowd test ran in one, with tick=0): xt = ms
//           each other Pixi ticker spent, as shared/system/other:ms, only when
//           one ran; ls = the slowest single job on any ticker, the game's
//           included, from LISTENER_NOTE_MS, as ms:ticker:name:the start of
//           its code - enough to find it in the bundle
//   lt      long tasks the browser saw in the frame: count / longest ms - the
//           game's and the website page's around it, which share one thread
//   ev      the slowest click or key in the frame, as name:wait/run/show - ms
//           it waited for the thread, ms its handlers ran, and ms from then
//           until the screen showed the result. A big show with a small wait
//           and run is the drawing to the screen held up, not the game
//   loaf    the browser's own account of the frame (Chrome's long animation
//           frame report): reports / ms, scr = ms running scripts, lay = ms
//           working out styles and layout at the end, and top = the slowest
//           scripts as ms:what started it@file:position(function), /fl = ms of
//           layout the script forced. "loaf=none" = the page's code was not
//           busy, so the frame was held up outside it (the graphics card or its
//           driver, or the browser); "loaf=n/a" = a browser without the report.
//
// The browser hands its reports over a moment after the frame ends - after the
// next frame has started - so lt, ev and loaf are matched to a slow frame by
// time, when its line is sent, not counted while it runs (the first version
// did that, and its lt always read 0).
//
// Chrome gives the long animation frame report to the top page only, and the
// game runs in an iframe of the website page (same site), so it is watched
// from there, its clock moved onto the game's. Watched from inside the game it
// read "none" even for a frame the game itself held up (2026-10-26).
//
// A gap the page spent hidden - minimised, another tab - is not a stutter and
// is not written up.
//
// NO OBSERVER EFFECT, as the movement traces (ProximityTrace): while playing
// it only adds numbers into variables and keeps the browser's reports. Strings
// are built only for a slow frame, and sent a couple of seconds after the last
// one, a few lines per message.
//
// ONE LINE PER ROOM ENTERED (Twist, 2026-10-28 - "I want big rooms to load as
// fast as possible"), timed from the room change starting (RoomReady), ms:
//   floor   the new room's floor on screen (the old room's held picture let go)
//   me      your own avatar in it, its picture made (Twist, 2026-10-28 - "the
//           room loads first, then my avatar appears")
//   objects the room's furni list arrived (message #2); furni / types = how many
//   placed  every furni in it put in the room (no furni pending)
//   drawn   nothing left to come: no furni type downloading, unpacking or
//           waiting to be set up, and no picture held back by the upload gate
//           (two frames running)
//   dl      furni and figure files fetched meanwhile: count / KB / ms from the
//           first request to the last answer's headers (KB = what the server
//           said each was; ? when it did not)
//   unpack  files unpacked meanwhile (UnpackQueue): count / ms of work
//   up      pictures sent to the graphics card meanwhile: count / megapixels
//   scale   the loading scale this computer has learnt (LoadBudget)
// A room still loading after ROOM_CAP_MS is written as far as it got, "cap".

const HITCH_MS = 50;
const SEND_AFTER_MS = 2500;
const MAX_MESSAGE_CHARS = 3900; // the emulator keeps 4000
const MAX_PENDING = 48;
const MAX_REPORTS = 300;
const TOP_SCRIPTS = 3;
// a ticker job is named on the line from this long
const LISTENER_NOTE_MS = 8;
const LISTENER_CODE_CHARS = 56;
const RP_CLIENT_LAG_REPORT = 4234; // client -> server

class RpClientLagReportComposer implements IMessageComposer<[ string ]>
{
    private _data: [ string ];

    constructor(text: string)
    {
        this._data = [ text ];
    }

    public getMessageArray()
    {
        return this._data;
    }

    public dispose(): void
    { }
}

interface SlowFrame
{
    text: string;
    start: number;
    end: number;
    // a line of its own (the automatic frame rate), sent as it is - not a
    // frame the browser's reports are matched to
    note?: boolean;
}

// this frame's counts, reset after each frame
let uploads = 0;
let uploadPixels = 0;
let uploadMs = 0;
let gcRuns = 0;
let gcFreed = 0;
let tickMs = 0;
let drawMs = 0;
let avatarCalls = 0;
let avatarMs = 0;
let cropCalls = 0;
let cropMs = 0;
let packets = 0;
let packetMs = 0;
let slowestHeader = 0;
let slowestHeaderMs = 0;
let hitTests = 0;
let hitMs = 0;
let mapsMade = 0;
let mapMs = 0;
let readbacks = 0;
let readbackMs = 0;
let furniPictures = 0;
let furniPictureMs = 0;
// the other tickers (xt), and the slowest job on any ticker (ls): which
// ticker is running now, and the job's function, kept as is until a slow
// frame needs it written out
let sharedTickerMs = 0;
let systemTickerMs = 0;
let otherTickerMs = 0;
let runningTicker = 'main';
let slowListenerMs = 0;
let slowListenerTicker = '';
let slowListenerFn: Function = null;

let lastFrameAt = 0;
let lastInputAt = 0;
let idleBeforeInput = 0;
let wasHidden = false;

const frames: SlowFrame[] = [];
let sendTimer = 0;

// the browser's reports, kept until the frames they belong to are sent
const longTasks: PerformanceEntry[] = [];
const inputReports: any[] = [];
const frameReports: any[] = [];
let frameReportsSupported = false;

const resetFrame = () =>
{
    uploads = 0; uploadPixels = 0; uploadMs = 0;
    gcRuns = 0; gcFreed = 0;
    tickMs = 0; drawMs = 0;
    avatarCalls = 0; avatarMs = 0; cropCalls = 0; cropMs = 0;
    packets = 0; packetMs = 0; slowestHeader = 0; slowestHeaderMs = 0;
    hitTests = 0; hitMs = 0; mapsMade = 0; mapMs = 0; readbacks = 0; readbackMs = 0; furniPictures = 0; furniPictureMs = 0;
    sharedTickerMs = 0; systemTickerMs = 0; otherTickerMs = 0;
    slowListenerMs = 0; slowListenerTicker = ''; slowListenerFn = null;
};

// a ticker job as name:the start of its code - no spaces or bars, as those
// split the fields and the lines. A bound function's code reads "[native
// code]", so its name ("bound render") is what tells it apart.
const describeListener = (fn: Function): string =>
{
    if(!fn) return '?';

    let code = '';

    try
    {
        code = String(fn).slice(0, (LISTENER_CODE_CHARS * 2)).replace(/\s+/g, '').slice(0, LISTENER_CODE_CHARS);
    }
    catch(e)
    {}

    return `${ (fn.name || 'anon').slice(0, 24) }:${ code }`.replace(/[\s|]+/g, '_');
}

const keepReport = (list: any[], entry: any) =>
{
    list.push(entry);

    if(list.length > MAX_REPORTS) list.splice(0, (list.length - MAX_REPORTS));
}

const overlaps = (entry: { startTime: number, duration: number }, start: number, end: number): boolean => ((entry.startTime < end) && ((entry.startTime + entry.duration) > start));

// one script as ms:invoker@file:position(function)/flN - no spaces or bars, as
// those split the fields and the lines
const describeScript = (script: any): string =>
{
    const file = String(script.sourceURL || '').split(/[?#]/)[0].split('/').pop();

    let text = `${ Math.round(script.duration) }:${ String(script.invoker || script.invokerType || '?').slice(0, 48) }`;

    if(file) text += `@${ file }:${ script.sourceCharPosition ?? -1 }`;

    if(script.sourceFunctionName) text += `(${ String(script.sourceFunctionName).slice(0, 32) })`;

    if(script.forcedStyleAndLayoutDuration >= 1) text += `/fl${ Math.round(script.forcedStyleAndLayoutDuration) }`;

    return text.replace(/[\s|]+/g, '_');
}

const finish = (frame: SlowFrame): string =>
{
    if(frame.note) return frame.text;

    let tasks = 0;
    let longestTask = 0;

    for(const entry of longTasks)
    {
        if(!overlaps(entry, frame.start, frame.end)) continue;

        tasks++;

        if(entry.duration > longestTask) longestTask = entry.duration;
    }

    const parts = [ frame.text, `lt=${ tasks }/${ Math.round(longestTask) }` ];

    // The slowest input in the frame. The events one screen update showed (the
    // same end, to the browser's 8 ms rounding) - a click's pointerover,
    // pointerdown, mousedown, click - count as one, named by the one that ran
    // longest: wait from the first, run added up, show after the last ran.
    const inputs = inputReports.filter(entry => overlaps(entry, frame.start, frame.end));

    if(inputs.length)
    {
        const shownAt = Math.max(...inputs.map(entry => (entry.startTime + entry.duration)));
        const together = inputs.filter(entry => ((shownAt - (entry.startTime + entry.duration)) <= 8));

        let first = together[0];
        let longest = together[0];
        let run = 0;
        let ranUntil = 0;

        for(const entry of together)
        {
            if(entry.startTime < first.startTime) first = entry;

            if((entry.processingEnd - entry.processingStart) > (longest.processingEnd - longest.processingStart)) longest = entry;

            run += (entry.processingEnd - entry.processingStart);
            ranUntil = Math.max(ranUntil, entry.processingEnd);
        }

        const wait = (first.processingStart - first.startTime);
        const show = (shownAt - ranUntil);

        parts.push(`ev=${ longest.name }:${ Math.round(wait) }/${ Math.round(run) }/${ Math.max(0, Math.round(show)) }`);
    }

    if(!frameReportsSupported)
    {
        parts.push('loaf=n/a');

        return parts.join(' ');
    }

    let reports = 0;
    let reportMs = 0;
    let scriptMs = 0;
    let layoutMs = 0;

    const scripts: any[] = [];

    for(const entry of frameReports)
    {
        if(!overlaps(entry, frame.start, frame.end)) continue;

        reports++;
        reportMs += entry.duration;

        if(entry.styleAndLayoutStart > 0) layoutMs += Math.max(0, ((entry.startTime + entry.duration) - entry.styleAndLayoutStart));

        for(const script of (entry.scripts || []))
        {
            scriptMs += script.duration;

            scripts.push(script);
        }
    }

    if(!reports)
    {
        parts.push('loaf=none');

        return parts.join(' ');
    }

    parts.push(`loaf=${ reports }/${ Math.round(reportMs) }`, `scr=${ Math.round(scriptMs) }`, `lay=${ Math.round(layoutMs) }`);

    if(scripts.length)
    {
        scripts.sort((a, b) => (b.duration - a.duration));

        parts.push(`top=${ scripts.slice(0, TOP_SCRIPTS).map(describeScript).join(',') }`);
    }

    return parts.join(' ');
}

// reports older than every frame still waiting to be sent are done with
const pruneReports = () =>
{
    const before = (frames.length ? frames[0].start : (performance.now() - 5000));

    for(const list of [ longTasks, inputReports, frameReports ])
    {
        let done = 0;

        while((done < list.length) && ((list[done].startTime + list[done].duration) < before)) done++;

        if(done) list.splice(0, done);
    }
}

const send = () =>
{
    sendTimer = 0;

    if(!frames.length) return;

    let message = '';

    while(frames.length)
    {
        const line = finish(frames[0]);

        if(message && ((message.length + 3 + line.length) > MAX_MESSAGE_CHARS)) break;

        message = (message ? `${ message } | ${ line }` : line).slice(0, MAX_MESSAGE_CHARS);

        frames.shift();
    }

    try
    {
        SendMessageComposer(new RpClientLagReportComposer(message));
    }
    catch(e)
    {}

    pruneReports();

    // more than one message's worth: the rest after the server's 1.5 s gap
    if(frames.length) sendTimer = window.setTimeout(send, 1600);
}

const record = (frameMs: number, start: number, end: number) =>
{
    const parts = [
        `t=${ Math.round(frameMs) }`,
        `in=${ lastInputAt ? Math.round(end - lastInputAt) : -1 }`,
        `idle=${ Math.round(idleBeforeInput / 1000) }s`,
        `tick=${ tickMs.toFixed(1) }`,
        `draw=${ drawMs.toFixed(1) }`,
        `up=${ uploads }/${ (uploadPixels / 1000000).toFixed(2) }/${ uploadMs.toFixed(1) }`,
        `gc=${ gcRuns }/${ gcFreed }`,
        `av=${ avatarCalls }/${ avatarMs.toFixed(1) }`,
        `crop=${ cropCalls }/${ cropMs.toFixed(1) }`,
        `pk=${ packets }/${ packetMs.toFixed(1) }${ slowestHeader ? `(${ slowestHeader }:${ slowestHeaderMs.toFixed(1) })` : '' }`
    ];

    if(hitTests) parts.push(`hit=${ hitTests }/${ hitMs.toFixed(1) }`);
    if(mapsMade) parts.push(`map=${ mapsMade }/${ mapMs.toFixed(1) }`);
    if(readbacks) parts.push(`rb=${ readbacks }/${ readbackMs.toFixed(1) }`);
    if(furniPictures) parts.push(`pic=${ furniPictures }/${ furniPictureMs.toFixed(1) }`);

    const otherTickers: string[] = [];

    if(sharedTickerMs) otherTickers.push(`shared:${ sharedTickerMs.toFixed(1) }`);
    if(systemTickerMs) otherTickers.push(`system:${ systemTickerMs.toFixed(1) }`);
    if(otherTickerMs) otherTickers.push(`other:${ otherTickerMs.toFixed(1) }`);
    if(otherTickers.length) parts.push(`xt=${ otherTickers.join(',') }`);
    if(slowListenerMs >= LISTENER_NOTE_MS) parts.push(`ls=${ slowListenerMs.toFixed(1) }:${ slowListenerTicker }:${ describeListener(slowListenerFn) }`);
    if(GetAutoFrameRate().lowered) parts.push('af=half');

    frames.push({ text: parts.join(' '), start, end });

    if(frames.length > MAX_PENDING) frames.splice(0, (frames.length - MAX_PENDING));

    if(sendTimer) window.clearTimeout(sendTimer);

    sendTimer = window.setTimeout(send, SEND_AFTER_MS);
}

// a line of its own (SlowFrame.note), sent with the next message
const addNote = (text: string) =>
{
    const now = performance.now();

    frames.push({ text, start: now, end: now, note: true });

    if(frames.length > MAX_PENDING) frames.splice(0, (frames.length - MAX_PENDING));

    if(sendTimer) window.clearTimeout(sendTimer);

    sendTimer = window.setTimeout(send, SEND_AFTER_MS);
}

// the room being timed (one at a time), and what its line needs
const ROOM_CAP_MS = 15000;

interface RoomLoad
{
    roomId: number;
    startedAt: number;
    initialisedAt: number;
    floorAt: number;
    meAt: number;
    objectsAt: number;
    placedAt: number;
    furni: number;
    types: number;
    dlFiles: number;
    dlBytes: number;
    dlUnknown: number;
    dlFirstAt: number;
    dlLastAt: number;
    unpackJobs: number;
    unpackMs: number;
    upSheets: number;
    upPixels: number;
    // frames running with nothing left to come
    settledFrames: number;
    settledAt: number;
}

let roomLoad: RoomLoad = null;

const since = (load: RoomLoad, at: number): string => (at ? Math.round(at - load.startedAt).toString() : '-');

// the line, once the room has nothing left to come (or the cap)
const finishRoomLoad = (load: RoomLoad, drawnAt: number, capped: boolean) =>
{
    if(roomLoad === load) roomLoad = null;

    const kb = (load.dlUnknown ? '?' : Math.round(load.dlBytes / 1024).toString());
    const dlMs = ((load.dlFirstAt && load.dlLastAt) ? Math.round(load.dlLastAt - load.dlFirstAt) : 0);

    addNote(`room=${ load.roomId } floor=${ since(load, load.floorAt) } me=${ since(load, load.meAt) } objects=${ since(load, load.objectsAt) } placed=${ since(load, load.placedAt) } drawn=${ since(load, drawnAt) } ` +
        `furni=${ load.furni } types=${ load.types } dl=${ load.dlFiles }/${ kb }/${ dlMs } ` +
        `unpack=${ LoadStats.unpackJobs - load.unpackJobs }/${ Math.round(LoadStats.unpackMs - load.unpackMs) } ` +
        `up=${ load.upSheets }/${ (load.upPixels / 1000000).toFixed(2) } scale=${ LoadScale(0, Number.MAX_VALUE).toFixed(2) }${ capped ? ' cap' : '' }`);
}

// your own avatar in the room with a picture on it - a sprite bigger than the
// 1x1 empty one
const ownAvatarShown = (engine: any, roomId: number): boolean =>
{
    const session = GetRoomSession();

    if(!session || (session.roomId !== roomId) || (session.ownRoomIndex < 0)) return false;

    const visualization: any = engine.getRoomObject?.(roomId, session.ownRoomIndex, RoomObjectCategory.UNIT)?.visualization;
    const count = (visualization?.spriteCount || 0);

    for(let i = 0; i < count; i++)
    {
        const sprite = visualization.getSprite(i);

        if(sprite && sprite.visible && (sprite.width > 1) && (sprite.height > 1)) return true;
    }

    return false;
}

// each frame while a room is being timed: which of its moments have come
const checkRoomLoad = (now: number) =>
{
    const load = roomLoad;

    if(!load) return;

    if((now - load.startedAt) > ROOM_CAP_MS)
    {
        finishRoomLoad(load, 0, true);

        return;
    }

    const engine: any = GetNitroInstance()?.roomEngine;

    if(!engine) return;

    // the floor: the room is made, and the old room's picture let go
    if(!load.floorAt && load.initialisedAt && !engine._pixelrpHeldPicture) load.floorAt = now;

    if(!load.meAt && ownAvatarShown(engine, load.roomId)) load.meAt = now;

    if(!load.objectsAt) return;

    if(!load.placedAt)
    {
        const instanceData = engine.getRoomInstanceData?.(load.roomId);

        if(instanceData && !instanceData.hasPendingFurniture) load.placedAt = now;
        else return;
    }

    const downloading = (engine._roomContentLoader?._pendingContentTypes?.length || 0);
    const settled = (!downloading && !LoadStats.pendingTypes && !LoadStats.unpackQueued && !LoadStats.heldBack);

    if(!settled)
    {
        load.settledFrames = 0;

        return;
    }

    if(!load.settledFrames) load.settledAt = now;

    load.settledFrames++;

    if(load.settledFrames >= 2) finishRoomLoad(load, load.settledAt, false);
}

const onRoomReady = (event: RoomReadyMessageEvent) =>
{
    const now = performance.now();

    // a room left before it finished: written as far as it got
    if(roomLoad) finishRoomLoad(roomLoad, 0, false);

    roomLoad = {
        roomId: (event.getParser()?.roomId || 0), startedAt: now, initialisedAt: 0, floorAt: 0, meAt: 0, objectsAt: 0, placedAt: 0, furni: 0, types: 0,
        dlFiles: 0, dlBytes: 0, dlUnknown: 0, dlFirstAt: 0, dlLastAt: 0, unpackJobs: LoadStats.unpackJobs, unpackMs: LoadStats.unpackMs,
        upSheets: 0, upPixels: 0, settledFrames: 0, settledAt: 0
    };
}

const onRoomInitialised = (event: RoomEngineEvent) =>
{
    if(roomLoad && (event.roomId === roomLoad.roomId) && !roomLoad.initialisedAt) roomLoad.initialisedAt = performance.now();
}

const onFloorItems = (event: FurnitureFloorEvent) =>
{
    const load = roomLoad;

    if(!load || load.objectsAt) return;

    const items = (event.getParser()?.items || []);

    load.objectsAt = performance.now();
    load.furni = items.length;
    load.types = new Set(items.map(item => (item.spriteId || item.spriteName))).size;
}

// a furni or figure file fetched while a room is being timed
const isBundle = (input: any): boolean =>
{
    const url = ((typeof input === 'string') ? input : (input?.url || ''));

    return /\.nitro(\?|#|$)/.test(url);
}

const onFrame = (now: number) =>
{
    checkRoomLoad(now);

    const visible = (document.visibilityState === 'visible');

    if(lastFrameAt && visible && !wasHidden)
    {
        const frameMs = (now - lastFrameAt);

        if(frameMs > HITCH_MS) record(frameMs, lastFrameAt, now);
    }

    if(visible) wasHidden = false;

    lastFrameAt = now;
    resetFrame();
}

const onFrameRequest = (now: number) =>
{
    onFrame(now);

    window.requestAnimationFrame(onFrameRequest);
}

const onInput = () =>
{
    const now = performance.now();

    idleBeforeInput = (lastInputAt ? (now - lastInputAt) : 0);
    lastInputAt = now;
}

// Wraps a method on one object so it is timed into the counters; the original
// always runs, and a thrown error goes back to its caller unchanged.
const timeMethod = (target: any, name: string, add: (ms: number, args: any[], self: any, before: any) => void, before: (self: any) => any = null) =>
{
    const original = target?.[name];

    if(typeof original !== 'function') return;

    target[name] = function(...args: any[])
    {
        const snapshot = (before ? before(this) : null);
        const start = performance.now();

        try
        {
            return original.apply(this, args);
        }
        finally
        {
            add((performance.now() - start), args, this, snapshot);
        }
    };
}

// The long animation frame report, from the top page when it is on this site
// (see the top of the file), else this one. Entries are copied with their
// times moved onto this page's clock.
const watchFrameReports = (): boolean =>
{
    try
    {
        let host: any = window;

        try
        {
            if(window.top && (window.top !== window) && (window.top as any).PerformanceObserver) host = window.top;
        }
        catch(e)
        {} // another site's page cannot be read: this one, then

        if(!(host.PerformanceObserver.supportedEntryTypes || []).includes('long-animation-frame')) return false;

        const shift = ((host === window) ? 0 : (host.performance.timeOrigin - performance.timeOrigin));

        const observer = new host.PerformanceObserver((list: any) =>
        {
            for(const entry of list.getEntries())
            {
                keepReport(frameReports, {
                    startTime: (entry.startTime + shift),
                    duration: entry.duration,
                    styleAndLayoutStart: (entry.styleAndLayoutStart ? (entry.styleAndLayoutStart + shift) : 0),
                    scripts: entry.scripts
                });
            }
        });

        observer.observe({ type: 'long-animation-frame', buffered: false });

        // it lives in the top page, so it goes when the game does (a reload)
        if(host !== window) window.addEventListener('pagehide', () => observer.disconnect());

        return true;
    }
    catch(e)
    {
        return false;
    }
}

const install = (): boolean =>
{
    const renderer: any = GetNitroInstance()?.application?.renderer;
    const connection: any = GetConnection();

    if(!renderer || !connection) return false;

    // A frame is timed from the start of one game step to the start of the
    // next, from inside the step. The game's own frame callback always runs
    // before one the recorder adds, so a callback of its own saw a slow step
    // a frame late and wrote it up with the next frame's counts - the first
    // version did, so its draw/up/av belonged to the frame after the slow one.
    const ticker: any = GetTicker();
    const update = ticker?.update;

    if(typeof update === 'function')
    {
        ticker.update = function(...args: any[])
        {
            onFrame(performance.now());

            const start = performance.now();

            try
            {
                return update.apply(this, args);
            }
            finally
            {
                tickMs += (performance.now() - start);
            }
        };
    }

    // The other tickers (xt), each time one runs. The game's keeps its own
    // update, wrapped above round Pixi's; every other ticker uses Pixi's,
    // wrapped here on the class. Ticker._shared and _system are read as they
    // are: the shared and system getters would make one that is not there.
    const TickerClass: any = ticker?.constructor;
    const tickerUpdate = TickerClass?.prototype?.update;

    if(typeof tickerUpdate === 'function')
    {
        TickerClass.prototype.update = function(...args: any[])
        {
            const name = ((this === TickerClass._shared) ? 'shared' : ((this === TickerClass._system) ? 'system' : 'other'));
            const outer = runningTicker;
            const start = performance.now();

            runningTicker = name;

            try
            {
                return tickerUpdate.apply(this, args);
            }
            finally
            {
                const ms = (performance.now() - start);

                runningTicker = outer;

                if(name === 'shared') sharedTickerMs += ms;
                else if(name === 'system') systemTickerMs += ms;
                else otherTickerMs += ms;
            }
        };
    }

    // Every job on every ticker (ls), one at a time: the slowest of the frame
    // is kept, with the ticker it ran on.
    const TickerListener: any = ticker?._head?.constructor;
    const emit = TickerListener?.prototype?.emit;

    if(typeof emit === 'function')
    {
        TickerListener.prototype.emit = function(...args: any[])
        {
            const fn = this.fn;
            const start = performance.now();

            try
            {
                return emit.apply(this, args);
            }
            finally
            {
                const ms = (performance.now() - start);

                if(ms > slowListenerMs)
                {
                    slowListenerMs = ms;
                    slowListenerTicker = runningTicker;
                    slowListenerFn = fn;
                }
            }
        };
    }

    timeMethod(renderer.texture, 'updateTexture', (ms, args) =>
    {
        uploads++;
        uploadMs += ms;

        const texture = args[0];
        const pixels = (texture ? ((texture.realWidth || 0) * (texture.realHeight || 0)) : 0);

        uploadPixels += pixels;

        if(roomLoad)
        {
            roomLoad.upSheets++;
            roomLoad.upPixels += pixels;
        }
    });

    // the room-load timer's moments (checkRoomLoad does the rest each frame)
    try
    {
        GetCommunication().registerMessageEvent(new RoomReadyMessageEvent(onRoomReady));
        GetCommunication().registerMessageEvent(new FurnitureFloorEvent(onFloorItems));
        GetNitroInstance().roomEngine?.events?.addEventListener(RoomEngineEvent.INITIALIZED, onRoomInitialised);
    }
    catch(e)
    {}

    // and the files fetched for it: only while one is being timed, and only
    // furni and figure files; everything else goes straight through
    const fetchBefore = window.fetch;

    if(typeof fetchBefore === 'function')
    {
        window.fetch = function(input: any, init?: any)
        {
            const load = roomLoad;

            if(!load || !isBundle(input)) return fetchBefore.call(this, input, init);

            const start = performance.now();

            if(!load.dlFirstAt) load.dlFirstAt = start;

            load.dlFiles++;

            return fetchBefore.call(this, input, init).then((response: Response) =>
            {
                const length = Number(response?.headers?.get('content-length'));

                if(length > 0) load.dlBytes += length;
                else load.dlUnknown++;

                load.dlLastAt = performance.now();

                return response;
            });
        } as typeof window.fetch;
    }

    timeMethod(renderer.textureGC, 'run', (ms, args, self, before) =>
    {
        gcRuns++;
        gcFreed += Math.max(0, (before - (renderer.texture?.managedTextures?.length || 0)));
    }, () => (renderer.texture?.managedTextures?.length || 0));

    timeMethod(renderer, 'render', ms => (drawMs += ms));

    timeMethod(AvatarImage.prototype, 'getImage', ms =>
    {
        avatarCalls++;
        avatarMs += ms;
    });

    timeMethod(AvatarImage.prototype, 'getCroppedImage', ms =>
    {
        cropCalls++;
        cropMs += ms;
    });

    // what a click spends its time on (hit, map, rb, pic)
    timeMethod(RoomSpriteCanvas.prototype, 'checkMouseHits', (ms, args) =>
    {
        if(args[2] === MouseEventType.MOUSE_MOVE) return;

        hitTests++;
        hitMs += ms;
    });

    for(const name of [ 'generateHitMap', 'generateFrameHitMap' ])
    {
        timeMethod(ExtendedSprite, name, ms =>
        {
            mapsMade++;
            mapMs += ms;
        });
    }

    for(const name of [ 'getPixels', 'generateImage', 'generateImageUrl' ])
    {
        timeMethod(TextureUtils, name, ms =>
        {
            readbacks++;
            readbackMs += ms;
        });
    }

    timeMethod(AvatarInfoUtilities, 'getFurniImage', ms =>
    {
        furniPictures++;
        furniPictureMs += ms;
    });

    // one call per server message, so each is timed on its own
    const processWrappers = connection.processWrappers;

    if(typeof processWrappers === 'function')
    {
        connection.processWrappers = function(...wrappers: any[])
        {
            for(const wrapper of wrappers)
            {
                const start = performance.now();

                try
                {
                    processWrappers.call(this, wrapper);
                }
                finally
                {
                    const ms = (performance.now() - start);

                    packets++;
                    packetMs += ms;

                    if(ms > slowestHeaderMs)
                    {
                        slowestHeaderMs = ms;
                        slowestHeader = (wrapper?.header || 0);
                    }
                }
            }
        };
    }

    try
    {
        const supported = (PerformanceObserver.supportedEntryTypes || []);

        if(supported.includes('longtask'))
        {
            new PerformanceObserver(list =>
            {
                for(const entry of list.getEntries()) keepReport(longTasks, entry);
            }).observe({ type: 'longtask', buffered: false });
        }

        if(supported.includes('event'))
        {
            new PerformanceObserver(list =>
            {
                for(const entry of list.getEntries()) keepReport(inputReports, entry);
            }).observe({ type: 'event', durationThreshold: 16, buffered: false } as PerformanceObserverInit);
        }
    }
    catch(e)
    {}

    frameReportsSupported = watchFrameReports();

    window.addEventListener('pointerdown', onInput, { capture: true, passive: true });
    window.addEventListener('keydown', onInput, { capture: true, passive: true });

    document.addEventListener('visibilitychange', () =>
    {
        if(document.visibilityState !== 'visible') wasHidden = true;
    });

    // no game step to time from: frames as the browser shows them
    if(typeof update !== 'function') window.requestAnimationFrame(onFrameRequest);

    // the automatic frame rate (Twist, 2026-10-27): a line when it steps down
    // to half rate or back up, and once a minute while the tab shows, the
    // screen's refresh and the share of slightly late frames - what decides
    // whether it steps down, so the thresholds can be judged from real play
    OnAutoFrameRateChange(state => addNote(state.lowered
        ? `af=half:${ state.fps }fps late=${ Math.round(state.lateShare * 100) }%`
        : (state.enabled ? 'af=full' : 'af=off')));

    window.setInterval(() =>
    {
        if(document.visibilityState !== 'visible') return;

        const state = GetAutoFrameRate();

        addNote(`fr=${ state.refreshHz }Hz late=${ (state.recentLateShare * 100).toFixed(1) }% af=${ !state.enabled ? 'off' : (state.lowered ? 'half' : 'full') }`);
    }, 60000);

    return true;
}

// A crash a window caught (common/ErrorBoundary), written to the emulator's
// log on the lag report's line, so it reads "[lag] <name> ... crash: ...". The
// server keeps one report per staff member every 1.5 s and a crash usually
// brings a slow frame's report with it, so this goes after that gap and once
// more in case a lag report still took the slot. Staff clients only, as the
// server logs nobody else.
export const ReportClientCrash = (text: string) =>
{
    const message = `crash: ${ text }`.slice(0, MAX_MESSAGE_CHARS);

    const send = () =>
    {
        try
        {
            SendMessageComposer(new RpClientLagReportComposer(message));
        }
        catch(e)
        {}
    };

    window.setTimeout(send, 1600);
    window.setTimeout(send, 4500);
}

// A server message the client could not read, or whose handler threw. The
// renderer (patch packet-guard) now handles each message on its own, so the
// rest of a room entry still lands, and tells us here: written to the log like
// a crash, "crash: message <header> | <error> | <stack>". Once per kind of
// failure and a few a session at most - a handler throwing on every movement
// packet must not turn into a flood the server cuts the connection for.
const MAX_MESSAGE_FAILURE_REPORTS = 5;

const reportedMessageFailures = new Set<string>();

const onMessageFailure = (header: number, error: unknown) =>
{
    const what = ((error instanceof Error) ? `${ error.name }: ${ error.message }` : String(error));
    const key = `${ header } ${ what }`;

    if(reportedMessageFailures.has(key) || (reportedMessageFailures.size >= MAX_MESSAGE_FAILURE_REPORTS)) return;

    reportedMessageFailures.add(key);

    if(!GetNitroInstance()?.sessionDataManager?.isModerator) return;

    const stack = (((error instanceof Error) && error.stack) ? error.stack.replace(/\s+/g, ' ') : '');

    ReportClientCrash(`message ${ header } | ${ what } | ${ stack }`);
}

let registered = false;

// Staff only: the rank arrives a moment after login, so it is asked again
// until it has.
export const RegisterRpLagRecorder = () =>
{
    if(registered) return;

    registered = true;

    GetConnection()?.registerMessages({ events: new Map(), composers: new Map<number, Function>([ [ RP_CLIENT_LAG_REPORT, RpClientLagReportComposer ] ]) });

    // from login, for everyone - only staff send it on (onMessageFailure)
    SocketConnection.pixelrpOnFailure = onMessageFailure;

    let tries = 0;

    const check = window.setInterval(() =>
    {
        const session = GetNitroInstance()?.sessionDataManager;

        if((++tries > 120) || (session && (session.securityLevel > 0)))
        {
            window.clearInterval(check);

            if(session?.isModerator) install();
        }
    }, 5000);
}
