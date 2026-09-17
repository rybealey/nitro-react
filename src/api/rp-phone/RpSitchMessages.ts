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

const RP_SITCH_POST = 4130;
const RP_SITCH_LIKE = 4131;
const RP_SITCH_REPOST = 4132;
const RP_SITCH_FOLLOW = 4133;
const RP_SITCH_DELETE = 4134;
const RP_SITCH_SET_BIO = 4135;
const RP_SITCH_SET_SONG = 4136;
const RP_SITCH_SEARCH = 4137;

// server -> client
const RP_SITCH_FEED = 4126;
const RP_SITCH_THREAD = 4127;
const RP_SITCH_PROFILE = 4128;
const RP_SITCH_ACTIVITY = 4129;
const RP_SITCH_SEARCH_RESULT = 4138;

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
    /**
     * On a PROFILE, who put this post there by reposting it - empty when they
     * wrote it themselves. This is how a timeline can carry somebody else's
     * post and still say whose shelf it is sitting on.
     */
    repostedBy: string;
    /** When the repost happened; the profile is ordered by it. */
    repostedAt: number;
    /**
     * A song attached to the post, or empty. Same shape as a profile's
     * favorite song: the id is the identity, the title and author are what
     * oEmbed said when the post was written.
     */
    songVideoId: string;
    songTitle: string;
    songAuthor: string;
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

export interface SitchPerson
{
    userId: number;
    username: string;
    figure: string;
    bio: string;
    followers: number;
    follows: boolean;
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
    reposted: (wrapper.readInt() === 1),
    // Only a profile ever fills these in; everywhere else they arrive empty.
    repostedBy: wrapper.readString(),
    repostedAt: wrapper.readInt(),
    songVideoId: wrapper.readString(),
    songTitle: wrapper.readString(),
    songAuthor: wrapper.readString()
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
    private _canModerate: boolean = false;
    private _posts: SitchPost[] = [];

    public flush(): boolean
    {
        this._following = false;
        this._canModerate = false;
        this._posts = [];

        return true;
    }

    public parse(wrapper: IMessageDataWrapper): boolean
    {
        if(!wrapper) return false;

        this._following = (wrapper.readInt() === 1);
        this._canModerate = (wrapper.readInt() === 1);
        this._posts = readPosts(wrapper);

        return true;
    }

