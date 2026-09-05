import { FC, KeyboardEvent, PointerEvent as ReactPointerEvent, ReactNode, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { GetSessionDataManager, SendMessageComposer } from '../../api';
import { NoteDetail, NoteFolder, NotePerson, NoteSummary, RpDeleteNoteComposer, RpGetNotesComposer, RpMoveNoteComposer, RpNoteEvent, RpNoteOpenComposer, RpNoteShareComposer, RpNotesEvent, RpPinNoteComposer, RpSaveNoteComposer, RpSaveNoteFolderComposer } from '../../api/rp-phone/RpNotesMessages';
import { useMessageEvent } from '../../hooks';
import { PhoneAvatarColor } from './PhoneAvatar';
import { PhoneIcon } from './PhoneIcon';

// Notes app: Folders -> a folder's list -> the editor. Notes are yours or
// shared with you by a friend; a shared note is one document for everyone in
// it. The editor is line-based (text, heading, bullet, checklist) and saves a
// few hundred ms after you stop typing; the server bumps the version and
// pushes the whole note back to everyone who has it, so collaborators see
// each other's lines land live, with a tinted line and a name tag where
// their caret is. Last writer wins. Folders are personal: each person files a
// shared note wherever they like.

interface PhoneNotesViewProps
{
    onBack: () => void;
}

type NotesScreen = 'folders' | 'list' | 'editor';
type Sheet = 'share' | 'move' | 'folder' | 'more' | 'delete' | 'folder-more' | null;
type LineKind = 'text' | 'head' | 'bullet' | 'check' | 'done';

interface Line
{
    kind: LineKind;
    text: string;
}

// the list screen shows every note when no folder is picked
const ALL_NOTES = -1;
const SAVE_DELAY = 400;
const PRESENCE_MIN_GAP = 900;
const MAX_TITLE = 80;
const MAX_BODY = 20000;
const MAX_HISTORY = 60;

const parseBody = (body: string): Line[] =>
{
    const lines = (body || '').split('\n').map(raw =>
    {
        if(raw.startsWith('[x] ')) return ({ kind: 'done', text: raw.substring(4) } as Line);
        if(raw.startsWith('[ ] ')) return ({ kind: 'check', text: raw.substring(4) } as Line);
        if(raw.startsWith('- ')) return ({ kind: 'bullet', text: raw.substring(2) } as Line);
        if(raw.startsWith('# ')) return ({ kind: 'head', text: raw.substring(2) } as Line);

        return ({ kind: 'text', text: raw } as Line);
    });

    return (lines.length ? lines : [ { kind: 'text', text: '' } ]);
}

const serializeLine = (line: Line): string =>
{
    switch(line.kind)
    {
        case 'done': return `[x] ${ line.text }`;
        case 'check': return `[ ] ${ line.text }`;
        case 'bullet': return `- ${ line.text }`;
        case 'head': return `# ${ line.text }`;
        default: return line.text;
    }
}

const serializeBody = (lines: Line[]): string => lines.map(serializeLine).join('\n');

// list previews: markers become glyphs
const previewText = (preview: string): string => (preview || '')
    .split('\n')
    .map(raw => raw.replace(/^\[x\] /, '☑ ').replace(/^\[ \] /, '☐ ').replace(/^- /, '• ').replace(/^# /, ''))
    .filter(part => part.trim().length)
    .join('  ');

const isEmptyBody = (lines: Line[]): boolean => lines.every(line => !line.text.trim().length);

const startOfDay = (date: Date): number => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

const shortDate = (unix: number): string =>
{
    const date = new Date(unix * 1000);
    const today = startOfDay(new Date());
    const day = startOfDay(date);

    if(day === today) return 'Today';
    if(day === (today - 86400000)) return 'Yesterday';

    return date.toLocaleDateString([], { day: 'numeric', month: 'short' });
}

const relativeTime = (unix: number, now: number): string =>
{
    const seconds = Math.max(0, Math.floor(now / 1000) - unix);

    if(seconds < 45) return 'just now';
    if(seconds < 3600) return `${ Math.max(1, Math.floor(seconds / 60)) } min ago`;
    if(seconds < 86400) return `${ Math.floor(seconds / 3600) } h ago`;

    return shortDate(unix);
}

const Face: FC<{ userId: number, name: string, size?: number }> = ({ userId, name, size = 18 }) => (
    <div className="phone-notes-face" title={ name } style={ { width: size, height: size, fontSize: Math.round(size * 0.45), background: PhoneAvatarColor(userId) } }>{ (name || '?').charAt(0).toUpperCase() }</div>
);

const FaceStack: FC<{ people: { userId: number, username: string }[], size?: number }> = ({ people, size = 18 }) =>
{
    if(!people.length) return null;

    const shown = people.slice(0, 3);
    const extra = (people.length - shown.length);

    return (
        <div className="phone-notes-stack">
            { shown.map(person => <Face key={ person.userId } userId={ person.userId } name={ person.username } size={ size } />) }
            { (extra > 0) &&
                <div className="phone-notes-face is-extra" style={ { width: size, height: size, fontSize: Math.round(size * 0.42) } }>+{ extra }</div> }
        </div>
    );
}

// A list row that slides left to reveal Pin / Move / Delete.
const SwipeRow: FC<{ open: boolean, onOpenChange: (open: boolean) => void, onTap: () => void, actions: { icon: string, label: string, tone: string, onClick: () => void }[], children: ReactNode, first: boolean }> = props =>
{
    const { open, onOpenChange, onTap, actions, children, first } = props;
    const startX = useRef<number>(null);
    const dragged = useRef(false);
    const [ drag, setDrag ] = useState<number>(0);
    const width = (actions.length * 64);

    const onDown = (event: ReactPointerEvent<HTMLDivElement>) =>
    {
        startX.current = event.clientX;
        dragged.current = false;

        try { event.currentTarget.setPointerCapture(event.pointerId); } catch(e) { /* no capture, no problem */ }
    }

    // the pointer left mid-press: neither a tap nor a swipe
    const cancel = () =>
    {
        startX.current = null;
        dragged.current = false;
        setDrag(0);
    }

    const onMove = (event: ReactPointerEvent<HTMLDivElement>) =>
    {
        if(startX.current === null) return;

        const dx = (event.clientX - startX.current);

        if(Math.abs(dx) > 8) dragged.current = true;

        if(dragged.current) setDrag(Math.max(-width, Math.min(0, dx + (open ? -width : 0))));
    }

    const onUp = () =>
    {
        if(startX.current === null) return;

        if(dragged.current)
        {
            onOpenChange(drag < -(width / 2));
        }
        else
        {
            if(open) onOpenChange(false);
            else onTap();
        }

        startX.current = null;
        dragged.current = false;
        setDrag(0);
    }

    const offset = ((startX.current !== null) && dragged.current) ? drag : (open ? -width : 0);

    return (
        <div className={ `phone-notes-swipe${ first ? '' : ' has-top' }` }>
            <div className="phone-notes-swipe-actions">
                { actions.map(action => (
                    <div key={ action.label } className={ `phone-notes-swipe-action is-${ action.tone } phone-tap` } onClick={ event => { event.stopPropagation(); onOpenChange(false); action.onClick(); } }>
                        <PhoneIcon icon={ action.icon } size={ 15 } />
                        <span>{ action.label }</span>
                    </div>
                )) }
            </div>
            <div className={ `phone-notes-swipe-content${ dragged.current ? ' is-dragging' : '' }` } style={ { transform: `translateX(${ offset }px)` } } onPointerDown={ onDown } onPointerMove={ onMove } onPointerUp={ onUp } onPointerCancel={ cancel } onPointerLeave={ cancel }>
                { children }
            </div>
        </div>
    );
}

// One editable line. A textarea that grows with its text so long lines wrap
// like a real note.
const LineRow: FC<{ index: number, line: Line, caretPeople: NotePerson[], register: (index: number, element: HTMLTextAreaElement) => void, onChange: (index: number, text: string) => void, onKeyDown: (index: number, event: KeyboardEvent<HTMLTextAreaElement>) => void, onFocus: (index: number) => void, onToggleDone: (index: number) => void }> = props =>
{
    const { index, line, caretPeople, register, onChange, onKeyDown, onFocus, onToggleDone } = props;
    const ref = useRef<HTMLTextAreaElement>(null);

    useLayoutEffect(() =>
    {
        const element = ref.current;

        if(!element) return;

        element.style.height = '0px';
        element.style.height = `${ element.scrollHeight }px`;
    }, [ line.text, line.kind ]);

    const tint = (caretPeople.length ? PhoneAvatarColor(caretPeople[0].userId) : null);

    return (
        <div className={ `phone-notes-line is-${ line.kind }${ tint ? ' has-caret' : '' }` } style={ tint ? { background: `${ tint }26` } : undefined }>
            { ((line.kind === 'check') || (line.kind === 'done')) &&
                <div className={ `phone-notes-check phone-tap${ (line.kind === 'done') ? ' is-done' : '' }` } onClick={ event => onToggleDone(index) }>
                    { (line.kind === 'done') && <PhoneIcon icon="check" size={ 11 } /> }
                </div> }
            { (line.kind === 'bullet') &&
                <div className="phone-notes-bullet" /> }
            <textarea ref={ element => { ref.current = element; register(index, element); } } className="phone-notes-line-input" rows={ 1 } spellCheck={ false } value={ line.text } placeholder={ (index === 0) ? 'Start writing…' : '' }
                onChange={ event => onChange(index, event.target.value) }
                onKeyDown={ event => onKeyDown(index, event) }
                onFocus={ event => onFocus(index) } />
            { tint &&
                <div className="phone-notes-caret-tag" style={ { background: tint } }>{ caretPeople.map(person => person.username).join(', ') }</div> }
        </div>
    );
}

export const PhoneNotesView: FC<PhoneNotesViewProps> = props =>
{
    const { onBack = null } = props;
    const ownId = GetSessionDataManager().userId;
    const ownName = (GetSessionDataManager().userName || 'You');

    const [ folders, setFolders ] = useState<NoteFolder[]>([]);
    const [ notes, setNotes ] = useState<NoteSummary[]>([]);
    const [ loaded, setLoaded ] = useState(false);
    const [ screen, setScreen ] = useState<NotesScreen>('folders');
    const [ slide, setSlide ] = useState<'right' | 'left'>('right');
    const [ listFolder, setListFolder ] = useState<number>(ALL_NOTES);
    const [ search, setSearch ] = useState('');
    const [ sheet, setSheet ] = useState<Sheet>(null);
    const [ openSwipeId, setOpenSwipeId ] = useState(0);
    const [ moveNoteId, setMoveNoteId ] = useState(0);
    const [ folderDraft, setFolderDraft ] = useState<{ id: number, name: string }>({ id: 0, name: '' });
    const [ now, setNow ] = useState(() => Date.now());

    // the open note
    const [ openNoteId, setOpenNoteId ] = useState(0);
    const [ detail, setDetail ] = useState<NoteDetail>(null);
    const [ title, setTitle ] = useState('');
    const [ lines, setLines ] = useState<Line[]>([ { kind: 'text', text: '' } ]);
    const [ focusedLine, setFocusedLine ] = useState(0);

    const openNoteIdRef = useRef(0);
    const dirtyRef = useRef(false);
    const saveTimer = useRef<number>(0);
    const draftRef = useRef<{ title: string, lines: Line[] }>({ title: '', lines: [ { kind: 'text', text: '' } ] });
    const awaitingCreate = useRef(false);
    const rowRefs = useRef<HTMLTextAreaElement[]>([]);
    const titleRef = useRef<HTMLTextAreaElement>(null);
    const focusRequest = useRef<{ index: number, caret: number }>(null);
    const historyRef = useRef<{ title: string, lines: Line[] }[]>([]);
    const lastHistoryAt = useRef(0);
    const lastPresenceAt = useRef(0);
    const presenceTimer = useRef<number>(0);
    const notesRef = useRef<NoteSummary[]>([]);
    const focusedLineRef = useRef(0);
    // a note we created whose summary hasn't arrived yet
    const justCreated = useRef(0);

    openNoteIdRef.current = openNoteId;
    notesRef.current = notes;
    draftRef.current = { title, lines };
    focusedLineRef.current = focusedLine;

    useEffect(() =>
    {
        SendMessageComposer(new RpGetNotesComposer());

        const interval = window.setInterval(() => setNow(Date.now()), 30000);

        return () => window.clearInterval(interval);
    }, []);

    // ----- server state -----

    useMessageEvent<RpNotesEvent>(RpNotesEvent, event =>
    {
        const parser = event.getParser();

        setFolders(parser.folders);
        setNotes(parser.notes);
        setLoaded(true);

        if(justCreated.current && parser.notes.some(note => note.id === justCreated.current)) justCreated.current = 0;
    });

    useMessageEvent<RpNoteEvent>(RpNoteEvent, event =>
    {
        const note = event.getParser().note;

        if(!note) return;

        // the note we just asked the server to create comes back as a push
        if(awaitingCreate.current && (note.ownerId === ownId) && !notesRef.current.some(summary => summary.id === note.id))
        {
            awaitingCreate.current = false;
            justCreated.current = note.id;
            historyRef.current = [];
            dirtyRef.current = false;
            setOpenNoteId(note.id);
            setDetail(note);
            setTitle(note.title);
            setLines(parseBody(note.body));
            setSlide('right');
            setScreen('editor');
            focusRequest.current = { index: -1, caret: 0 };
            SendMessageComposer(new RpNoteOpenComposer(note.id, true, -1));

            return;
        }

        if(note.id !== openNoteIdRef.current) return;

        setDetail(note);

        // your own unsent typing outranks whatever just arrived; the next
        // save carries it and the echo brings everyone level
        if(dirtyRef.current) return;

        setTitle(note.title);
        setLines(parseBody(note.body));
    });

    // the open note vanished (deleted, or you were removed) - step back
    useEffect(() =>
    {
        if(!loaded) return;

        if((screen === 'editor') && openNoteId && !awaitingCreate.current && (justCreated.current !== openNoteId) && !notes.some(note => note.id === openNoteId))
        {
            window.clearTimeout(saveTimer.current);
            dirtyRef.current = false;
            setOpenNoteId(0);
            setDetail(null);
            setSheet(null);
            setSlide('left');
            setScreen((listFolder !== ALL_NOTES) && !folders.some(folder => folder.id === listFolder) ? 'folders' : 'list');
        }

        if((screen === 'list') && (listFolder !== ALL_NOTES) && !folders.some(folder => folder.id === listFolder))
        {
            setSlide('left');
            setScreen('folders');
        }
    }, [ notes, folders, loaded, screen, openNoteId, listFolder ]);

    // ----- saving -----

    const flushSave = () =>
    {
        window.clearTimeout(saveTimer.current);

        const id = openNoteIdRef.current;

        if(!id || !dirtyRef.current) return;

        dirtyRef.current = false;

        const draft = draftRef.current;

        SendMessageComposer(new RpSaveNoteComposer(id, 0, draft.title.substring(0, MAX_TITLE), serializeBody(draft.lines).substring(0, MAX_BODY), focusedLineRef.current));
    }

    const scheduleSave = () =>
    {
        dirtyRef.current = true;

        window.clearTimeout(saveTimer.current);

        saveTimer.current = window.setTimeout(flushSave, SAVE_DELAY);
    }

    const pushHistory = () =>
    {
        const stamp = Date.now();

        if((stamp - lastHistoryAt.current) < 700) return;

        lastHistoryAt.current = stamp;
        historyRef.current.push({ title: draftRef.current.title, lines: draftRef.current.lines.map(line => ({ ...line })) });

        if(historyRef.current.length > MAX_HISTORY) historyRef.current.shift();
    }

    const applyLines = (next: Line[], focus: { index: number, caret: number } = null) =>
    {
        pushHistory();
        setLines(next);

        if(focus) focusRequest.current = focus;

        scheduleSave();
    }

    const undo = () =>
    {
        const snapshot = historyRef.current.pop();

        if(!snapshot) return;

        lastHistoryAt.current = 0;
        setTitle(snapshot.title);
        setLines(snapshot.lines);
        scheduleSave();
    }

    // ----- presence -----

    const sendPresence = (index: number) =>
    {
        const id = openNoteIdRef.current;

        if(!id) return;

        const stamp = Date.now();
        const wait = (PRESENCE_MIN_GAP - (stamp - lastPresenceAt.current));

        window.clearTimeout(presenceTimer.current);

        const fire = () =>
        {
            lastPresenceAt.current = Date.now();
            SendMessageComposer(new RpNoteOpenComposer(id, true, index));
        }

        if(wait <= 0) fire();
        else presenceTimer.current = window.setTimeout(fire, wait);
    }

    const closeNote = (goTo: NotesScreen) =>
    {
        const id = openNoteIdRef.current;

        window.clearTimeout(presenceTimer.current);

        if(id)
        {
            const draft = draftRef.current;
            const owner = (detail && (detail.ownerId === ownId));

            // an untouched empty note is thrown away, like the real thing
            if(owner && !draft.title.trim().length && isEmptyBody(draft.lines) && !(detail.people.length > 1))
            {
                window.clearTimeout(saveTimer.current);
                dirtyRef.current = false;
                SendMessageComposer(new RpDeleteNoteComposer(id));
            }
            else
            {
                flushSave();
            }

            SendMessageComposer(new RpNoteOpenComposer(id, false, -1));
        }

        awaitingCreate.current = false;
        setOpenNoteId(0);
        setDetail(null);
        setSheet(null);
        setSlide('left');
        setScreen(goTo);
    }

    useEffect(() =>
    {
        return () =>
        {
            // the app was closed with the phone: save and let go of the note
            window.clearTimeout(presenceTimer.current);
            window.clearTimeout(saveTimer.current);

            const id = openNoteIdRef.current;

            if(!id) return;

            if(dirtyRef.current)
            {
                dirtyRef.current = false;

                const draft = draftRef.current;

                SendMessageComposer(new RpSaveNoteComposer(id, 0, draft.title.substring(0, MAX_TITLE), serializeBody(draft.lines).substring(0, MAX_BODY), -1));
            }

            SendMessageComposer(new RpNoteOpenComposer(id, false, -1));
        }
    }, []);

    // ----- navigation -----

    const openList = (folderId: number) =>
    {
        setListFolder(folderId);
        setSearch('');
        setOpenSwipeId(0);
        setSlide('right');
        setScreen('list');
    }

    const openNote = (noteId: number) =>
    {
        historyRef.current = [];
        dirtyRef.current = false;
        setOpenNoteId(noteId);
        setDetail(null);

        const summary = notes.find(note => note.id === noteId);

        setTitle(summary ? summary.title : '');
        setLines(parseBody(summary ? summary.preview : ''));
        setSheet(null);
        setSlide('right');
        setScreen('editor');
        lastPresenceAt.current = Date.now();
        SendMessageComposer(new RpGetNotesComposer(noteId));
        SendMessageComposer(new RpNoteOpenComposer(noteId, true, -1));
    }

    const createNote = (folderId: number) =>
    {
        awaitingCreate.current = true;
        SendMessageComposer(new RpSaveNoteComposer(0, Math.max(0, folderId), '', '', -1));
    }

    // ----- editing -----

    const register = (index: number, element: HTMLTextAreaElement) =>
    {
        rowRefs.current[index] = element;
    }

    useEffect(() =>
    {
        const request = focusRequest.current;

        if(!request) return;

        focusRequest.current = null;

        const element = ((request.index < 0) ? titleRef.current : rowRefs.current[request.index]);

        if(!element) return;

        element.focus();

        const caret = Math.min(request.caret, element.value.length);

        element.setSelectionRange(caret, caret);
    }, [ lines, title, screen ]);

    const changeLine = (index: number, text: string) =>
    {
        const next = lines.map(line => ({ ...line }));
        const line = next[index];

        if(!line) return;

        // typed markers turn a plain line into a list item
        if(line.kind === 'text')
        {
            if(text.startsWith('- ')) { line.kind = 'bullet'; text = text.substring(2); focusRequest.current = { index, caret: 0 }; }
            else if(text.startsWith('[] ') || text.startsWith('[ ] ')) { line.kind = 'check'; text = text.replace(/^\[ ?\] /, ''); focusRequest.current = { index, caret: 0 }; }
            else if(text.startsWith('# ')) { line.kind = 'head'; text = text.substring(2); focusRequest.current = { index, caret: 0 }; }
        }

        line.text = text.replace(/\n/g, ' ');
        applyLines(next);
    }

    const setKind = (index: number, kind: LineKind) =>
    {
        const next = lines.map(line => ({ ...line }));

        if(!next[index]) return;

        const current = next[index].kind;
        const same = ((current === kind) || ((kind === 'check') && (current === 'done')));

        next[index].kind = (same ? 'text' : kind);
        applyLines(next, { index, caret: (rowRefs.current[index]?.selectionStart ?? next[index].text.length) });
    }

    const toggleDone = (index: number) =>
    {
        const next = lines.map(line => ({ ...line }));

        if(!next[index]) return;

        next[index].kind = ((next[index].kind === 'done') ? 'check' : 'done');
        applyLines(next);
    }

    const onLineKey = (index: number, event: KeyboardEvent<HTMLTextAreaElement>) =>
    {
        const element = event.currentTarget;
        const caret = element.selectionStart;
        const line = lines[index];

        if(event.key === 'Enter')
        {
            event.preventDefault();

            const next = lines.map(item => ({ ...item }));

            // Enter on an empty list item ends the list
            if(((line.kind === 'bullet') || (line.kind === 'check') || (line.kind === 'done')) && !line.text.length)
            {
                next[index].kind = 'text';
                applyLines(next, { index, caret: 0 });

                return;
            }

            const before = line.text.substring(0, caret);
            const after = line.text.substring(caret);
            const kind: LineKind = ((line.kind === 'done') ? 'check' : ((line.kind === 'head') ? 'text' : line.kind));

            next[index].text = before;
            next.splice((index + 1), 0, { kind, text: after });
            applyLines(next, { index: (index + 1), caret: 0 });

            return;
        }

        if((event.key === 'Backspace') && (caret === 0) && (element.selectionEnd === 0))
        {
            event.preventDefault();

            const next = lines.map(item => ({ ...item }));

            if(line.kind !== 'text')
            {
                next[index].kind = 'text';
                applyLines(next, { index, caret: 0 });

                return;
            }

            if(index === 0) return;

            const previous = next[index - 1];
            const joinAt = previous.text.length;

            previous.text = (previous.text + line.text);
            next.splice(index, 1);
            applyLines(next, { index: (index - 1), caret: joinAt });

            return;
        }

        if((event.key === 'ArrowUp') && (caret === 0))
        {
            if(index === 0)
            {
                event.preventDefault();
                focusRequest.current = { index: -1, caret: title.length };
                setLines([ ...lines ]);
            }
            else
            {
                event.preventDefault();
                focusRequest.current = { index: (index - 1), caret: lines[index - 1].text.length };
                setLines([ ...lines ]);
            }
        }

        if((event.key === 'ArrowDown') && (caret === line.text.length) && (index < (lines.length - 1)))
        {
            event.preventDefault();
            focusRequest.current = { index: (index + 1), caret: 0 };
            setLines([ ...lines ]);
        }
    }

    const onTitleKey = (event: KeyboardEvent<HTMLTextAreaElement>) =>
    {
        if((event.key === 'Enter') || ((event.key === 'ArrowDown') && (event.currentTarget.selectionStart === title.length)))
        {
            event.preventDefault();
            focusRequest.current = { index: 0, caret: 0 };
            setLines([ ...lines ]);
        }
    }

    const changeTitle = (text: string) =>
    {
        pushHistory();
        setTitle(text.replace(/\n/g, ' ').substring(0, MAX_TITLE));
        scheduleSave();
    }

    const onLineFocus = (index: number) =>
    {
        setFocusedLine(index);
        sendPresence(index);
    }

    // tap the blank space under the last line to keep writing
    const onBodyTap = () =>
    {
        const last = (lines.length - 1);

        if(lines[last].text.length)
        {
            applyLines([ ...lines, { kind: 'text', text: '' } ], { index: (last + 1), caret: 0 });
        }
        else
        {
            focusRequest.current = { index: last, caret: 0 };
            setLines([ ...lines ]);
        }
    }

    useLayoutEffect(() =>
    {
        const element = titleRef.current;

        if(!element) return;

        element.style.height = '0px';
        element.style.height = `${ element.scrollHeight }px`;
    }, [ title, screen ]);

    // ----- actions -----

    const pinNote = (noteId: number, pinned: boolean) => SendMessageComposer(new RpPinNoteComposer(noteId, pinned));

    const deleteNote = (noteId: number) =>
    {
        if(noteId === openNoteId)
        {
            window.clearTimeout(saveTimer.current);
            dirtyRef.current = false;
            SendMessageComposer(new RpDeleteNoteComposer(noteId));
            SendMessageComposer(new RpNoteOpenComposer(noteId, false, -1));
            setOpenNoteId(0);
            setDetail(null);
            setSheet(null);
            setSlide('left');
            setScreen('list');

            return;
        }

        SendMessageComposer(new RpDeleteNoteComposer(noteId));
        setSheet(null);
    }

    const moveNote = (noteId: number, folderId: number) =>
    {
        SendMessageComposer(new RpMoveNoteComposer(noteId, folderId));
        setSheet(null);
        setMoveNoteId(0);
    }

    const saveFolder = () =>
    {
        const name = folderDraft.name.trim();

        if(!name.length && !folderDraft.id) return;

        SendMessageComposer(new RpSaveNoteFolderComposer(folderDraft.id, name));
        setSheet(null);
    }

    const deleteFolder = (folderId: number) =>
    {
        SendMessageComposer(new RpSaveNoteFolderComposer(folderId, ''));
        setSheet(null);
        setSlide('left');
        setScreen('folders');
    }

    // ----- derived -----

    const query = search.trim().toLowerCase();
    const matches = (note: NoteSummary) => (!query.length || note.title.toLowerCase().includes(query) || note.preview.toLowerCase().includes(query));
    const ownNotes = useMemo(() => notes.filter(note => note.ownerId === ownId), [ notes, ownId ]);
    const sharedUnfiled = useMemo(() => notes.filter(note => (note.ownerId !== ownId) && !note.folderId), [ notes, ownId ]);
    const listNotes = useMemo(() => notes.filter(note => ((listFolder === ALL_NOTES) || (note.folderId === listFolder)) && matches(note)), [ notes, listFolder, query ]);
    const listFolderName = ((listFolder === ALL_NOTES) ? 'All Notes' : (folders.find(folder => folder.id === listFolder)?.name ?? 'Folder'));
    const isOwner = (detail ? (detail.ownerId === ownId) : true);
    const others = (detail ? detail.people.filter(person => person.userId !== ownId) : []);
    const editingOthers = others.filter(person => person.editing);
    const collaborators = (detail ? detail.people.filter(person => person.userId !== detail.ownerId) : []);
    const noteFolderName = (detail ? (folders.find(folder => folder.id === detail.folderId)?.name ?? (isOwner ? 'Notes' : 'Shared with you')) : 'Notes');
    const focusedKind = (lines[focusedLine]?.kind ?? 'text');

    const noteActions = (note: NoteSummary) => ([
        { icon: 'pin', label: (note.pinned ? 'Unpin' : 'Pin'), tone: 'pin', onClick: () => pinNote(note.id, !note.pinned) },
        { icon: 'folder', label: 'Move', tone: 'move', onClick: () => { setMoveNoteId(note.id); setSheet('move'); } },
        { icon: ((note.ownerId === ownId) ? 'trash' : 'arrow-right-from-bracket'), label: ((note.ownerId === ownId) ? 'Delete' : 'Leave'), tone: 'del', onClick: () => deleteNote(note.id) }
    ]);

    const noteRow = (note: NoteSummary, first: boolean) => (
        <SwipeRow key={ note.id } first={ first } open={ openSwipeId === note.id } onOpenChange={ open => setOpenSwipeId(open ? note.id : 0) } onTap={ () => openNote(note.id) } actions={ noteActions(note) }>
            <div className="phone-notes-item">
                <div className="phone-notes-item-text">
                    <div className="phone-notes-item-title">
                        { note.pinned && <PhoneIcon icon="pin" size={ 11 } className="phone-notes-item-pin" /> }
                        <span>{ note.title.trim().length ? note.title : 'New note' }</span>
                    </div>
                    <div className="phone-notes-item-meta">
                        <span className="phone-notes-item-date">{ shortDate(note.updatedAt) }</span>
                        <span className="phone-notes-item-preview">{ previewText(note.preview) || 'No additional text' }</span>
                    </div>
                </div>
                { (note.ownerId !== ownId) &&
                    <FaceStack people={ [ { userId: note.ownerId, username: note.ownerName } ] } /> }
                { (note.ownerId === ownId) && (note.shareCount > 0) &&
                    <div className="phone-notes-item-shared" title={ `Shared with ${ note.shareCount }` }>
                        <PhoneIcon icon="user-group" size={ 12 } />
                        <span>{ note.shareCount }</span>
                    </div> }
            </div>
        </SwipeRow>
    );

    const notesList = (list: NoteSummary[], label: string) =>
    {
        if(!list.length) return null;

        return (
            <>
                <div className="phone-notes-section">{ label }</div>
                <div className="phone-notes-card">
                    { list.map((note, index) => noteRow(note, (index === 0))) }
                </div>
            </>
        );
    }

    // ----- screens -----

    const header = (kicker: string, heading: string, onBackTap: () => void, right: ReactNode) => (
        <div className="phone-app-header phone-notes-header">
            <div className="phone-app-header-lead">
                <div className="phone-tap phone-thread-back phone-notes-back" onClick={ onBackTap }>
                    <PhoneIcon icon="chevron-left" size={ 22 } />
                </div>
                <div className="phone-notes-headtext">
                    <div className="phone-app-kicker phone-notes-kicker">{ kicker.toUpperCase() }</div>
                    { heading && <div className="phone-app-title phone-notes-heading">{ heading }</div> }
                </div>
            </div>
            <div className="phone-notes-header-right">{ right }</div>
        </div>
    );

    const searchBar = (placeholder: string) => (
        <div className="phone-search phone-notes-search">
            <PhoneIcon icon="search" size={ 14 } />
            <input type="text" value={ search } placeholder={ placeholder } spellCheck={ false } onChange={ event => setSearch(event.target.value) } />
            { search.length > 0 &&
                <div className="phone-tap" onClick={ event => setSearch('') }><PhoneIcon icon="close" size={ 13 } /></div> }
        </div>
    );

    const foldersScreen = (
        <div className="phone-notes-pane">
            { header('Notes', 'Folders', () => (onBack && onBack()), (
                <div className="phone-notes-iconbtn phone-tap" title="New folder" onClick={ event => { setFolderDraft({ id: 0, name: '' }); setSheet('folder'); } }>
                    <PhoneIcon icon="folder-plus" size={ 15 } />
                </div>
            )) }
            { searchBar('Search') }
            <div className="phone-notes-scroll">
                { query.length > 0 &&
                    <>
                        { notesList(notes.filter(matches), `${ notes.filter(matches).length } ${ (notes.filter(matches).length === 1) ? 'result' : 'results' }`) }
                        { !notes.filter(matches).length &&
                            <div className="phone-notes-empty">Nothing matches “{ search }”.</div> }
                    </> }
                { !query.length &&
                    <>
                        <div className="phone-notes-section">On this phone</div>
                        <div className="phone-notes-card">
                            <div className="phone-notes-row phone-tap" onClick={ event => openList(ALL_NOTES) }>
                                <PhoneIcon icon="list" size={ 17 } className="phone-notes-row-icon" />
                                <div className="phone-notes-row-label">All Notes</div>
                                <span className="phone-notes-row-count">{ notes.length }</span>
                                <PhoneIcon icon="chevron-right" size={ 14 } className="phone-notes-row-chev" />
                            </div>
                            { folders.map(folder => (
                                <div key={ folder.id } className="phone-notes-row has-top phone-tap" onClick={ event => openList(folder.id) }>
                                    <PhoneIcon icon="folder" size={ 17 } className="phone-notes-row-icon" />
                                    <div className="phone-notes-row-label">{ folder.name }</div>
                                    <span className="phone-notes-row-count">{ folder.count }</span>
                                    <PhoneIcon icon="chevron-right" size={ 14 } className="phone-notes-row-chev" />
                                </div>
                            )) }
                        </div>
                        { !folders.length &&
                            <div className="phone-notes-hint">Tap the folder button to sort your notes into folders.</div> }
                        { sharedUnfiled.length > 0 &&
                            <>
                                <div className="phone-notes-section">Shared with you</div>
                                <div className="phone-notes-card">
                                    { sharedUnfiled.map((note, index) => (
                                        <SwipeRow key={ note.id } first={ index === 0 } open={ openSwipeId === note.id } onOpenChange={ open => setOpenSwipeId(open ? note.id : 0) } onTap={ () => openNote(note.id) } actions={ noteActions(note) }>
                                            <div className="phone-notes-row">
                                                <PhoneIcon icon="user-group" size={ 17 } className="phone-notes-row-icon" />
                                                <div className="phone-notes-row-label">{ note.title.trim().length ? note.title : 'New note' }</div>
                                                <FaceStack people={ [ { userId: note.ownerId, username: note.ownerName } ] } />
                                                <PhoneIcon icon="chevron-right" size={ 14 } className="phone-notes-row-chev" />
                                            </div>
                                        </SwipeRow>
                                    )) }
                                </div>
                            </> }
                        <div className="phone-notes-footer">Shared notes update live for everyone in them.</div>
                    </> }
            </div>
            <div className="phone-notes-fab phone-tap" title="New note" onClick={ event => createNote(0) }>
                <PhoneIcon icon="pen-to-square" size={ 20 } />
            </div>
        </div>
    );

    const pinned = listNotes.filter(note => note.pinned);
    const unpinned = listNotes.filter(note => !note.pinned);

    const listScreen = (
        <div className="phone-notes-pane">
            { header((listFolder === ALL_NOTES) ? 'Notes' : 'Folder', listFolderName, () => { setSlide('left'); setScreen('folders'); }, (
                <>
                    { (listFolder !== ALL_NOTES) &&
                        <div className="phone-notes-iconbtn phone-tap" title="Folder options" onClick={ event => setSheet('folder-more') }>
                            <PhoneIcon icon="ellipsis" size={ 15 } />
                        </div> }
                    <div className="phone-notes-iconbtn phone-tap" title="New note" onClick={ event => createNote((listFolder === ALL_NOTES) ? 0 : listFolder) }>
                        <PhoneIcon icon="pen-to-square" size={ 15 } />
                    </div>
                </>
            )) }
            { searchBar('Search') }
            <div className="phone-notes-scroll" onClick={ event => setOpenSwipeId(0) }>
                { notesList(pinned, 'Pinned') }
                { notesList(unpinned, (pinned.length ? 'Notes' : ((listFolder === ALL_NOTES) ? 'All notes' : 'Notes'))) }
                { !listNotes.length && loaded &&
                    <div className="phone-notes-empty">{ query.length ? `Nothing matches “${ search }”.` : 'No notes here yet. Tap the pen to write one.' }</div> }
                { listNotes.length > 0 &&
                    <div className="phone-notes-footer">{ listNotes.length } { (listNotes.length === 1) ? 'note' : 'notes' } · swipe a note for pin, move or delete</div> }
            </div>
        </div>
    );

    const metaLine = () =>
    {
        if(!detail) return 'Opening…';

        const parts: string[] = [];
        const by = ((detail.updatedBy && (detail.updatedBy !== ownName)) ? ` by ${ detail.updatedBy }` : '');

        parts.push(`Edited ${ relativeTime(detail.updatedAt, now) }${ by }`);

        if(isOwner && collaborators.length) parts.push(`shared with ${ collaborators.length } ${ (collaborators.length === 1) ? 'friend' : 'friends' }`);
        if(!isOwner) parts.push(`shared by ${ detail.ownerName }`);

        return parts.join(' · ');
    }

    const editorScreen = (
        <div className="phone-notes-pane is-editor">
            { header(noteFolderName, null, () => closeNote('list'), (
                <>
                    <FaceStack people={ others } size={ 22 } />
                    <div className="phone-notes-iconbtn phone-tap" title="More" onClick={ event => setSheet('more') }>
                        <PhoneIcon icon="ellipsis" size={ 15 } />
                    </div>
                </>
            )) }
            <div className="phone-notes-editor">
                <div className="phone-notes-meta">
                    <span>{ metaLine() }</span>
                    { editingOthers.length > 0 &&
                        <span className="phone-notes-meta-live"> · { editingOthers.map(person => person.username).join(', ') } { (editingOthers.length === 1) ? 'is' : 'are' } editing</span> }
                </div>
                <textarea ref={ titleRef } className="phone-notes-title" rows={ 1 } spellCheck={ false } placeholder="Title" value={ title } maxLength={ MAX_TITLE }
                    onChange={ event => changeTitle(event.target.value) } onKeyDown={ onTitleKey } onFocus={ event => { setFocusedLine(-1); sendPresence(-1); } } />
                <div className="phone-notes-lines">
                    { lines.map((line, index) => (
                        <LineRow key={ index } index={ index } line={ line } caretPeople={ editingOthers.filter(person => person.caretLine === index) } register={ register } onChange={ changeLine } onKeyDown={ onLineKey } onFocus={ onLineFocus } onToggleDone={ toggleDone } />
                    )) }
                </div>
                <div className="phone-notes-body-tail" onClick={ onBodyTap } />
            </div>
            <div className="phone-notes-toolbar">
                <div className={ `phone-notes-tool phone-tap${ ((focusedKind === 'check') || (focusedKind === 'done')) ? ' is-on' : '' }` } title="Checklist" onMouseDown={ event => event.preventDefault() } onClick={ event => setKind(Math.max(0, focusedLine), 'check') }>
                    <PhoneIcon icon="list-check" size={ 18 } />
                </div>
                <div className={ `phone-notes-tool phone-tap${ (focusedKind === 'head') ? ' is-on' : '' }` } title="Heading" onMouseDown={ event => event.preventDefault() } onClick={ event => setKind(Math.max(0, focusedLine), 'head') }>
                    <PhoneIcon icon="heading" size={ 16 } />
                </div>
                <div className={ `phone-notes-tool phone-tap${ (focusedKind === 'bullet') ? ' is-on' : '' }` } title="Bullets" onMouseDown={ event => event.preventDefault() } onClick={ event => setKind(Math.max(0, focusedLine), 'bullet') }>
                    <PhoneIcon icon="list" size={ 18 } />
                </div>
                <div className="phone-notes-tool phone-tap" title={ isOwner ? 'Share with friends' : 'People in this note' } onMouseDown={ event => event.preventDefault() } onClick={ event => setSheet('share') }>
                    <PhoneIcon icon="share" size={ 17 } />
                </div>
                <div className={ `phone-notes-tool phone-tap${ historyRef.current.length ? '' : ' is-off' }` } title="Undo" onMouseDown={ event => event.preventDefault() } onClick={ undo }>
                    <PhoneIcon icon="undo" size={ 17 } />
                </div>
            </div>
        </div>
    );

    // ----- sheets -----

    const sheetShell = (content: ReactNode, extraClass: string = '') => (
        <>
            <div className="phone-calendar-scrim" onClick={ event => { setSheet(null); setMoveNoteId(0); } } />
            <div className={ `phone-calendar-sheet phone-notes-sheet${ extraClass ? (' ' + extraClass) : '' }` }>
                <div className="phone-calendar-grabber" />
                { content }
            </div>
        </>
    );

    const statusFor = (person: NotePerson): string => (person.editing ? 'Editing now' : (person.online ? 'Online' : 'Offline'));

    const shareSheet = detail && sheetShell(
        <>
            <div className="phone-notes-sheet-title">{ isOwner ? `Share “${ title.trim().length ? title : 'New note' }”` : 'In this note' }</div>
            <div className="phone-notes-sheet-sub">{ isOwner ? 'Friends you add can read and edit it. Changes show up for everyone as they happen.' : `${ detail.ownerName } shared this note. Everyone in it can edit.` }</div>
            <div className="phone-notes-section is-sheet">In this note</div>
            <div className="phone-notes-people">
                { detail.people.map((person, index) => (
                    <div key={ person.userId } className={ `phone-notes-person${ index ? ' has-top' : '' }` }>
                        <Face userId={ person.userId } name={ person.username } size={ 32 } />
                        <div className="phone-notes-person-text">
                            <div className="phone-notes-person-name">{ (person.userId === ownId) ? `${ person.username } (you)` : person.username }{ (person.userId === detail.ownerId) ? <span className="phone-notes-person-owner">Owner</span> : null }</div>
                            <div className={ `phone-notes-person-status${ person.editing ? ' is-live' : '' }` }>{ statusFor(person) }</div>
                        </div>
                        { isOwner && (person.userId !== ownId) &&
                            <div className="phone-notes-person-btn is-remove phone-tap" title="Remove" onClick={ event => SendMessageComposer(new RpNoteShareComposer(detail.id, person.userId, false)) }>
                                <PhoneIcon icon="close" size={ 12 } />
                            </div> }
                    </div>
                )) }
            </div>
            { isOwner &&
                <>
                    <div className="phone-notes-section is-sheet">Add friends</div>
                    { !detail.friends.filter(friend => !detail.people.some(person => person.userId === friend.userId)).length &&
                        <div className="phone-notes-hint is-sheet">{ detail.friends.length ? 'Everyone on your friends list is already in this note.' : 'Add friends in Contacts first - notes can only be shared with friends.' }</div> }
                    <div className="phone-notes-people is-friends">
                        { detail.friends.filter(friend => !detail.people.some(person => person.userId === friend.userId)).map((friend, index) => (
                            <div key={ friend.userId } className={ `phone-notes-person${ index ? ' has-top' : '' }` }>
                                <Face userId={ friend.userId } name={ friend.username } size={ 32 } />
                                <div className="phone-notes-person-text">
                                    <div className="phone-notes-person-name">{ friend.username }</div>
                                    <div className="phone-notes-person-status">{ friend.online ? 'Online' : 'Offline' }</div>
                                </div>
                                <div className="phone-notes-person-btn is-add phone-tap" title="Add" onClick={ event => SendMessageComposer(new RpNoteShareComposer(detail.id, friend.userId, true)) }>
                                    <PhoneIcon icon="plus" size={ 12 } />
                                </div>
                            </div>
                        )) }
                    </div>
                    { collaborators.length > 0 &&
                        <div className="phone-notes-btn is-danger-text phone-tap" onClick={ event => SendMessageComposer(new RpNoteShareComposer(detail.id, 0, false)) }>Stop sharing</div> }
                </> }
            { !isOwner &&
                <div className="phone-notes-btn is-danger-text phone-tap" onClick={ event => deleteNote(detail.id) }>Leave this note</div> }
        </>
    );

    const moveTarget = (moveNoteId || openNoteId);
    const moveCurrent = (notes.find(note => note.id === moveTarget)?.folderId ?? 0);

    const moveSheet = sheetShell(
        <>
            <div className="phone-notes-sheet-title">Move to folder</div>
            <div className="phone-notes-card is-sheet">
                <div className="phone-notes-row phone-tap" onClick={ event => moveNote(moveTarget, 0) }>
                    <PhoneIcon icon="note" size={ 17 } className="phone-notes-row-icon" />
                    <div className="phone-notes-row-label">{ (notes.find(note => note.id === moveTarget)?.ownerId === ownId) ? 'No folder' : 'Shared with you' }</div>
                    { !moveCurrent && <PhoneIcon icon="check" size={ 14 } className="phone-notes-row-check" /> }
                </div>
                { folders.map(folder => (
                    <div key={ folder.id } className="phone-notes-row has-top phone-tap" onClick={ event => moveNote(moveTarget, folder.id) }>
                        <PhoneIcon icon="folder" size={ 17 } className="phone-notes-row-icon" />
                        <div className="phone-notes-row-label">{ folder.name }</div>
                        { (moveCurrent === folder.id) && <PhoneIcon icon="check" size={ 14 } className="phone-notes-row-check" /> }
                    </div>
                )) }
                <div className="phone-notes-row has-top phone-tap" onClick={ event => { setFolderDraft({ id: 0, name: '' }); setSheet('folder'); } }>
                    <PhoneIcon icon="folder-plus" size={ 17 } className="phone-notes-row-icon" />
                    <div className="phone-notes-row-label is-accent">New folder…</div>
                </div>
            </div>
        </>
    );

    const folderSheet = sheetShell(
        <>
            <div className="phone-notes-sheet-title">{ folderDraft.id ? 'Rename folder' : 'New folder' }</div>
            <input className="phone-notes-input" type="text" value={ folderDraft.name } maxLength={ 32 } placeholder="Folder name" spellCheck={ false } autoFocus
                onChange={ event => setFolderDraft({ ...folderDraft, name: event.target.value }) }
                onKeyDown={ event => { if(event.key === 'Enter') saveFolder(); } } />
            <div className="phone-notes-sheet-actions">
                <div className="phone-notes-btn phone-tap" onClick={ event => setSheet(null) }>Cancel</div>
                <div className={ `phone-notes-btn is-primary phone-tap${ folderDraft.name.trim().length ? '' : ' is-off' }` } onClick={ saveFolder }>{ folderDraft.id ? 'Save' : 'Create' }</div>
            </div>
        </>
    );

    const folderMoreSheet = sheetShell(
        <>
            <div className="phone-notes-sheet-title">{ listFolderName }</div>
            <div className="phone-notes-menu">
                <div className="phone-notes-menu-item phone-tap" onClick={ event => { setFolderDraft({ id: listFolder, name: listFolderName }); setSheet('folder'); } }>
                    <PhoneIcon icon="pen" size={ 15 } /><span>Rename folder</span>
                </div>
                <div className="phone-notes-menu-item is-danger phone-tap" onClick={ event => deleteFolder(listFolder) }>
                    <PhoneIcon icon="trash" size={ 15 } /><span>Delete folder</span>
                </div>
            </div>
            <div className="phone-notes-hint is-sheet">Deleting a folder keeps its notes - they move back to All Notes.</div>
        </>
    );

    const moreSheet = detail && sheetShell(
        <>
            <div className="phone-notes-sheet-title">{ title.trim().length ? title : 'New note' }</div>
            <div className="phone-notes-menu">
                <div className="phone-notes-menu-item phone-tap" onClick={ event => { pinNote(detail.id, !detail.pinned); setSheet(null); } }>
                    <PhoneIcon icon="pin" size={ 15 } /><span>{ detail.pinned ? 'Unpin' : 'Pin' }</span>
                </div>
                <div className="phone-notes-menu-item phone-tap" onClick={ event => { setMoveNoteId(detail.id); setSheet('move'); } }>
                    <PhoneIcon icon="folder" size={ 15 } /><span>Move to folder</span>
                </div>
                <div className="phone-notes-menu-item phone-tap" onClick={ event => setSheet('share') }>
                    <PhoneIcon icon="user-group" size={ 15 } /><span>{ isOwner ? 'Share with friends' : 'People in this note' }</span>
                </div>
                <div className="phone-notes-menu-item is-danger phone-tap" onClick={ event => setSheet('delete') }>
                    <PhoneIcon icon={ isOwner ? 'trash' : 'arrow-right-from-bracket' } size={ 15 } /><span>{ isOwner ? 'Delete note' : 'Leave note' }</span>
                </div>
            </div>
        </>
    );

    const deleteSheet = detail && sheetShell(
        <>
            <div className="phone-notes-sheet-title">{ isOwner ? 'Delete this note?' : 'Leave this note?' }</div>
            <div className="phone-notes-sheet-sub">{ isOwner ? (collaborators.length ? `It disappears for you and the ${ collaborators.length } ${ (collaborators.length === 1) ? 'friend' : 'friends' } it is shared with.` : 'This cannot be undone.') : `You can be added again by ${ detail.ownerName }.` }</div>
            <div className="phone-notes-sheet-actions">
                <div className="phone-notes-btn phone-tap" onClick={ event => setSheet(null) }>Cancel</div>
                <div className="phone-notes-btn is-danger phone-tap" onClick={ event => deleteNote(detail.id) }>{ isOwner ? 'Delete' : 'Leave' }</div>
            </div>
        </>
    );

    return (
        <div className="phone-notes">
            <div key={ `${ screen }-${ (screen === 'list') ? listFolder : openNoteId }` } className={ `phone-notes-anim is-${ slide }` }>
                { (screen === 'folders') && foldersScreen }
                { (screen === 'list') && listScreen }
                { (screen === 'editor') && editorScreen }
            </div>
            { (sheet === 'share') && shareSheet }
            { (sheet === 'move') && moveSheet }
            { (sheet === 'folder') && folderSheet }
            { (sheet === 'folder-more') && folderMoreSheet }
            { (sheet === 'more') && moreSheet }
            { (sheet === 'delete') && deleteSheet }
        </div>
    );
}
