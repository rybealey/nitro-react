import { AvatarImage, GetTicker, IMessageComposer } from '@nitrots/nitro-renderer';
import { GetConnection, GetNitroInstance, SendMessageComposer } from '../nitro';

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
//   lt      long tasks the browser saw in the frame: count / longest ms
//   loaf    the browser's own account of the frame (Chrome's long animation
//           frame report): reports / ms, scr = ms running scripts, lay = ms
//           working out styles and layout at the end, and top = the slowest
//           scripts as ms:what started it@file:position(function), /fl = ms of
//           layout the script forced. "loaf=none" = the page's code was not
//           busy, so the frame was held up outside it (the graphics card or its
//           driver, or the browser); "loaf=n/a" = a browser without the report.
//
// The browser hands its reports over a moment after the frame ends - after the
// next frame has started - so lt and loaf are matched to a slow frame by time,
// when its line is sent, not counted while it runs (the first version did
// that, and its lt always read 0).
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

let lastFrameAt = 0;
let lastInputAt = 0;
let idleBeforeInput = 0;

const frames: SlowFrame[] = [];
let sendTimer = 0;

// the browser's reports, kept until the frames they belong to are sent
const longTasks: PerformanceEntry[] = [];
const frameReports: any[] = [];
let frameReportsSupported = false;

const resetFrame = () =>
{
    uploads = 0; uploadPixels = 0; uploadMs = 0;
    gcRuns = 0; gcFreed = 0;
    tickMs = 0; drawMs = 0;
    avatarCalls = 0; avatarMs = 0; cropCalls = 0; cropMs = 0;
    packets = 0; packetMs = 0; slowestHeader = 0; slowestHeaderMs = 0;
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

    for(const list of [ longTasks, frameReports ])
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

    frames.push({ text: parts.join(' '), start, end });

    if(frames.length > MAX_PENDING) frames.splice(0, (frames.length - MAX_PENDING));

    if(sendTimer) window.clearTimeout(sendTimer);

    sendTimer = window.setTimeout(send, SEND_AFTER_MS);
}

const onFrame = (now: number) =>
{
    if(lastFrameAt && (document.visibilityState === 'visible'))
    {
        const frameMs = (now - lastFrameAt);

        if(frameMs > HITCH_MS) record(frameMs, lastFrameAt, now);
    }

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

        if(supported.includes('long-animation-frame'))
        {
            new PerformanceObserver(list =>
            {
                for(const entry of list.getEntries()) keepReport(frameReports, entry);
            }).observe({ type: 'long-animation-frame', buffered: false });

            frameReportsSupported = true;
        }
    }
    catch(e)
    {}

    window.addEventListener('pointerdown', onInput, { capture: true, passive: true });
    window.addEventListener('keydown', onInput, { capture: true, passive: true });

    // no game step to time from: frames as the browser shows them
    if(typeof update !== 'function') window.requestAnimationFrame(onFrameRequest);

    return true;
}

let registered = false;

// Staff only: the rank arrives a moment after login, so it is asked again
// until it has.
export const RegisterRpLagRecorder = () =>
{
    if(registered) return;

    registered = true;

    GetConnection()?.registerMessages({ events: new Map(), composers: new Map<number, Function>([ [ RP_CLIENT_LAG_REPORT, RpClientLagReportComposer ] ]) });

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
