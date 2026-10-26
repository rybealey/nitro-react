import { AvatarImage, ExtendedSprite, GetTicker, IMessageComposer, MouseEventType, RoomSpriteCanvas, SocketConnection, TextureUtils } from '@nitrots/nitro-renderer';
import { GetConnection, GetNitroInstance, SendMessageComposer } from '../nitro';
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

const HITCH_MS = 50;
const SEND_AFTER_MS = 2500;
const MAX_MESSAGE_CHARS = 3900; // the emulator keeps 4000
const MAX_PENDING = 48;
const MAX_REPORTS = 300;
const TOP_SCRIPTS = 3;
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
};

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

    frames.push({ text: parts.join(' '), start, end });

    if(frames.length > MAX_PENDING) frames.splice(0, (frames.length - MAX_PENDING));

    if(sendTimer) window.clearTimeout(sendTimer);

    sendTimer = window.setTimeout(send, SEND_AFTER_MS);
}

const onFrame = (now: number) =>
{
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

    timeMethod(renderer.texture, 'updateTexture', (ms, args) =>
    {
        uploads++;
        uploadMs += ms;

        const texture = args[0];

        if(texture) uploadPixels += ((texture.realWidth || 0) * (texture.realHeight || 0));
    });

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
