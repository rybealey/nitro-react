import { IMessageDataWrapper, IMessageEvent, IMessageParser, MessageEvent } from '@nitrots/nitro-renderer';
import { GetConnection } from '../nitro';

// PixelRP phone notification packet - client-source, registered at runtime.
// Wire id matches the emulator's Resources/Revisions/1.6.6.json.
const RP_NOTIFICATION = 4021; // server -> client: something happened

// Which app a notification belongs to. The four the server pushes, plus the
// two the client raises for itself: Messages and Contacts already track
// everything a notification would need (unread threads, pending requests), so
// no packet has to tell us about them.
export type NotifyApp = 'photos' | 'contacts' | 'calendar' | 'notes' | 'news' | 'messages';

// What happened. The wording for every one of these lives in
// usePhoneNotifications, so a notification is one place to read and one place
// to change.
export type NotifyKind =
    | 'album_invite' | 'album_photo'
    | 'note_shared' | 'note_updated'
    | 'event_new' | 'event_changed' | 'event_cancelled' | 'event_soon'
    | 'story'
    | 'message' | 'friend_request' | 'friend_on' | 'friend_off';

export interface NotifyPush
{
    app: NotifyApp;
    kind: NotifyKind;
    // the name of the thing: album, note title, event title, headline
    subject: string;
    // who caused it, '' when nobody did
    actor: string;
    // the album / note / event / post to open, and what repeats group by
    targetId: number;
    // kind-specific: the old start time on event_changed (0 = something else
    // about the event moved)
    extra: number;
    // a banner only - never badged, never kept
    transient: boolean;
}

export class RpNotificationParser implements IMessageParser
{
    private _push: NotifyPush;

    public flush(): boolean
    {
        this._push = null;

        return true;
    }

    public parse(wrapper: IMessageDataWrapper): boolean
    {
        if(!wrapper) return false;

        this._push = {
            app: (wrapper.readString() as NotifyApp),
            kind: (wrapper.readString() as NotifyKind),
            subject: wrapper.readString(),
            actor: wrapper.readString(),
            targetId: wrapper.readInt(),
            extra: wrapper.readInt(),
            transient: (wrapper.readInt() === 1)
        };

        return true;
    }

    public get push(): NotifyPush { return this._push; }
}

export class RpNotificationEvent extends MessageEvent implements IMessageEvent
{
    constructor(callBack: Function)
    {
        super(callBack, RpNotificationParser);
    }

    public getParser(): RpNotificationParser
    {
        return this.parser as RpNotificationParser;
    }
}

let registered = false;

export const RegisterRpNotificationMessages = () =>
{
    if(registered) return;

    const connection = GetConnection();

    if(!connection) return;

    connection.registerMessages({
        events: new Map<number, Function>([ [ RP_NOTIFICATION, RpNotificationEvent ] ]),
        composers: new Map<number, Function>()
    });

    registered = true;
}
