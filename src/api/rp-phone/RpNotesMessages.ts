import { IMessageComposer, IMessageDataWrapper, IMessageEvent, IMessageParser, MessageEvent } from '@nitrots/nitro-renderer';
import { GetConnection } from '../nitro';

// PixelRP phone Notes packets - client-source, registered at runtime.
// Wire ids match the emulator's Resources/Revisions/1.6.6.json.
const RP_NOTES = 3998; // server -> client: folders + note summaries
const RP_NOTE = 3999; // server -> client: one note in full (live)
const RP_GET_NOTES = 4001;
const RP_SAVE_NOTE = 4002;
const RP_DELETE_NOTE = 4003;
const RP_NOTE_OPEN = 4004;
const RP_NOTE_SHARE = 4005;
const RP_SAVE_NOTE_FOLDER = 4006;
const RP_MOVE_NOTE = 4007;
const RP_PIN_NOTE = 4008;

export interface NoteFolder
{
    id: number;
    name: string;
    count: number;
}

export interface NoteSummary
{
    id: number;
    ownerId: number;
    ownerName: string;
    // the VIEWER's folder for this note (owner's or their share row); 0 = none
    folderId: number;
    title: string;
    // first 160 characters of the body
    preview: string;
    pinned: boolean;
    updatedAt: number;
    shareCount: number;
}

export interface NotePerson
{
    userId: number;
    username: string;
    online: boolean;
    // has the note open in their editor
    editing: boolean;
    // line their caret is on, -1 when unknown
    caretLine: number;
}

export interface NoteDetail
{
    id: number;
    ownerId: number;
    ownerName: string;
    folderId: number;
    title: string;
    body: string;
    pinned: boolean;
    version: number;
    updatedAt: number;
    updatedBy: string;
    // owner first, then collaborators
    people: NotePerson[];
    // the owner's friends (for the share sheet); empty for collaborators
    friends: NotePerson[];
}

export class RpNotesParser implements IMessageParser
{
    private _folders: NoteFolder[];
    private _notes: NoteSummary[];

    public flush(): boolean
    {
        this._folders = [];
        this._notes = [];

        return true;
    }

    public parse(wrapper: IMessageDataWrapper): boolean
    {
        if(!wrapper) return false;

        const folderCount = wrapper.readInt();

        this._folders = [];

        for(let i = 0; i < folderCount; i++)
        {
            this._folders.push({ id: wrapper.readInt(), name: wrapper.readString(), count: wrapper.readInt() });
        }

        const noteCount = wrapper.readInt();

        this._notes = [];

        for(let i = 0; i < noteCount; i++)
        {
            this._notes.push({ id: wrapper.readInt(), ownerId: wrapper.readInt(), ownerName: wrapper.readString(), folderId: wrapper.readInt(), title: wrapper.readString(), preview: wrapper.readString(), pinned: (wrapper.readInt() === 1), updatedAt: wrapper.readInt(), shareCount: wrapper.readInt() });
        }

        return true;
    }

    public get folders(): NoteFolder[] { return this._folders; }
    public get notes(): NoteSummary[] { return this._notes; }
}

export class RpNotesEvent extends MessageEvent implements IMessageEvent
{
    constructor(callBack: Function)
    {
        super(callBack, RpNotesParser);
    }

    public getParser(): RpNotesParser
    {
        return this.parser as RpNotesParser;
    }
}

const readPerson = (wrapper: IMessageDataWrapper): NotePerson => ({ userId: wrapper.readInt(), username: wrapper.readString(), online: (wrapper.readInt() === 1), editing: (wrapper.readInt() === 1), caretLine: wrapper.readInt() });

export class RpNoteParser implements IMessageParser
{
    private _note: NoteDetail;

    public flush(): boolean
    {
        this._note = null;

        return true;
    }

    public parse(wrapper: IMessageDataWrapper): boolean
    {
        if(!wrapper) return false;

        const note: NoteDetail = {
            id: wrapper.readInt(),
            ownerId: wrapper.readInt(),
            ownerName: wrapper.readString(),
            folderId: wrapper.readInt(),
            title: wrapper.readString(),
            body: wrapper.readString(),
            pinned: (wrapper.readInt() === 1),
            version: wrapper.readInt(),
            updatedAt: wrapper.readInt(),
            updatedBy: wrapper.readString(),
            people: [],
            friends: []
        };

        const peopleCount = wrapper.readInt();

        for(let i = 0; i < peopleCount; i++) note.people.push(readPerson(wrapper));

        const friendCount = wrapper.readInt();

        for(let i = 0; i < friendCount; i++) note.friends.push(readPerson(wrapper));

        this._note = note;

        return true;
    }

    public get note(): NoteDetail { return this._note; }
}

export class RpNoteEvent extends MessageEvent implements IMessageEvent
{
    constructor(callBack: Function)
    {
        super(callBack, RpNoteParser);
    }

    public getParser(): RpNoteParser
    {
        return this.parser as RpNoteParser;
    }
}

class RpNotesComposer implements IMessageComposer<(string | number)[]>
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

// no id: folders + summaries; with an id: that note in full
export class RpGetNotesComposer extends RpNotesComposer
{
    constructor(noteId: number = 0)
    {
        super(noteId);
    }
}

// id 0 creates a note in folderId; caretLine keeps your presence fresh
export class RpSaveNoteComposer extends RpNotesComposer
{
    constructor(id: number, folderId: number, title: string, body: string, caretLine: number)
    {
        super(id, folderId, title, body, caretLine);
    }
}

// owner: delete; collaborator: leave
export class RpDeleteNoteComposer extends RpNotesComposer
{
    constructor(id: number)
    {
        super(id);
    }
}

export class RpNoteOpenComposer extends RpNotesComposer
{
    constructor(id: number, open: boolean, caretLine: number)
    {
        super(id, (open ? 1 : 0), caretLine);
    }
}

// owner only; userId 0 with add=false stops sharing with everyone
export class RpNoteShareComposer extends RpNotesComposer
{
    constructor(id: number, userId: number, add: boolean)
    {
        super(id, userId, (add ? 1 : 0));
    }
}

// id 0 creates; an empty name deletes
export class RpSaveNoteFolderComposer extends RpNotesComposer
{
    constructor(id: number, name: string)
    {
        super(id, name);
    }
}

export class RpMoveNoteComposer extends RpNotesComposer
{
    constructor(id: number, folderId: number)
    {
        super(id, folderId);
    }
}

export class RpPinNoteComposer extends RpNotesComposer
{
    constructor(id: number, pinned: boolean)
    {
        super(id, (pinned ? 1 : 0));
    }
}

let registered = false;

export const RegisterRpNotesMessages = () =>
{
    if(registered) return;

    const connection = GetConnection();

    if(!connection) return;

    connection.registerMessages({
        events: new Map<number, Function>([ [ RP_NOTES, RpNotesEvent ], [ RP_NOTE, RpNoteEvent ] ]),
        composers: new Map<number, Function>([
            [ RP_GET_NOTES, RpGetNotesComposer ],
            [ RP_SAVE_NOTE, RpSaveNoteComposer ],
            [ RP_DELETE_NOTE, RpDeleteNoteComposer ],
            [ RP_NOTE_OPEN, RpNoteOpenComposer ],
            [ RP_NOTE_SHARE, RpNoteShareComposer ],
            [ RP_SAVE_NOTE_FOLDER, RpSaveNoteFolderComposer ],
            [ RP_MOVE_NOTE, RpMoveNoteComposer ],
            [ RP_PIN_NOTE, RpPinNoteComposer ]
        ])
    });

    registered = true;
}
