import { GetConfiguration, GetConnection, GetSessionDataManager } from '../nitro';
import { BrowserGuardReason, RpBrowserGuardComposer } from './RpBrowserGuardMessages';

// PixelRP: no browser right-click menu in-game, and no Inspect Element.
//
// The context menu is blocked for everyone, on the whole client document -
// not only the room canvas. It is a preventDefault in the capture phase and
// nothing more, so the client's own right-click handlers still see the event.
//
// Developer tools send the player back to the website instead, two ways:
//
//   - the shortcuts: F12, Ctrl+Shift+I/J/C/K (Cmd+Option+I/J/C/K and
//     Cmd+Shift+C on a Mac) and view-source (Ctrl+U, Cmd+Option+U). Matched on
//     event.code, because Option turns event.key into symbols on a Mac.
//
//   - DevTools open, however it got there (the browser's own menu - Safari's
//     Develop menu, Chrome's More Tools - before the client loaded, undocked):
//     a `debugger` statement is a no-op until DevTools is open, and then it
//     pauses right there. It runs in a WORKER that answers the game's pings.
//     Paused, it stops answering, and the game - still running, because only
//     the worker is paused - sees the silence and leaves while DevTools is
//     still open. (Run on the game's own thread, as it first was, the pause
//     froze the game too, so nothing could leave until DevTools was closed.)
//
//     Except in Safari, and every other WebKit browser: its Web Inspector
//     never pauses a worker on `debugger` (2026-10-16 - opened from the
//     Develop menu, nothing happened at all). There the `debugger` runs on
//     the game's own thread after all: the game freezes for as long as the
//     inspector is open - nothing live to look at, and the server drops the
//     silent connection - and leaves the moment it resumes, whether that is
//     the inspector closing or the player pressing Continue.
//
// Not done: timing console.table against console.log, the usual way to catch
// DevTools with breakpoints deactivated. Tried (2026-10-16), it read as open
// with no DevTools at all in a browser driven over the debugging protocol -
// as automation and some extensions are - and a false positive throws a
// player out. It also had to console.clear() every reading.
//
// A browser driven by automation (navigator.webdriver - Selenium, Puppeteer,
// Playwright and the like) is sent away too, once the watch starts.
//
// Leaving tells the server why first (RpBrowserGuardComposer; the emulator's
// BrowserGuardLog writes it down for staff), then cuts the game - the
// connection to the server closed and the page emptied - so a player who
// manages to hold the redirect up has no game left to look at. The report is
// a lead, not proof: it can be blocked, and under Safari's pause the server
// may have dropped the silent connection before it is sent.
//
// Window-size gaps are left alone on purpose - browser zoom and Chrome's or
// Edge's side panels open the same gap, and a false positive throws a player
// out.
//
// Best effort only, and it cannot be anything more: nothing a page does stops
// a player who disables JavaScript, reads the files some other way or runs a
// modified browser. Every rule that matters is enforced by the server.
//
// Staff (moderator rank and up) are exempt once their rank has arrived - they
// read the pixelrp* traces in DevTools - and so is the dev server. For them no
// worker runs at all, so DevTools never pauses on it.

// The watch starts once the room engine is up; this leaves the permissions
// packet time to land first, so staff are known before the first check.
const WATCH_AFTER_MS = 5000;

// The worker is pinged every PING_EVERY_MS and answers at once unless paused.
// It is only taken for paused after STALL_TICKS of the game's own ticks, each
// on time, have gone by with the ping unanswered: a game that was itself busy
// (a room loading, a long frame) runs late ticks, which do not count, so its
// own stall is never read as the worker's.
const PING_EVERY_MS = 500;
const LATE_TICK_MS = (PING_EVERY_MS * 2);
const STALL_TICKS = 4;

