import { GetConfiguration, GetSessionDataManager } from '../nitro';

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
//   - DevTools already open, however it got there (the browser menu, before
//     the client loaded, undocked into its own window): a `debugger` statement
//     is a no-op until DevTools is open, and then it pauses right there, so a
//     statement that takes more than a moment to run means someone is
//     watching. That is the one signal every browser gives. Window-size gaps
//     are left alone on purpose - browser zoom and Chrome's or Edge's side
//     panels open the same gap, and a false positive throws a player out.
//
// Best effort only, and it cannot be anything more: nothing a page does stops
// a player who disables JavaScript, deactivates breakpoints before opening
// DevTools, or reads the files some other way. Every rule that matters is
// enforced by the server.
//
// Staff (moderator rank and up) are exempt once their rank has arrived - they
// read the pixelrp* traces in DevTools - and so is the dev server.

// A `debugger` that DevTools did not pause on returns in well under a
// millisecond; a paused one takes as long as the person takes to resume.
// Far above any garbage-collection pause, so a slow machine is never taken
// for an open DevTools.
const PAUSED_AFTER_MS = 500;
const WATCH_EVERY_MS = 1000;
// The watch starts once the room engine is up; this leaves the permissions
// packet time to land first, so staff are known before the first check.
const WATCH_AFTER_MS = 5000;

// ui-config.json.example's url.prefix. The live configs still carry it, so it
// names no site at all.
const EXAMPLE_URL_PREFIX = 'https://website.com';

let installed = false;
let watching = false;
let leaving = false;

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

const leaveForWebsite = () =>
{
    if(leaving) return;

    leaving = true;

    const url = GetWebsiteUrl();

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

    leaveForWebsite();
}

const onContextMenu = (event: MouseEvent) => event.preventDefault();

const pausedByDevTools = (): boolean =>
{
    const startedAt = performance.now();

    // eslint-disable-next-line no-debugger
    debugger;

    return ((performance.now() - startedAt) > PAUSED_AFTER_MS);
}

export const InstallBrowserGuard = () =>
{
    if(installed) return;

    installed = true;

    window.addEventListener('contextmenu', onContextMenu, { capture: true });
    window.addEventListener('keydown', onKeyDown, { capture: true });
}

export const StartDevToolsWatch = () =>
{
    if(watching) return;

    watching = true;

    setTimeout(() => setInterval(() =>
    {
        if(isExempt()) return;

        if(pausedByDevTools()) leaveForWebsite();
    }, WATCH_EVERY_MS), WATCH_AFTER_MS);
}
