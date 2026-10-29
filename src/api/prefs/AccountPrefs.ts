import { IMessageComposer, IMessageDataWrapper, IMessageEvent, IMessageParser, MessageEvent } from '@nitrots/nitro-renderer';
import { GetCommunication, GetConnection, SendMessageComposer } from '../nitro';

// PixelRP: the player's settings are kept on the ACCOUNT, like the macros
// (Twist, 2026-10-19: "all settings and hud colours should be kept by account,
// just like macros") - so they follow the player to any browser or machine.
//
// The server keeps one document per player: these same storage keys, each with
// the string it used to hold in localStorage (user_prefs, 279_UserPrefs.sql).
// This browser's localStorage stays as a live cache of it, so every setting
// still reads synchronously and the page draws at once; the account's copy
// arrives at login (RpPrefsEvent), overwrites the cache, and every store reads
// itself again (OnAccountPrefsLoaded). A setting changed here is written to the
// cache and the whole document is saved, a second after the last change.
//
// The first login after this shipped finds no document ('' - never saved):
// this browser's settings become the account's, so nobody loses theirs.

const RP_PREFS = 4218; // server -> client: the document, '' when never saved
const RP_SAVE_PREFS = 4219; // client -> server: the whole document

const SAVE_DELAY_MS = 1000;

// Every setting the account keeps, by its storage key. The emulator holds the
// same list (RpSavePrefsEvent) and drops anything else.
const ACCOUNT_KEYS = new Set<string>([
    // Settings > General
    'pixelrp.prefs.fps.max',
    'pixelrp.prefs.fps.slow',
    'pixelrp.prefs.room.drag',
    'pixelrp.prefs.clock24',
    'pixelrp.prefs.celsius',
    'pixelrp.ping-volume',
    'pixelrp.music.volume',
    'pixelrp.prefs.phone.hold',
    // Settings > UI
    'pixelrp.prefs.hud',
    'pixelrp.prefs.colours.saved',
    'pixelrp.prefs.iconTint',
    'pixelrp.prefs.cursor.style',
    'pixelrp.prefs.cursor.colour',
    'pixelrp.prefs.target.highlight',
    'pixelrp.environment.weather',
    // the music player and your profile song
    'pixelrp.jukebox.volume',
    'pixelrp.jukebox.muted',
    'pixelrp.jukebox.roompaused',
    'pixelrp.song.volume',
    'pixelrp.song.muted',
    // panels left open or closed
    'pixelrp.side-drawer.expanded',
    'pixelrp.turf-panel.expanded',
    'pixelrp.backpack.item-use-mode',
    // the screen the window positions below were saved on
    'nitro.screensize'
]);

// Where each window was last dragged to, and its size (nitro.windows.<window>).
const WINDOW_PREFIX = 'nitro.windows.';
const SCREEN_KEY = 'nitro.screensize';

export const IsAccountPrefKey = (key: string): boolean => (!!key && (ACCOUNT_KEYS.has(key) || key.startsWith(WINDOW_PREFIX)));

class RpPrefsParser implements IMessageParser
{
    private _data: string;

    public flush(): boolean
    {
        this._data = '';

        return true;
    }

    public parse(wrapper: IMessageDataWrapper): boolean
    {
        if(!wrapper) return false;

        this._data = wrapper.readString();

        return true;
    }

    public get data(): string
    {
        return this._data;
    }
}

class RpPrefsEvent extends MessageEvent implements IMessageEvent
{
    constructor(callBack: Function)
    {
        super(callBack, RpPrefsParser);
    }

    public getParser(): RpPrefsParser
    {
        return this.parser as RpPrefsParser;
    }
}

class RpSavePrefsComposer implements IMessageComposer<string[]>
{
    private _data: string[];

    constructor(document: string)
    {
        this._data = [ document ];
    }

    public getMessageArray()
    {
        return this._data;
    }

    public dispose(): void
    {
        return;
    }
}

// null until the server has answered; then the account's document
let account: Record<string, string> = null;
// changed before the server answered - newer than its copy, so kept over it
const early = new Map<string, string>();
let saveTimer: ReturnType<typeof setTimeout> = null;
const loadedListeners = new Set<() => void>();

const readLocal = (key: string): string =>
{
    try
    {
        return window.localStorage.getItem(key);
    }
    catch(e)
    {
        return null;
    }
}

const writeLocal = (key: string, value: string): void =>
{
    try
    {
        if(value === null) window.localStorage.removeItem(key);
        else window.localStorage.setItem(key, value);
    }
    catch(e)
    {
        // storage blocked: the account still has it
    }
}

