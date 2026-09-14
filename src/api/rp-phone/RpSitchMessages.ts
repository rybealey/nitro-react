import { IMessageComposer, IMessageDataWrapper, IMessageEvent, IMessageParser, MessageEvent } from '@nitrots/nitro-renderer';
import { GetConnection, SendMessageComposer } from '../nitro';

// PixelRP Sitch: the city's feed.
//
// Ids match emulator/Resources/Revisions/1.6.6.json. Client-to-server asks
// occupy 4122-4125 and server-to-client answers 4126-4129; the two directions
// deliberately use different numbers so a mix-up shows up as a dead packet
// rather than as the wrong handler running.
//
// Every payload is read POSITIONALLY, so the order below must match
// SitchPostWriter.WritePost on the emulator exactly. A field added to one side
// only does not error - it silently shifts every value after it.

// client -> server
const RP_GET_SITCH_FEED = 4122;
const RP_GET_SITCH_THREAD = 4123;
const RP_GET_SITCH_PROFILE = 4124;
const RP_GET_SITCH_ACTIVITY = 4125;

// server -> client
const RP_SITCH_FEED = 4126;
const RP_SITCH_THREAD = 4127;
const RP_SITCH_PROFILE = 4128;
const RP_SITCH_ACTIVITY = 4129;

export interface SitchPost
{
    id: number;
    parentId: number;
    userId: number;
    username: string;
    figure: string;
    rank: number;
    body: string;
    photoId: number;
    photoUrl: string;
    photoRoom: string;
    createdAt: number;
    replies: number;
    likes: number;
    reposts: number;
    /** Whether the VIEWER has liked or reposted this, not the author. */
    liked: boolean;
    reposted: boolean;
}

export interface SitchProfile
{
    userId: number;
    username: string;
    figure: string;
    motto: string;
    bio: string;
    /** The 11-character YouTube id. Cover art is built from it, never stored. */
    favoriteVideoId: string;
    favoriteTitle: string;
    favoriteAuthor: string;
    followers: number;
    following: number;
    follows: boolean;
}

export interface SitchActivity
{
    id: number;
    actorId: number;
    actorName: string;
    actorFigure: string;
    kind: string;
    postId: number;
    postBody: string;
    createdAt: number;
    seen: boolean;
}

const readPost = (wrapper: IMessageDataWrapper): SitchPost => ({
    id: wrapper.readInt(),
    parentId: wrapper.readInt(),
    userId: wrapper.readInt(),
    username: wrapper.readString(),
    figure: wrapper.readString(),
    rank: wrapper.readInt(),
    body: wrapper.readString(),
    photoId: wrapper.readInt(),
    photoUrl: wrapper.readString(),
    photoRoom: wrapper.readString(),
    createdAt: wrapper.readInt(),
    replies: wrapper.readInt(),
    likes: wrapper.readInt(),
    reposts: wrapper.readInt(),
    liked: (wrapper.readInt() === 1),
    reposted: (wrapper.readInt() === 1)
});

const readPosts = (wrapper: IMessageDataWrapper): SitchPost[] =>
{
    const total = wrapper.readInt();
    const posts: SitchPost[] = [];

    for(let i = 0; i < total; i++) posts.push(readPost(wrapper));

    return posts;
}

export class RpSitchFeedParser implements IMessageParser
{
    private _following: boolean = false;
    private _posts: SitchPost[] = [];

    public flush(): boolean
    {
        this._following = false;
        this._posts = [];

        return true;
    }

    public parse(wrapper: IMessageDataWrapper): boolean
    {
        if(!wrapper) return false;

        this._following = (wrapper.readInt() === 1);
        this._posts = readPosts(wrapper);

        return true;
    }

    public get following(): boolean 
    {
        return this._following; 
    }
    public get posts(): SitchPost[] 
    {
        return this._posts; 
    }
}

export class RpSitchThreadParser implements IMessageParser
{
    private _postId: number = 0;
    private _posts: SitchPost[] = [];

    public flush(): boolean
    {
        this._postId = 0;
        this._posts = [];

        return true;
    }

    public parse(wrapper: IMessageDataWrapper): boolean
    {
        if(!wrapper) return false;

        this._postId = wrapper.readInt();
        this._posts = readPosts(wrapper);

        return true;
    }

    public get postId(): number 
    {
        return this._postId; 
    }
    /** The root first, then its replies oldest first. */
    public get posts(): SitchPost[] 
    {
        return this._posts; 
    }
}

export class RpSitchProfileParser implements IMessageParser
{
    private _profile: SitchProfile = null;
    private _posts: SitchPost[] = [];

    public flush(): boolean
    {
        this._profile = null;
        this._posts = [];

        return true;
    }

    public parse(wrapper: IMessageDataWrapper): boolean
    {
        if(!wrapper) return false;

        this._profile = {
            userId: wrapper.readInt(),
            username: wrapper.readString(),
            figure: wrapper.readString(),
            motto: wrapper.readString(),
            bio: wrapper.readString(),
            favoriteVideoId: wrapper.readString(),
            favoriteTitle: wrapper.readString(),
            favoriteAuthor: wrapper.readString(),
            followers: wrapper.readInt(),
            following: wrapper.readInt(),
            follows: (wrapper.readInt() === 1)
        };
        this._posts = readPosts(wrapper);

        return true;
    }