// Safari's fallback: a `debugger` on the game's own thread that DevTools did
// not pause on returns in well under a millisecond; a paused one takes as
// long as the person takes to resume. Far above any garbage-collection pause,
// so a slow machine is never taken for an open inspector.
const PAUSED_AFTER_MS = 500;
const PAUSE_CHECK_EVERY_MS = 1000;

// A `debugger` that is a no-op unless DevTools is open, then a reply.
const WORKER_SOURCE = 'self.onmessage = function(event) { debugger; self.postMessage(event.data); };';

// ui-config.json.example's url.prefix. The live configs still carry it, so it
// names no site at all.
const EXAMPLE_URL_PREFIX = 'https://website.com';

let installed = false;
let watching = false;
let leaving = false;
let stopWatch: () => void = () => null;

const isExempt = (): boolean =>
{
    if((import.meta as any).env?.DEV) return true;

    return !!GetSessionDataManager()?.isModerator;
}

// The CMS home page: url.prefix when it is set to a real site, otherwise the
// root of whatever site is hosting the client - the CMS's /game page, which
// serves it from the same origin.
const GetWebsiteUrl = (): string =>
{
    const prefix = (GetConfiguration<string>('url.prefix', '') ?? '').trim();

    if(prefix.length && (prefix !== EXAMPLE_URL_PREFIX)) return (prefix.replace(/\/+$/, '') + '/');

    try
    {
        return (window.top.location.origin + '/');
    }
    catch
    {
        // A parent on another origin - ours is the same site anyway.
        return (window.location.origin + '/');
    }
}

const leaveForWebsite = (reason: number, detail: string) =>
{
    if(leaving) return;

    leaving = true;
    stopWatch();

    const url = GetWebsiteUrl();

    // Why, for staff - before the connection goes. A socket sends what it
    // already has before it closes. Nothing is sent before login.
    try
    {
        GetConnection()?.send(new RpBrowserGuardComposer(reason, `${ detail } | ${ navigator.userAgent ?? '' }`));
    }
    catch
    {
        // Not connected, or the packet is not registered yet.
    }

    // Nothing left to look at: off the server, and an empty page, before the
    // navigation - which DevTools can hold up - even starts.
    try
    {
        GetConnection()?.dispose();
    }
    catch
    {
        // Already gone.
    }

    document.body?.replaceChildren();

    // The client lives in the CMS's /game iframe: send the whole page, not
    // just the frame.
    try
    {
        (window.top ?? window).location.replace(url);

        return;
    }
    catch
    {
        // A cross-origin parent we cannot navigate.
    }

    window.location.replace(url);
}

const isDevToolsShortcut = (event: KeyboardEvent): boolean =>
{
    if(event.code === 'F12') return true;

    const panel = [ 'KeyI', 'KeyJ', 'KeyC', 'KeyK' ].includes(event.code);

    // Windows/Linux: Ctrl+Shift+I/J/C/K, Ctrl+U. Not Ctrl+Alt - that is AltGr
    // on European layouts, where AltGr+C types a letter.
    if(event.ctrlKey && !event.metaKey)
    {
        if(event.altKey) return false;

        return (event.shiftKey ? panel : (event.code === 'KeyU'));
    }

    // Mac: Cmd+Option+I/J/C/K/U, Cmd+Shift+C (Inspect Element), Cmd+U
    // (Firefox's view-source).
    if(event.metaKey)
    {
        if(event.altKey) return (panel || (event.code === 'KeyU'));

        if(event.shiftKey) return (event.code === 'KeyC');

        return (event.code === 'KeyU');
    }

    return false;
}

const onKeyDown = (event: KeyboardEvent) =>
{
    if(!isDevToolsShortcut(event) || isExempt()) return;

    // Chromium lets a page cancel these; where a browser does not, the page
    // is already on its way out.
    event.preventDefault();
    event.stopPropagation();

    leaveForWebsite(BrowserGuardReason.Shortcut, `shortcut ${ [ (event.ctrlKey ? 'Ctrl' : ''), (event.metaKey ? 'Cmd' : ''), (event.altKey ? 'Alt' : ''), (event.shiftKey ? 'Shift' : ''), event.code ].filter(Boolean).join('+') }`);
}