    /** Whether to OFFER staff removal. The server checks it again before acting. */
    public get canModerate(): boolean
    {
        return this._canModerate;
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

export class RpSitchSearchParser implements IMessageParser
{
    private _query: string = '';
    private _people: SitchPerson[] = [];
    private _posts: SitchPost[] = [];

    public flush(): boolean
    {
        this._query = '';
        this._people = [];
        this._posts = [];

        return true;
    }

    public parse(wrapper: IMessageDataWrapper): boolean
    {
        if(!wrapper) return false;

        this._query = wrapper.readString();

        const total = wrapper.readInt();
        const people: SitchPerson[] = [];

        for(let i = 0; i < total; i++)
        {
            people.push({
                userId: wrapper.readInt(),
                username: wrapper.readString(),
                figure: wrapper.readString(),
                bio: wrapper.readString(),
                followers: wrapper.readInt(),
                follows: (wrapper.readInt() === 1)
            });
        }

        this._people = people;
        this._posts = readPosts(wrapper);

        return true;
    }

    /** Rides back so a slow answer cannot overwrite a newer question. */
    public get query(): string
    {
        return this._query;
    }

    public get people(): SitchPerson[]
    {
        return this._people;
    }

    public get posts(): SitchPost[]
    {
        return this._posts;
    }
}

export class RpSitchSearchEvent extends MessageEvent implements IMessageEvent
{
    constructor(callBack: Function)
    {
        super(callBack, RpSitchSearchParser);
    }
    public getParser(): RpSitchSearchParser
    {
        return this.parser as RpSitchSearchParser;
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
    /**
     * 0 asks for your own, so the client need not know its own user id. The
     * optional username is read only when the id is 0 - that is how tapping a
     * mention opens a profile, since a post body carries the name, not the id.
     */
    constructor(userId: number = 0, username: string = null)
    {
        super();
        this._data = ((username === null) ? [ userId ] : [ userId, username ]);
    }
}

export class RpSitchSearchComposer extends RpSitchComposerBase
{
    constructor(query: string)
    {
        super();
        this._data = [ query ];
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
export const SendSitchProfileByName = (username: string): void => SendMessageComposer(new RpGetSitchProfileComposer(0, username));
export const SendSitchSearch = (query: string): void => SendMessageComposer(new RpSitchSearchComposer(query));
export const SendSitchActivity = (): void => SendMessageComposer(new RpGetSitchActivityComposer());

/** Cover art for a favorite song, built from the id the way Spotify does it. */
export const SitchSongArt = (videoId: string): string => (videoId ? `https://i.ytimg.com/vi/${ videoId }/mqdefault.jpg` : '');

/**
 * The watch link for a saved song, so the edit sheet can show what is already
 * there instead of an empty box.
 *
 * Rebuilt from the id rather than remembered, because the id IS what the server
 * stores - 127_Sitch.sql keeps the 11 characters and nothing else. Somebody who
 * pasted a youtu.be or shorts link gets the canonical watch form back; same
 * video, different spelling.
 */
export const SitchSongUrl = (videoId: string): string => (videoId ? `https://www.youtube.com/watch?v=${ videoId }` : '');

export class RpSitchPostComposer extends RpSitchComposerBase
{
    /**
     * parentId 0 posts to the feed; anything else replies to that post.
     *
     * songUrl is a YouTube link in its own field, never in the body - the body
     * refuses links, and this is why it can afford to.
     */
    constructor(body: string, parentId: number = 0, photoId: number = 0, songUrl: string = '')
    {
        super();
        this._data = [ body, parentId, photoId, songUrl ];
    }
}

export class RpSitchLikeComposer extends RpSitchComposerBase
{
    constructor(postId: number, on: boolean) 
    {
        super(); this._data = [ postId, on ? 1 : 0 ]; 
    }
}

export class RpSitchRepostComposer extends RpSitchComposerBase
{
    constructor(postId: number, on: boolean) 
    {
        super(); this._data = [ postId, on ? 1 : 0 ]; 
    }
}

export class RpSitchFollowComposer extends RpSitchComposerBase
{
    constructor(userId: number, on: boolean) 
    {
        super(); this._data = [ userId, on ? 1 : 0 ]; 
    }
}

export class RpSitchDeleteComposer extends RpSitchComposerBase
{
    constructor(postId: number) 
    {
        super(); this._data = [ postId ]; 
    }
}

export class RpSitchSetBioComposer extends RpSitchComposerBase
{
    constructor(bio: string) 
    {
        super(); this._data = [ bio ]; 
    }
}

export class RpSitchSetSongComposer extends RpSitchComposerBase
{
    /** An empty url clears the song - that is how it comes off a profile. */
    constructor(url: string) 
    {
        super(); this._data = [ url ]; 
    }
}

export const SendSitchPost = (body: string, parentId: number = 0, photoId: number = 0, songUrl: string = ''): void =>
    SendMessageComposer(new RpSitchPostComposer(body, parentId, photoId, songUrl));
export const SendSitchLike = (postId: number, on: boolean): void => SendMessageComposer(new RpSitchLikeComposer(postId, on));
export const SendSitchRepost = (postId: number, on: boolean): void => SendMessageComposer(new RpSitchRepostComposer(postId, on));
export const SendSitchFollow = (userId: number, on: boolean): void => SendMessageComposer(new RpSitchFollowComposer(userId, on));
export const SendSitchDelete = (postId: number): void => SendMessageComposer(new RpSitchDeleteComposer(postId));
export const SendSitchBio = (bio: string): void => SendMessageComposer(new RpSitchSetBioComposer(bio));
export const SendSitchSong = (url: string): void => SendMessageComposer(new RpSitchSetSongComposer(url));

/** What the server enforces too - the counter here is a courtesy, not a control. */
export const SITCH_MAX_BODY = 280;

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
            [ RP_SITCH_ACTIVITY, RpSitchActivityEvent ],
            [ RP_SITCH_SEARCH_RESULT, RpSitchSearchEvent ]
        ]),
        composers: new Map<number, Function>([
            [ RP_GET_SITCH_FEED, RpGetSitchFeedComposer ],
            [ RP_GET_SITCH_THREAD, RpGetSitchThreadComposer ],
            [ RP_GET_SITCH_PROFILE, RpGetSitchProfileComposer ],
            [ RP_GET_SITCH_ACTIVITY, RpGetSitchActivityComposer ],
            [ RP_SITCH_POST, RpSitchPostComposer ],
            [ RP_SITCH_LIKE, RpSitchLikeComposer ],
            [ RP_SITCH_REPOST, RpSitchRepostComposer ],
            [ RP_SITCH_FOLLOW, RpSitchFollowComposer ],
            [ RP_SITCH_DELETE, RpSitchDeleteComposer ],
            [ RP_SITCH_SET_BIO, RpSitchSetBioComposer ],
            [ RP_SITCH_SET_SONG, RpSitchSetSongComposer ],
            [ RP_SITCH_SEARCH, RpSitchSearchComposer ]
        ])
    });

    registered = true;
}
