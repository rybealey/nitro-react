import { AvatarImage, IMessageComposer } from '@nitrots/nitro-renderer';
import { GetConnection, GetNitroInstance, SendMessageComposer } from '../nitro';

// PixelRP: the lag recorder (Twist, 2026-10-26 - "when i stand still for a few
// minutes, then click again, theres a burst of lag"). Staff only. A frame that
// takes longer than HITCH_MS is written up with what the client did in it and
// sent to the emulator, which logs it as a "[lag]" line (RpClientLagReportEvent)
// - so a stutter on somebody's own machine can be read without DevTools.
//
// ONE LINE PER SLOW FRAME, with:
//   t       how long the frame took (ms)
//   in      ms since the last click or key, and idle = how long nothing had been
//           pressed before that one - "stood still 5 min, clicked, hitched"
//   draw    time inside the renderer's draw of the stage (ms)
//   up      textures sent to the graphics card: count / megapixels / ms
//   gc      texture clean-ups run / textures they let go
//   av      avatar pictures drawn for the room: calls / ms; crop = UI pictures
//   pk      server messages handled: count / ms, and the slowest by header
//   heap    MB the JS heap shrank by (a garbage collection) or grew by
//   lt      long tasks the browser saw: count / longest ms
//
// NO OBSERVER EFFECT, as the movement traces (ProximityTrace): while playing
// it only adds numbers into variables. Strings are built only for a slow frame,
// and sent a couple of seconds after the last one, a few lines per message.

const HITCH_MS = 50;
const SEND_AFTER_MS = 2500;
const MAX_LINES = 12;
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

// this frame's counts, reset after each frame
let uploads = 0;
let uploadPixels = 0;
let uploadMs = 0;
let gcRuns = 0;
let gcFreed = 0;
let drawMs = 0;
let avatarCalls = 0;
let avatarMs = 0;
let cropCalls = 0;
let cropMs = 0;
let packets = 0;
let packetMs = 0;
let slowestHeader = 0;
let slowestHeaderMs = 0;
let longTasks = 0;
let longestTaskMs = 0;

let lastFrameAt = 0;
let lastHeap = 0;
let lastInputAt = 0;
let idleBeforeInput = 0;

const lines: string[] = [];
let sendTimer = 0;

const resetFrame = () =>
{
    uploads = 0; uploadPixels = 0; uploadMs = 0;
    gcRuns = 0; gcFreed = 0;
    drawMs = 0;
    avatarCalls = 0; avatarMs = 0; cropCalls = 0; cropMs = 0;
    packets = 0; packetMs = 0; slowestHeader = 0; slowestHeaderMs = 0;
    longTasks = 0; longestTaskMs = 0;
};

const heapNow = (): number => ((performance as any).memory?.usedJSHeapSize ?? 0);

const send = () =>
{
    sendTimer = 0;

    if(!lines.length) return;

    try
    {
        SendMessageComposer(new RpClientLagReportComposer(lines.splice(0, MAX_LINES).join(' | ')));
    }
    catch(e)
    {}

    // more than one message's worth: the rest after the server's 1.5 s gap
    if(lines.length) sendTimer = window.setTimeout(send, 1600);
}

const record = (frameMs: number, now: number) =>
{
    const heap = heapNow();
    const heapMb = (lastHeap && heap) ? Math.round((heap - lastHeap) / 1048576) : 0;
    const parts = [
        `t=${ Math.round(frameMs) }`,
        `in=${ lastInputAt ? Math.round(now - lastInputAt) : -1 }`,
        `idle=${ Math.round(idleBeforeInput / 1000) }s`,
        `draw=${ drawMs.toFixed(1) }`,
        `up=${ uploads }/${ (uploadPixels / 1000000).toFixed(2) }/${ uploadMs.toFixed(1) }`,
        `gc=${ gcRuns }/${ gcFreed }`,
        `av=${ avatarCalls }/${ avatarMs.toFixed(1) }`,
        `crop=${ cropCalls }/${ cropMs.toFixed(1) }`,
        `pk=${ packets }/${ packetMs.toFixed(1) }${ slowestHeader ? `(${ slowestHeader }:${ slowestHeaderMs.toFixed(1) })` : '' }`,
        `heap=${ heapMb }`,
        `lt=${ longTasks }/${ Math.round(longestTaskMs) }`
    ];

    lines.push(parts.join(' '));

    if(lines.length > (MAX_LINES * 4)) lines.splice(0, (lines.length - (MAX_LINES * 4)));

    if(sendTimer) window.clearTimeout(sendTimer);

    sendTimer = window.setTimeout(send, SEND_AFTER_MS);
}

const onFrame = (now: number) =>
{
    if(lastFrameAt && (document.visibilityState === 'visible'))
    {
        const frameMs = (now - lastFrameAt);

        if(frameMs > HITCH_MS) record(frameMs, now);
    }

    lastFrameAt = now;
    lastHeap = heapNow();
    resetFrame();

    window.requestAnimationFrame(onFrame);
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
        new PerformanceObserver(list =>
        {
            for(const entry of list.getEntries())
            {
                longTasks++;

                if(entry.duration > longestTaskMs) longestTaskMs = entry.duration;
            }
        }).observe({ type: 'longtask', buffered: false });
    }
    catch(e)
    {}

    window.addEventListener('pointerdown', onInput, { capture: true, passive: true });
    window.addEventListener('keydown', onInput, { capture: true, passive: true });

    window.requestAnimationFrame(onFrame);

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
