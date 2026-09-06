import { IMessageComposer, IMessageDataWrapper, IMessageEvent, IMessageParser, MessageEvent } from '@nitrots/nitro-renderer';
import { GetConnection } from '../nitro';

// PixelRP phone News packets - client-source, registered at runtime.
// Wire ids match the emulator's Resources/Revisions/1.6.6.json.
const RP_NEWS = 4011; // server -> client: the feed for this viewer
const RP_GET_NEWS = 4012;
const RP_SAVE_NEWS_POST = 4013; // staff
const RP_DELETE_NEWS_POST = 4014; // author / senior staff
const RP_PIN_NEWS_POST = 4015; // staff

export const NEWS_CATEGORIES: string[] = [ 'City Hall', 'Events', 'Crime', 'Business' ];

export interface NewsPost
{
    id: number;
    authorId: number;
    authorName: string;
    authorFigure: string;
    category: string;
    title: string;
    body: string;
    // file name in the CMS article image library, '' for none
    image: string;
    pinned: boolean;
    createdAt: number;
    updatedAt: number;
    // published under the newsroom byline: authorX above is Trina
    anonymous: boolean;
    // the real writer, sent to staff only (0 / '' for readers)
    writerId: number;
    writerName: string;
}

export interface NewsByline
{
    id: number;
    name: string;
    figure: string;
}

export class RpNewsParser implements IMessageParser
{
    private _staffLevel: number;
    private _byline: NewsByline;
    private _posts: NewsPost[];

    public flush(): boolean
    {
        this._staffLevel = 0;
        this._byline = { id: 0, name: 'Trina', figure: '' };
        this._posts = [];

        return true;
    }

    public parse(wrapper: IMessageDataWrapper): boolean
    {
        if(!wrapper) return false;

        this._staffLevel = wrapper.readInt();
        this._byline = { id: wrapper.readInt(), name: wrapper.readString(), figure: wrapper.readString() };

        const count = wrapper.readInt();

        this._posts = [];

        for(let i = 0; i < count; i++)
        {
            this._posts.push({ id: wrapper.readInt(), authorId: wrapper.readInt(), authorName: wrapper.readString(), authorFigure: wrapper.readString(), category: wrapper.readString(), title: wrapper.readString(), body: wrapper.readString(), image: wrapper.readString(), pinned: (wrapper.readInt() === 1), createdAt: wrapper.readInt(), updatedAt: wrapper.readInt(), anonymous: (wrapper.readInt() === 1), writerId: wrapper.readInt(), writerName: wrapper.readString() });
        }

        return true;
    }

    // 0 reader, 1 staff (post, pin, own stories), 2 senior (edit or delete anyone's)
    public get staffLevel(): number { return this._staffLevel; }
    public get byline(): NewsByline { return this._byline; }
    public get posts(): NewsPost[] { return this._posts; }
}

export class RpNewsEvent extends MessageEvent implements IMessageEvent
{
    constructor(callBack: Function)
    {
        super(callBack, RpNewsParser);
    }

    public getParser(): RpNewsParser
    {
        return this.parser as RpNewsParser;
    }
}

class RpNewsComposer implements IMessageComposer<(string | number)[]>
{
    private _data: (string | number)[];

    constructor(...data: (string | number)[])
    {
        this._data = data;
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

export class RpGetNewsComposer extends RpNewsComposer
{
    constructor()
    {
        super();
    }
}

// id 0 creates; pinning replaces the current pin
export class RpSaveNewsPostComposer extends RpNewsComposer
{
    constructor(id: number, category: string, title: string, body: string, image: string, pinned: boolean, anonymous: boolean)
    {
        super(id, category, title, body, image, (pinned ? 1 : 0), (anonymous ? 1 : 0));
    }
}

export class RpDeleteNewsPostComposer extends RpNewsComposer
{
    constructor(id: number)
    {
        super(id);
    }
}

export class RpPinNewsPostComposer extends RpNewsComposer
{
    constructor(id: number, pinned: boolean)
    {
        super(id, (pinned ? 1 : 0));
    }
}

let registered = false;

export const RegisterRpNewsMessages = () =>
{
    if(registered) return;

    const connection = GetConnection();

    if(!connection) return;

    connection.registerMessages({
        events: new Map<number, Function>([ [ RP_NEWS, RpNewsEvent ] ]),
        composers: new Map<number, Function>([ [ RP_GET_NEWS, RpGetNewsComposer ], [ RP_SAVE_NEWS_POST, RpSaveNewsPostComposer ], [ RP_DELETE_NEWS_POST, RpDeleteNewsPostComposer ], [ RP_PIN_NEWS_POST, RpPinNewsPostComposer ] ])
    });

    registered = true;
}