const localAccountKeys = (): string[] =>
{
    const keys: string[] = [];

    try
    {
        for(let i = 0; i < window.localStorage.length; i++)
        {
            const key = window.localStorage.key(i);

            if(IsAccountPrefKey(key)) keys.push(key);
        }
    }
    catch(e)
    {
        // storage blocked: nothing to bring
    }

    return keys;
}

// A save waiting on its timer, sent now.
const saveNow = (): void =>
{
    if(!saveTimer) return;

    clearTimeout(saveTimer);
    saveTimer = null;

    SendMessageComposer(new RpSavePrefsComposer(JSON.stringify(account)));
}

const scheduleSave = (): void =>
{
    if(!account) return;

    if(saveTimer) clearTimeout(saveTimer);

    saveTimer = setTimeout(saveNow, SAVE_DELAY_MS);
}

/** A setting's stored string, as localStorage.getItem gives it - the account's once it has arrived. */
export const ReadPref = (key: string): string => readLocal(key);

/** Store a setting (null removes it): this browser at once, and the account if it keeps that key. */
export const WritePref = (key: string, value: string): void =>
{
    writeLocal(key, value);

    if(!IsAccountPrefKey(key)) return;

    if(!account)
    {
        early.set(key, value);

        return;
    }

    if(value === null) delete account[key];
    else account[key] = value;

    scheduleSave();
}

/** Called once the account's settings have arrived and replaced this browser's. */
export const OnAccountPrefsLoaded = (listener: () => void): (() => void) =>
{
    loadedListeners.add(listener);

    return () =>
    {
        loadedListeners.delete(listener);
    };
}

// Window positions belong to the screen they were saved on: on a different
// screen size they are dropped, so no window opens off the edge. This is the
// check useSessionInfo used to make against this browser at start-up; it runs
// here instead, against the account, once its copy is in.
const checkScreen = (): boolean =>
{
    let saved: { width: number, height: number } = null;

    try
    {
        saved = JSON.parse(account[SCREEN_KEY] ?? 'null');
    }
    catch(e)
    {
        saved = null;
    }

    const width = window.innerWidth;
    const height = window.innerHeight;

    if(saved && (saved.width === width) && (saved.height === height)) return false;

    if(saved)
    {
        for(const key of Object.keys(account))
        {
            if(!key.startsWith(WINDOW_PREFIX)) continue;

            delete account[key];
            writeLocal(key, null);
        }
    }

    const screen = JSON.stringify({ width, height });

    account[SCREEN_KEY] = screen;
    writeLocal(SCREEN_KEY, screen);

    return true;
}

const onPrefs = (event: RpPrefsEvent): void =>
{
    const payload = event.getParser().data;
    let saved: Record<string, string> = null;

    if(payload)
    {
        try
        {
            const parsed = JSON.parse(payload);

            if(parsed && (typeof parsed === 'object') && !Array.isArray(parsed))
            {
                saved = {};

                for(const [ key, value ] of Object.entries(parsed))
                {
                    if(IsAccountPrefKey(key) && (typeof value === 'string')) saved[key] = value;
                }
            }
        }
        catch(e)
        {
            saved = null;
        }
    }

    let changed = false;

    if(!saved)
    {
        // never saved: this browser's settings become the account's
        account = {};

        for(const key of localAccountKeys())
        {
            const value = readLocal(key);

            if(value !== null) account[key] = value;
        }

        changed = true;
    }
    else
    {
        // the account wins: this browser's copy is brought in line with it
        account = saved;

        for(const key of localAccountKeys())
        {
            if(!(key in account)) writeLocal(key, null);
        }

        for(const [ key, value ] of Object.entries(account)) writeLocal(key, value);
    }

    for(const [ key, value ] of early)
    {
        if(value === null) delete account[key];
        else account[key] = value;

        writeLocal(key, value);
        changed = true;
    }

    early.clear();

    if(checkScreen()) changed = true;

    if(changed) scheduleSave();

    loadedListeners.forEach(listener => listener());
}

let registered = false;

export const RegisterAccountPrefs = () =>
{
    if(registered) return;

    const connection = GetConnection();

    if(!connection) return;

    connection.registerMessages({
        events: new Map<number, Function>([ [ RP_PREFS, RpPrefsEvent ] ]),
        composers: new Map<number, Function>([ [ RP_SAVE_PREFS, RpSavePrefsComposer ] ])
    });

    GetCommunication().registerMessageEvent(new RpPrefsEvent(onPrefs));

    // pixelrp (Twist, 2026-10-27): a change made in the second before the page
    // goes - a reload, the tab closed or put away - is sent there and then. It
    // waited on the timer, and the next login put the account's older copy
    // back over it.
    window.addEventListener('pagehide', saveNow);
    document.addEventListener('visibilitychange', () =>
    {
        if(document.visibilityState === 'hidden') saveNow();
    });

    registered = true;
}
