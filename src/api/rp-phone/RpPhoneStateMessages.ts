import { IMessageComposer, IMessageDataWrapper, IMessageEvent, IMessageParser, MessageEvent } from '@nitrots/nitro-renderer';
import { GetCommunication, GetConnection, SendMessageComposer } from '../nitro';

// PixelRP phone state - client-source packets, registered at runtime like the
// gang, corp and chat packets. Wire ids match the emulator's
// Resources/Revisions/1.6.6.json.
//
// The phone used to keep everything about itself in localStorage: the
// home-screen layout and dock, installed apps, wallpaper, theme, where it
// opens, accessibility and notification switches, pinned and muted
// conversations, and the Notification Center's history. A new computer meant
// a factory-reset phone. Those now live on the server as two JSON documents
// the CLIENT owns and versions (usePhone / usePhoneNotifications parse and
// re-validate every field on read); the emulator only checks they are JSON of
// the right kind and hands them back at login.

// server -> client, at login
const RP_PHONE_STATE = 3900;
// client -> server
const RP_SAVE_PHONE_STATE = 3954;

// Which document a save is for; mirrors RpSavePhoneStateEvent.
export const PHONE_DOC_PREFS: number = 0;
export const PHONE_DOC_NOTIFICATIONS: number = 1;

export class RpPhoneStateParser implements IMessageParser
{
    private _prefs: string = '';
    private _notifications: string = '';

    public flush(): boolean
    {
        this._prefs = '';
        this._notifications = '';

        return true;
    }

    public parse(wrapper: IMessageDataWrapper): boolean
    {
        if(!wrapper) return false;

        this._prefs = wrapper.readString();
        this._notifications = wrapper.readString();

        return true;
    }

    public get prefs(): string { return this._prefs; }
    public get notifications(): string { return this._notifications; }
}

export class RpPhoneStateEvent extends MessageEvent implements IMessageEvent
{
    constructor(callBack: Function)
    {
        super(callBack, RpPhoneStateParser);
    }

    public getParser(): RpPhoneStateParser
    {
        return this.parser as RpPhoneStateParser;
    }
}

// The constructor arguments ARE the wire payload, in order.
export class RpSavePhoneStateComposer implements IMessageComposer<(string | number)[]>
{
    private _data: (string | number)[];

    constructor(kind: number, document: string)
    {
        this._data = [ kind, document ];
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

// ---- the store ----------------------------------------------------------
// A plain module singleton, like MacroState, and for the same reason: the
// login push lands right behind AuthenticationOk, before any phone hook has
// mounted, so it has to be caught by a listener that exists for the whole
// session and kept somewhere the hooks can read whenever they get round to it.

export interface RpPhoneState
{
    // the two documents exactly as the server holds them; '' = never saved
    prefs: string;
    notifications: string;
    // false until the login push has arrived - nothing should be read before
    loaded: boolean;
}

let state: RpPhoneState = { prefs: '', notifications: '', loaded: false };

const listeners = new Set<() => void>();

export const GetPhoneState = (): RpPhoneState => state;

// Fires on a SERVER push only, never on our own saves: a save is the hooks
// telling the store what they already have, and echoing it back would only
// re-render them with identical values.
export const SubscribePhoneState = (listener: () => void): (() => void) =>
{
    listeners.add(listener);

    return () => listeners.delete(listener);
}

export const SavePhonePrefs = (document: string): void =>
{
    state = { ...state, prefs: document };

    SendMessageComposer(new RpSavePhoneStateComposer(PHONE_DOC_PREFS, document));
}

// Notifications arrive in bursts - a friend list waking up, several photos
// dropped into an album - and each one rewrites the whole list, so the send is
// trailing-debounced. The cache updates at once so a reload mid-burst still
// reads the newest list; only the wire is coalesced.
const NOTIFICATIONS_DEBOUNCE_MS: number = 1500;

let pendingNotifications: string = null;
let notificationsTimer: ReturnType<typeof setTimeout> = null;

export const FlushPhoneNotifications = (): void =>
{
    if(notificationsTimer)
    {
        clearTimeout(notificationsTimer);

        notificationsTimer = null;
    }

    if(pendingNotifications === null) return;

    const document = pendingNotifications;

    pendingNotifications = null;

    SendMessageComposer(new RpSavePhoneStateComposer(PHONE_DOC_NOTIFICATIONS, document));
}

export const SavePhoneNotifications = (document: string): void =>
{
    state = { ...state, notifications: document };
    pendingNotifications = document;

    if(notificationsTimer) clearTimeout(notificationsTimer);

    notificationsTimer = setTimeout(FlushPhoneNotifications, NOTIFICATIONS_DEBOUNCE_MS);
}

const onPhoneState = (event: RpPhoneStateEvent) =>
{
    const parser = event.getParser();

    if(!parser) return;

    // A push always wins over whatever was pending: it is the server telling
    // us what it has, and anything still debounced predates it.
    pendingNotifications = null;

    if(notificationsTimer)
    {
        clearTimeout(notificationsTimer);

        notificationsTimer = null;
    }

    state = { prefs: (parser.prefs ?? ''), notifications: (parser.notifications ?? ''), loaded: true };

    listeners.forEach(listener => listener());
}

let registered = false;

export const RegisterRpPhoneStateMessages = () =>
{
    if(registered) return;

    const connection = GetConnection();

    if(!connection) return;

    connection.registerMessages({
        events: new Map<number, Function>([ [ RP_PHONE_STATE, RpPhoneStateEvent ] ]),
        composers: new Map<number, Function>([ [ RP_SAVE_PHONE_STATE, RpSavePhoneStateComposer ] ])
    });

    // Registered here rather than from a hook - see "the store" above.
    GetCommunication().registerMessageEvent(new RpPhoneStateEvent(onPhoneState));

    // Best effort: a debounced notification save should not be lost to a tab
    // closing 1.4 seconds after the last arrival. The socket may already be on
    // its way down, so this is a chance, not a guarantee.
    window.addEventListener('pagehide', FlushPhoneNotifications);

    registered = true;
}