    public get profile(): SitchProfile 
    {
        return this._profile; 
    }
    public get posts(): SitchPost[] 
    {
        return this._posts; 
    }
}

export class RpSitchActivityParser implements IMessageParser
{
    private _rows: SitchActivity[] = [];

    public flush(): boolean
    {
        this._rows = [];

        return true;
    }

    public parse(wrapper: IMessageDataWrapper): boolean
    {
        if(!wrapper) return false;

        const total = wrapper.readInt();
        const rows: SitchActivity[] = [];

        for(let i = 0; i < total; i++)
        {
            rows.push({
                id: wrapper.readInt(),
                actorId: wrapper.readInt(),
                actorName: wrapper.readString(),
                actorFigure: wrapper.readString(),
                kind: wrapper.readString(),
                postId: wrapper.readInt(),
                postBody: wrapper.readString(),
                createdAt: wrapper.readInt(),
                seen: (wrapper.readInt() === 1)
            });
        }

        this._rows = rows;

        return true;
    }

    public get rows(): SitchActivity[] 
    {
        return this._rows; 
    }
}

export class RpSitchFeedEvent extends MessageEvent implements IMessageEvent
{
    constructor(callBack: Function) 
    {
        super(callBack, RpSitchFeedParser); 
    }
    public getParser(): RpSitchFeedParser 
    {
        return this.parser as RpSitchFeedParser; 
    }
}

export class RpSitchThreadEvent extends MessageEvent implements IMessageEvent
{
    constructor(callBack: Function) 
    {
        super(callBack, RpSitchThreadParser); 
    }
    public getParser(): RpSitchThreadParser 
    {
        return this.parser as RpSitchThreadParser; 
    }
}

export class RpSitchProfileEvent extends MessageEvent implements IMessageEvent
{
    constructor(callBack: Function) 
    {
        super(callBack, RpSitchProfileParser); 
    }
    public getParser(): RpSitchProfileParser 
    {
        return this.parser as RpSitchProfileParser; 
    }
}

export class RpSitchActivityEvent extends MessageEvent implements IMessageEvent
{
    constructor(callBack: Function) 
    {
        super(callBack, RpSitchActivityParser); 
    }
    public getParser(): RpSitchActivityParser 
    {
        return this.parser as RpSitchActivityParser; 
    }
}

class RpSitchComposerBase implements IMessageComposer<(string | number)[]>
{
    protected _data: (string | number)[] = [];

    public getMessageArray() 
    {
        return this._data; 
    }

    public dispose(): void 
    {
        return; 
    }
}

export class RpGetSitchFeedComposer extends RpSitchComposerBase
{
    constructor(following: boolean) 
    {
        super(); this._data = [ following ? 1 : 0 ]; 
    }
}

export class RpGetSitchThreadComposer extends RpSitchComposerBase
{
    constructor(postId: number) 
    {
        super(); this._data = [ postId ]; 
    }
}

export class RpGetSitchProfileComposer extends RpSitchComposerBase
{
    /** 0 asks for your own, so the client need not know its own user id. */
    constructor(userId: number = 0) 
    {
        super(); this._data = [ userId ]; 
    }
}

export class RpGetSitchActivityComposer extends RpSitchComposerBase
{
    constructor() 
    {
        super(); this._data = []; 
    }
}

export const SendSitchFeed = (following: boolean): void => SendMessageComposer(new RpGetSitchFeedComposer(following));
export const SendSitchThread = (postId: number): void => SendMessageComposer(new RpGetSitchThreadComposer(postId));
export const SendSitchProfile = (userId: number = 0): void => SendMessageComposer(new RpGetSitchProfileComposer(userId));
export const SendSitchActivity = (): void => SendMessageComposer(new RpGetSitchActivityComposer());

/** Cover art for a favorite song, built from the id the way Tunes does it. */
export const SitchSongArt = (videoId: string): string => (videoId ? `https://i.ytimg.com/vi/${ videoId }/mqdefault.jpg` : '');

let registered = false;

export const RegisterRpSitchMessages = () =>
{
    if(registered) return;

    const connection = GetConnection();

    if(!connection) return;

    connection.registerMessages({
        events: new Map<number, Function>([
            [ RP_SITCH_FEED, RpSitchFeedEvent ],
            [ RP_SITCH_THREAD, RpSitchThreadEvent ],
            [ RP_SITCH_PROFILE, RpSitchProfileEvent ],
            [ RP_SITCH_ACTIVITY, RpSitchActivityEvent ]
        ]),
        composers: new Map<number, Function>([
            [ RP_GET_SITCH_FEED, RpGetSitchFeedComposer ],
            [ RP_GET_SITCH_THREAD, RpGetSitchThreadComposer ],
            [ RP_GET_SITCH_PROFILE, RpGetSitchProfileComposer ],
            [ RP_GET_SITCH_ACTIVITY, RpGetSitchActivityComposer ]
        ])
    });

    registered = true;
}
