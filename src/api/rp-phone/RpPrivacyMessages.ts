import { IMessageComposer, IMessageDataWrapper, IMessageEvent, IMessageParser, MessageEvent } from '@nitrots/nitro-renderer';
import { GetCommunication, GetConnection, SendMessageComposer } from '../nitro';

// PixelRP profile privacy - who may see the personal details on your profile.
// Client-source packets, registered at runtime like the rest of the phone's.
// Wire ids match the emulator's Resources/Revisions/1.6.6.json.
//
// Only ever YOUR OWN settings travel: nobody is told what anybody else chose.
// What another player may see is answered by the server giving or withholding
// the data itself (their region comes back empty, their birthday as 0/0), so
// hidden and never-set look identical from outside - which is the whole point.

// server -> client, at login and after every save
const RP_PRIVACY = 4025;

// client -> server
const RP_SAVE_PRIVACY = 4023;

/** Birthday audiences, and the two ends of the region's. */
export const PRIVACY_NOBODY = 0;
export const PRIVACY_CONTACTS = 1;
export const PRIVACY_EVERYONE = 2;

/** Region only: the audience is whichever lists are switched on. */
export const PRIVACY_CUSTOM = 1;

export interface RpPrivacy
{
    birthday: number;
    region: number;
    regionColleagues: boolean;
    regionFriends: boolean;
}

// What the server assumes for a player who has never opened the screen, so the
// screen renders the same thing before the login push lands.
const DEFAULT_PRIVACY: RpPrivacy = { birthday: PRIVACY_CONTACTS, region: PRIVACY_EVERYONE, regionColleagues: true, regionFriends: true };

export class RpPrivacyParser implements IMessageParser
{
    private _privacy: RpPrivacy = { ...DEFAULT_PRIVACY };

    public flush(): boolean
    {
        this._privacy = { ...DEFAULT_PRIVACY };

        return true;
    }

    public parse(wrapper: IMessageDataWrapper): boolean
    {
        if(!wrapper) return false;

        this._privacy = {
            birthday: wrapper.readInt(),
            region: wrapper.readInt(),
            regionColleagues: (wrapper.readInt() === 1),
            regionFriends: (wrapper.readInt() === 1)
        };

        return true;
    }

    public get privacy(): RpPrivacy { return this._privacy; }
}

export class RpPrivacyEvent extends MessageEvent implements IMessageEvent
{
    constructor(callBack: Function)
    {
        super(callBack, RpPrivacyParser);
    }

    public getParser(): RpPrivacyParser
    {
        return this.parser as RpPrivacyParser;
    }
}

class RpPrivacyComposerBase implements IMessageComposer<number[]>
{
    private _data: number[];

    constructor(...data: number[]) { this._data = data; }

    public getMessageArray() { return this._data; }

    public dispose(): void { return; }
}

export class RpSavePrivacyComposer extends RpPrivacyComposerBase
{
    constructor(privacy: RpPrivacy)
    {
        super(privacy.birthday, privacy.region, privacy.regionColleagues ? 1 : 0, privacy.regionFriends ? 1 : 0);
    }
}

// ---- the store ----------------------------------------------------------
// A module singleton like the region and wanted stores: the login push lands
// long before the phone's Privacy screen is opened.

let privacy: RpPrivacy = { ...DEFAULT_PRIVACY };

const listeners = new Set<() => void>();

export const GetRpPrivacy = (): RpPrivacy => privacy;

export const SubscribeRpPrivacy = (listener: () => void): (() => void) =>
{
    listeners.add(listener);

    return () => listeners.delete(listener);
}

/** Optimistic: the screen moves at once and the server echoes what it stored. */
export const SaveRpPrivacy = (next: RpPrivacy): void =>
{
    privacy = next;

    listeners.forEach(listener => listener());

    SendMessageComposer(new RpSavePrivacyComposer(next));
}

const onPrivacy = (event: RpPrivacyEvent) =>
{
    const parser = event.getParser();

    if(!parser) return;

    privacy = parser.privacy;

    listeners.forEach(listener => listener());
}

let registered = false;

export const RegisterRpPrivacyMessages = () =>
{
    if(registered) return;

    const connection = GetConnection();

    if(!connection) return;

    connection.registerMessages({
        events: new Map<number, Function>([ [ RP_PRIVACY, RpPrivacyEvent ] ]),
        composers: new Map<number, Function>([ [ RP_SAVE_PRIVACY, RpSavePrivacyComposer ] ])
    });

    GetCommunication().registerMessageEvent(new RpPrivacyEvent(onPrivacy));

    registered = true;
}