const onContextMenu = (event: MouseEvent) => event.preventDefault();

export const InstallBrowserGuard = () =>
{
    if(installed) return;

    installed = true;

    window.addEventListener('contextmenu', onContextMenu, { capture: true });
    window.addEventListener('keydown', onKeyDown, { capture: true });
}

// The pinged worker, or null where a page may not start one - then the game's
// own thread is watched instead (startPauseWatch).
const startWorkerWatch = (): (() => void) | null =>
{
    let worker: Worker = null;
    let workerUrl = '';

    try
    {
        workerUrl = URL.createObjectURL(new Blob([ WORKER_SOURCE ], { type: 'text/javascript' }));
        worker = new Worker(workerUrl);
    }
    catch
    {
        if(workerUrl) URL.revokeObjectURL(workerUrl);

        return null;
    }

    let ping = 0;
    let answered = 0;
    let ticksWaiting = 0;
    let lastTickAt = performance.now();

    worker.onmessage = (event: MessageEvent<number>) =>
    {
        answered = Math.max(answered, event.data);
        ticksWaiting = 0;
    };

    const interval = setInterval(() =>
    {
        const now = performance.now();
        const late = ((now - lastTickAt) > LATE_TICK_MS);

        lastTickAt = now;

        // A hidden tab's timers are throttled and Safari suspends it outright:
        // nothing there is evidence, and the count starts over on return.
        if(document.visibilityState !== 'visible' || late)
        {
            ticksWaiting = 0;

            if(answered < ping) return;
        }
        else if(answered < ping)
        {
            if(++ticksWaiting >= STALL_TICKS) leaveForWebsite(BrowserGuardReason.DevToolsOpen, 'open (worker paused)');

            return;
        }

        worker.postMessage(++ping);
    }, PING_EVERY_MS);

    return () =>
    {
        clearInterval(interval);
        worker.terminate();
        URL.revokeObjectURL(workerUrl);
    };
}

// WebKit's engine, whatever the browser's name: Safari, and every browser on
// iOS (CriOS, FxiOS, EdgiOS carry no Chrome token). Every Chromium browser on
// a desktop says Chrome, and Firefox's desktop engine is not WebKit.
const isWebKit = (): boolean =>
{
    const agent = (navigator.userAgent ?? '');

    return (/AppleWebKit/.test(agent) && !/Chrome|Chromium/.test(agent));
}

// Safari's watch, and the fallback wherever a worker cannot be started.
const startPauseWatch = (): (() => void) =>
{
    const interval = setInterval(() =>
    {
        const startedAt = performance.now();

        // eslint-disable-next-line no-debugger
        debugger;

        if((performance.now() - startedAt) > PAUSED_AFTER_MS) leaveForWebsite(BrowserGuardReason.DevToolsOpen, 'open (page paused)');
    }, PAUSE_CHECK_EVERY_MS);

    return () => clearInterval(interval);
}

export const StartDevToolsWatch = () =>
{
    if(watching) return;

    watching = true;

    setTimeout(() =>
    {
        if(leaving || isExempt()) return;

        // Automation sets this for the whole session; nothing a person does.
        if(navigator.webdriver)
        {
            leaveForWebsite(BrowserGuardReason.Automation, 'navigator.webdriver');

            return;
        }

        const stop = ((!isWebKit() && startWorkerWatch()) || startPauseWatch());

        stopWatch = () =>
        {
            stop();
            stopWatch = () => null;
        };

        // A rank that arrives late still exempts: the watch stands down.
        const exemptCheck = setInterval(() =>
        {
            if(!isExempt()) return;

            clearInterval(exemptCheck);
            stopWatch();
        }, WATCH_AFTER_MS);
    }, WATCH_AFTER_MS);
}
