import { FC, KeyboardEvent, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { GetSessionDataManager, SendMessageComposer } from '../../api';
import { NEWS_CATEGORIES, NewsByline, NewsPost, RpDeleteNewsPostComposer, RpGetNewsComposer, RpNewsEvent, RpPinNewsPostComposer, RpSaveNewsPostComposer } from '../../api/rp-phone/RpNewsMessages';
import { useMessageEvent } from '../../hooks';
import { HotelDate } from '../../api/prefs/HotelTime';
import { FormatClock, useUnitsPrefs } from '../../api/prefs/UnitsStore';
import { PhoneFace } from './PhoneAvatar';
import { PhoneIcon } from './PhoneIcon';

// News app: a staff-run noticeboard for the city. Everyone reads the Today
// feed (pinned or newest story on top, the rest as a list) and opens stories;
// staff post, edit, pin and delete. A story's featured image is a file from
// the CMS article image library (the Habbo promo set), chosen from a picker,
// never uploaded. The server re-sends the feed to everyone on any change.

interface PhoneNewsViewProps
{
    onBack: () => void;
}

type Screen = 'feed' | 'article' | 'compose';
type Sheet = 'menu' | 'delete' | 'picker' | null;

const IMAGE_INDEX_URL = '/api/news/images';
const RECENT_KEY = 'pixelrp.news.recentImages';
const MAX_TITLE = 120;
const MAX_BODY = 4000;
const PICKER_PAGE = 120;

interface Library
{
    base: string;
    images: string[];
}

// fetched once per session; every composer open reuses it
let libraryCache: Library = null;
let libraryPromise: Promise<Library> = null;

const loadLibrary = (): Promise<Library> =>
{
    if(libraryCache) return Promise.resolve(libraryCache);

    if(!libraryPromise)
    {
        libraryPromise = fetch(`${ window.location.origin }${ IMAGE_INDEX_URL }`, { credentials: 'same-origin' })
            .then(response => (response.ok ? response.json() : Promise.reject(new Error(`${ response.status }`))))
            .then(data =>
            {
                const library: Library = { base: (typeof data?.base === 'string' ? data.base : '/assets/images/articles/'), images: (Array.isArray(data?.images) ? data.images.filter((name: unknown) => (typeof name === 'string')) : []) };

                libraryCache = library;

                return library;
            })
            .catch(error =>
            {
                libraryPromise = null;

                throw error;
            });
    }

    return libraryPromise;
}

const imageUrl = (name: string): string => `${ window.location.origin }${ libraryCache?.base ?? '/assets/images/articles/' }${ name }`;

const readRecent = (): string[] =>
{
    try
    {
        const raw = window.localStorage.getItem(RECENT_KEY);
        const list = (raw ? JSON.parse(raw) : []);

        return (Array.isArray(list) ? list.filter(item => (typeof item === 'string')) : []);
    }
    catch(e)
    {
        return [];
    }
}

const pushRecent = (name: string) =>
{
    try
    {
        const list = [ name, ...readRecent().filter(item => item !== name) ].slice(0, 8);

        window.localStorage.setItem(RECENT_KEY, JSON.stringify(list));
    }
    catch(e)
    {
        // storage blocked: the picker just has no "recently used" row
    }
}

const MONTHS_SHORT: string[] = [ 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec' ];
const WEEKDAYS: string[] = [ 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday' ];
const MONTHS: string[] = [ 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December' ];

const startOfDay = (date: Date): number => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

const relativeTime = (unix: number, now: number): string =>
{
    const seconds = Math.max(0, Math.floor(now / 1000) - unix);
    const date = HotelDate(unix * 1000);
    const today = startOfDay(HotelDate(now));

    if(seconds < 60) return 'just now';
    if(seconds < 3600) return `${ Math.floor(seconds / 60) } min ago`;
    if(startOfDay(date) === today) return `${ Math.floor(seconds / 3600) }h ago`;
    if(startOfDay(date) === (today - 86400000)) return 'Yesterday';

    return `${ date.getDate() } ${ MONTHS_SHORT[date.getMonth()] }`;
}

const longTime = (unix: number, now: number): string =>
{
    const date = HotelDate(unix * 1000);
    const today = startOfDay(HotelDate(now));
    const clock = FormatClock(unix * 1000);

    if(startOfDay(date) === today) return `Today, ${ clock }`;
    if(startOfDay(date) === (today - 86400000)) return `Yesterday, ${ clock }`;

    return `${ date.getDate() } ${ MONTHS_SHORT[date.getMonth()] }, ${ clock }`;
}

const paragraphs = (body: string): string[] => (body || '').split(/\n\s*\n/).map(part => part.trim()).filter(part => part.length);
const firstParagraph = (body: string): string => (paragraphs(body)[0] ?? '');

const Face: FC<{ userId: number, name: string, figure?: string, size?: number }> = ({ userId, name, figure = null, size = 18 }) => (
    <PhoneFace id={ userId } figure={ figure } name={ name } size={ size } className="phone-news-face" />
);

// a textarea that grows with its text
const GrowingInput: FC<{ className: string, value: string, placeholder: string, maxLength: number, onChange: (value: string) => void, onKeyDown?: (event: KeyboardEvent<HTMLTextAreaElement>) => void, autoFocus?: boolean }> = props =>
{
    const { className, value, placeholder, maxLength, onChange, onKeyDown = null, autoFocus = false } = props;
    const ref = useRef<HTMLTextAreaElement>(null);

    useLayoutEffect(() =>
    {
        const element = ref.current;

        if(!element) return;

        element.style.height = '0px';
        element.style.height = `${ element.scrollHeight }px`;
    }, [ value ]);

    return <textarea ref={ ref } className={ className } rows={ 1 } spellCheck={ false } value={ value } placeholder={ placeholder } maxLength={ maxLength } autoFocus={ autoFocus } onChange={ event => onChange(event.target.value) } onKeyDown={ event => (onKeyDown && onKeyDown(event)) } />;
}

interface Draft
{
    id: number;
    category: string;
    title: string;
    body: string;
    image: string;
    pinned: boolean;
    // publish under the newsroom byline (Trina) instead of your own name
    anonymous: boolean;
}

export const PhoneNewsView: FC<PhoneNewsViewProps> = props =>
{
    const { onBack = null } = props;
    const ownId = GetSessionDataManager().userId;
    // re-render when the clock format changes
    useUnitsPrefs();

    const [ staffLevel, setStaffLevel ] = useState(0);
    const [ newsroom, setNewsroom ] = useState<NewsByline>({ id: 0, name: 'Trina', figure: '' });
    const [ posts, setPosts ] = useState<NewsPost[]>([]);
    const [ loaded, setLoaded ] = useState(false);
    const [ screen, setScreen ] = useState<Screen>('feed');
    const [ slide, setSlide ] = useState<'right' | 'left' | 'up'>('right');
    const [ openId, setOpenId ] = useState(0);
    const [ sheet, setSheet ] = useState<Sheet>(null);
    const [ draft, setDraft ] = useState<Draft>(null);
    const [ returnTo, setReturnTo ] = useState<Screen>('feed');
    const [ now, setNow ] = useState(() => Date.now());

    // picker
    const [ library, setLibrary ] = useState<Library>(libraryCache);
    const [ libraryError, setLibraryError ] = useState(false);
    const [ search, setSearch ] = useState('');
    const [ recent, setRecent ] = useState<string[]>(() => readRecent());

    useEffect(() =>
    {
        SendMessageComposer(new RpGetNewsComposer());

        const interval = window.setInterval(() => setNow(Date.now()), 30000);

        return () => window.clearInterval(interval);
    }, []);

    useMessageEvent<RpNewsEvent>(RpNewsEvent, event =>
    {
        const parser = event.getParser();

        setStaffLevel(parser.staffLevel);
        setNewsroom(parser.byline);
        setPosts(parser.posts);
        setLoaded(true);
    });

    // the open story vanished under us
    useEffect(() =>
    {
        if(!loaded || (screen !== 'article') || !openId) return;

        if(!posts.some(post => post.id === openId))
        {
            setSheet(null);
            setSlide('left');
            setScreen('feed');
        }
    }, [ posts, loaded, screen, openId ]);

    const canPost = (staffLevel >= 1);
    const isSenior = (staffLevel >= 2);
    // the real writer edits; on a Trina story that is writerId (staff receive it), else the shown author
    const writerOf = (post: NewsPost) => (post.anonymous ? post.writerId : post.authorId);
    const canManage = (post: NewsPost) => (canPost && ((writerOf(post) === ownId) || isSenior));

    const openStory = (id: number) =>
    {
        setOpenId(id);
        setSheet(null);
        setSlide('right');
        setScreen('article');
    }

    const backToFeed = () =>
    {
        setSheet(null);
        setSlide('left');
        setScreen('feed');
    }

    const openCompose = (existing: NewsPost = null) =>
    {
        setDraft(existing
            ? { id: existing.id, category: existing.category, title: existing.title, body: existing.body, image: existing.image, pinned: existing.pinned, anonymous: existing.anonymous }
            : { id: 0, category: NEWS_CATEGORIES[0], title: '', body: '', image: '', pinned: false, anonymous: true });
        setReturnTo(screen);
        setSheet(null);
        setSearch('');
        setSlide('up');
        setScreen('compose');
    }

    const closeCompose = () =>
    {
        setSheet(null);
        setSlide('left');
        setScreen(returnTo);
    }

    const canSubmit = (draft && draft.title.trim().length > 0 && draft.body.trim().length > 0);

    const submit = () =>
    {
        if(!canSubmit) return;

        SendMessageComposer(new RpSaveNewsPostComposer(draft.id, draft.category, draft.title.trim(), draft.body.trim(), draft.image, draft.pinned, draft.anonymous));

        if(draft.image) pushRecent(draft.image);

        closeCompose();
    }

    const deletePost = (id: number) =>
    {
        SendMessageComposer(new RpDeleteNewsPostComposer(id));
        setSheet(null);

        if((screen === 'article') && (openId === id))
        {
            setSlide('left');
            setScreen('feed');
        }
    }

    const openPicker = () =>
    {
        setSheet('picker');
        setSearch('');
        setRecent(readRecent());

        if(library) return;

        setLibraryError(false);
        loadLibrary().then(setLibrary).catch(() => setLibraryError(true));
    }

    const pickImage = (name: string) =>
    {
        setDraft(current => ({ ...current, image: name }));
        setSheet(null);
    }

    // ----- derived -----

    const sorted = useMemo(() => [ ...posts ].sort((a, b) => ((b.pinned ? 1 : 0) - (a.pinned ? 1 : 0)) || (b.createdAt - a.createdAt)), [ posts ]);
    const top = (sorted[0] ?? null);
    const rest = sorted.slice(1);
    const open = (posts.find(post => post.id === openId) ?? null);
    const today = HotelDate(now);
    const dateKicker = `${ WEEKDAYS[today.getDay()] }, ${ today.getDate() } ${ MONTHS[today.getMonth()] }`.toUpperCase();

    const query = search.trim().toLowerCase();
    const filtered = useMemo(() =>
    {
        if(!library) return [];

        const list = (query.length ? library.images.filter(name => name.toLowerCase().includes(query)) : library.images);

        return list.slice(0, PICKER_PAGE);
    }, [ library, query ]);
    const totalMatches = (library ? (query.length ? library.images.filter(name => name.toLowerCase().includes(query)).length : library.images.length) : 0);

    // ----- pieces -----

    const backButton = (onTap: () => void) => (
        <div className="phone-tap phone-thread-back phone-news-back" onClick={ onTap }>
            <PhoneIcon icon="chevron-left" size={ 22 } />
        </div>
    );

    const roundButton = (icon: string, title: string, onTap: () => void) => (
        <div className="phone-news-iconbtn phone-tap" title={ title } onClick={ onTap }>
            <PhoneIcon icon={ icon } size={ 15 } />
        </div>
    );

    const byline = (post: NewsPost, size: number, long: boolean = false) => (
        <div className="phone-news-byline">
            <Face userId={ post.authorId } name={ post.authorName } figure={ post.authorFigure } size={ size } />
            <span className="phone-news-byline-name">{ post.authorName }</span>
            <span>· { long ? longTime(post.createdAt, now) : relativeTime(post.createdAt, now) }</span>
        </div>
    );

    const topCard = (post: NewsPost) => (
        <div className="phone-news-card phone-news-top phone-tap" style={ { animationDelay: '40ms' } } onClick={ event => openStory(post.id) }>
            { post.image &&
                <div className="phone-news-top-hero">
                    <img src={ imageUrl(post.image) } alt="" loading="eager" onLoad={ event => event.currentTarget.classList.add('is-loaded') } />
                    <div className="phone-news-top-scrim" />
                    <div className="phone-news-chip">{ post.category }</div>
                    <div className="phone-news-top-title">{ post.title }</div>
                </div> }
            { !post.image &&
                <div className="phone-news-top-plain">
                    <div className="phone-news-chip">{ post.category }</div>
                    <div className="phone-news-top-title is-plain">{ post.title }</div>
                </div> }
            <div className="phone-news-top-body">
                <div className="phone-news-dek">{ firstParagraph(post.body) }</div>
                { byline(post, 18) }
            </div>
        </div>
    );

    const row = (post: NewsPost, index: number) => (
        <div key={ post.id } className={ `phone-news-row phone-tap${ index ? ' has-top' : '' }` } style={ { animationDelay: `${ 90 + Math.min(index, 8) * 35 }ms` } } onClick={ event => openStory(post.id) }>
            <div className="phone-news-row-text">
                <div className="phone-news-row-cat">{ post.category }</div>
                <div className="phone-news-row-title">{ post.title }</div>
                <div className="phone-news-row-meta">{ post.authorName } · { relativeTime(post.createdAt, now) }</div>
            </div>
            { post.image &&
                <img className="phone-news-thumb" src={ imageUrl(post.image) } alt="" loading="lazy" /> }
        </div>
    );

    const feedScreen = (
        <div className="phone-news-pane">
            <div className="phone-app-header phone-news-header">
                <div className="phone-app-header-lead">
                    { backButton(() => (onBack && onBack())) }
                    <div>
                        <div className="phone-app-kicker phone-news-kicker">{ dateKicker }</div>
                        <div className="phone-app-title">Today</div>
                    </div>
                </div>
                <div className="phone-news-header-right">
                    { canPost && roundButton('pen-to-square', 'New post', () => openCompose()) }
                </div>
            </div>
            <div className="phone-news-scroll">
                { loaded && !posts.length &&
                    <div className="phone-news-empty">
                        <div className="phone-news-empty-icon"><PhoneIcon icon="newspaper" size={ 26 } /></div>
                        <div className="phone-news-empty-title">Nothing in the news yet</div>
                        <div className="phone-news-empty-sub">Stories from hotel staff show up here the moment they are posted.</div>
                        { canPost &&
                            <div className="phone-news-btn is-primary phone-tap" onClick={ event => openCompose() }>Write the first story</div> }
                    </div> }
                { top && topCard(top) }
                { rest.length > 0 &&
                    <>
                        <div className="phone-news-section">Latest</div>
                        <div className="phone-news-card">
                            { rest.map((post, index) => row(post, index)) }
                        </div>
                    </> }
                { posts.length > 0 &&
                    <div className="phone-news-foot">Posted by hotel staff. New stories appear here as they go up.</div> }
            </div>
        </div>
    );

    const articleScreen = open && (
        <div className="phone-news-pane">
            <div className="phone-app-header phone-news-header">
                <div className="phone-app-header-lead">
                    { backButton(backToFeed) }
                    <div className="phone-app-kicker phone-news-kicker">{ open.category.toUpperCase() }</div>
                </div>
                <div className="phone-news-header-right">
                    { canPost && roundButton('ellipsis', 'Post options', () => setSheet('menu')) }
                </div>
            </div>
            <div className="phone-news-scroll is-article">
                { open.image &&
                    <div className="phone-news-article-hero">
                        <img src={ imageUrl(open.image) } alt="" onLoad={ event => event.currentTarget.classList.add('is-loaded') } />
                    </div> }
                <div className="phone-news-article">
                    <div className="phone-news-article-title">{ open.title }</div>
                    <div className="phone-news-article-meta">
                        { byline(open, 22, true) }
                        <span className="phone-news-staff"><PhoneIcon icon="shield-halved" size={ 10 } />STAFF</span>
                    </div>
                    <div className="phone-news-rule" />
                    { paragraphs(open.body).map((text, index) => <p key={ index } className="phone-news-p" style={ { animationDelay: `${ 120 + Math.min(index, 6) * 40 }ms` } }>{ text }</p>) }
                    { (open.updatedAt > (open.createdAt + 60)) &&
                        <div className="phone-news-edited">Edited { longTime(open.updatedAt, now) }</div> }
                </div>
            </div>
        </div>
    );

    const composeScreen = draft && (
        <div className="phone-news-pane">
            <div className="phone-news-compose-head">
                <div className="phone-news-compose-cancel phone-tap" onClick={ closeCompose }>Cancel</div>
                <div className="phone-news-compose-title">{ draft.id ? 'Edit story' : 'New post' }</div>
                <div className="phone-news-compose-post">
                    <div className={ `phone-news-postbtn phone-tap${ canSubmit ? '' : ' is-off' }` } onClick={ submit }>{ draft.id ? 'Save' : 'Post' }</div>
                </div>
            </div>
            <div className="phone-news-scroll is-compose">
                { !draft.image &&
                    <div className="phone-news-imagerow phone-tap" onClick={ openPicker }>
                        <div className="phone-news-imagerow-icon"><PhoneIcon icon="image" size={ 19 } /></div>
                        <div className="phone-news-imagerow-text">
                            <div className="phone-news-imagerow-title">Choose a featured image</div>
                            <div className="phone-news-imagerow-sub">From the news image library · optional</div>
                        </div>
                        <PhoneIcon icon="chevron-right" size={ 14 } className="phone-news-chev" />
                    </div> }
                { draft.image &&
                    <div className="phone-news-preview">
                        <img src={ imageUrl(draft.image) } alt="" onLoad={ event => event.currentTarget.classList.add('is-loaded') } />
                        <div className="phone-news-preview-name">{ draft.image.replace(/\.[a-z0-9]+$/i, '') }</div>
                        <div className="phone-news-preview-actions">
                            <div className="phone-news-preview-btn phone-tap" onClick={ openPicker }>Change</div>
                            <div className="phone-news-preview-btn phone-tap" onClick={ event => setDraft({ ...draft, image: '' }) }>Remove</div>
                        </div>
                    </div> }
                <div className="phone-news-cats">
                    { NEWS_CATEGORIES.map(category => (
                        <div key={ category } className={ `phone-news-cat phone-tap${ (draft.category === category) ? ' is-on' : '' }` } onClick={ event => setDraft({ ...draft, category }) }>{ category }</div>
                    )) }
                </div>
                <div className="phone-news-fields">
                    <GrowingInput className="phone-news-field-title" value={ draft.title } placeholder="Headline" maxLength={ MAX_TITLE } autoFocus={ !draft.id } onChange={ value => setDraft({ ...draft, title: value.replace(/\n/g, ' ') }) } />
                    <div className="phone-news-rule" />
                    <GrowingInput className="phone-news-field-body" value={ draft.body } placeholder="Write the story. A blank line starts a new paragraph." maxLength={ MAX_BODY } onChange={ value => setDraft({ ...draft, body: value }) } />
                </div>
                <div className="phone-news-pinrow phone-news-authorrow">
                    <PhoneFace id={ draft.anonymous ? newsroom.id : ownId } figure={ draft.anonymous ? newsroom.figure : GetSessionDataManager().figure } name={ draft.anonymous ? newsroom.name : (GetSessionDataManager().userName || '') } size={ 30 } />
                    <div className="phone-news-authorrow-text">
                        <div className="phone-news-pinrow-title">Publish as { newsroom.name }</div>
                        <div className="phone-news-pinrow-sub">{ draft.anonymous ? `Readers see ${ newsroom.name }. Staff still see it was you.` : 'Readers see your own name and face.' }</div>
                    </div>
                    <div className={ `phone-news-switch phone-tap${ draft.anonymous ? ' is-on' : '' }` } onClick={ event => setDraft({ ...draft, anonymous: !draft.anonymous }) }><div className="phone-news-switch-knob" /></div>
                </div>
                <div className="phone-news-pinrow">
                    <div>
                        <div className="phone-news-pinrow-title">Pin to top of Today</div>
                        <div className="phone-news-pinrow-sub">Stays first until you unpin it.</div>
                    </div>
                    <div className={ `phone-news-switch phone-tap${ draft.pinned ? ' is-on' : '' }` } onClick={ event => setDraft({ ...draft, pinned: !draft.pinned }) }><div className="phone-news-switch-knob" /></div>
                </div>
                <div className="phone-news-foot">Stories go live for everyone the moment you post.</div>
            </div>
        </div>
    );

    // ----- sheets -----

    const sheetShell = (content: JSX.Element, extraClass: string = '') => (
        <>
            <div className="phone-calendar-scrim" onClick={ event => setSheet(null) } />
            <div className={ `phone-calendar-sheet phone-news-sheet${ extraClass ? (' ' + extraClass) : '' }` }>
                <div className="phone-calendar-grabber" />
                { content }
            </div>
        </>
    );

    const menuSheet = open && sheetShell(
        <>
            <div className="phone-news-sheet-title">{ open.title }</div>
            <div className="phone-news-sheet-sub">{ open.anonymous ? <>Published as <b>{ open.authorName }</b>{ open.writerName ? ` · written by ${ open.writerName }` : '' }</> : `Posted by ${ open.authorName }` } · { longTime(open.createdAt, now) }</div>
            <div className="phone-news-menu">
                { canManage(open) &&
                    <div className="phone-news-menu-item phone-tap" onClick={ event => openCompose(open) }><PhoneIcon icon="pen" size={ 15 } /><span>Edit story</span></div> }
                <div className="phone-news-menu-item phone-tap" onClick={ event => { SendMessageComposer(new RpPinNewsPostComposer(open.id, !open.pinned)); setSheet(null); } }><PhoneIcon icon="thumbtack" size={ 15 } /><span>{ open.pinned ? 'Unpin from Today' : 'Pin to top of Today' }</span></div>
                { canManage(open) &&
                    <div className="phone-news-menu-item is-danger phone-tap" onClick={ event => setSheet('delete') }><PhoneIcon icon="trash" size={ 15 } /><span>Delete story</span></div> }
            </div>
            <div className="phone-news-hint">{ canManage(open) ? 'Deleting removes it for everyone right away.' : 'Only the author can edit or delete this story.' }</div>
        </>
    );

    const deleteSheet = open && sheetShell(
        <>
            <div className="phone-news-sheet-title">Delete this story?</div>
            <div className="phone-news-sheet-sub">It disappears from every phone immediately. This cannot be undone.</div>
            <div className="phone-news-sheet-actions">
                <div className="phone-news-btn phone-tap" onClick={ event => setSheet('menu') }>Cancel</div>
                <div className="phone-news-btn is-danger phone-tap" onClick={ event => deletePost(open.id) }>Delete</div>
            </div>
        </>
    );

    const tile = (name: string, index: number) => (
        <div key={ name } className={ `phone-news-tile phone-tap${ (draft && (draft.image === name)) ? ' is-on' : '' }` } style={ { animationDelay: `${ Math.min(index, 16) * 18 }ms` } } title={ name } onClick={ event => pickImage(name) }>
            <img src={ imageUrl(name) } alt="" loading="lazy" />
            { draft && (draft.image === name) &&
                <div className="phone-news-tile-check"><PhoneIcon icon="check" size={ 10 } /></div> }
        </div>
    );

    const pickerSheet = draft && sheetShell(
        <>
            <div className="phone-news-sheet-head">
                <div className="phone-news-sheet-title">Featured image</div>
                <div className="phone-news-sheet-done phone-tap" onClick={ event => setSheet(null) }>Done</div>
            </div>
            <div className="phone-news-sheet-sub">{ library ? `${ library.images.length.toLocaleString() } images from the news library. Tap one to use it.` : (libraryError ? 'The image library could not be loaded.' : 'Loading the news library…') }</div>
            <div className="phone-search phone-news-search">
                <PhoneIcon icon="search" size={ 14 } />
                <input type="text" value={ search } placeholder="Search by name" spellCheck={ false } onChange={ event => setSearch(event.target.value) } />
                { search.length > 0 &&
                    <div className="phone-tap" onClick={ event => setSearch('') }><PhoneIcon icon="close" size={ 13 } /></div> }
            </div>
            <div className="phone-news-picker-scroll">
                { library && !query.length && recent.filter(name => library.images.includes(name)).length > 0 &&
                    <>
                        <div className="phone-news-section is-sheet">Recently used</div>
                        <div className="phone-news-grid">{ recent.filter(name => library.images.includes(name)).map((name, index) => tile(name, index)) }</div>
                        <div className="phone-news-section is-sheet">All images</div>
                    </> }
                { library &&
                    <div className="phone-news-grid">{ filtered.map((name, index) => tile(name, index)) }</div> }
                { library && (totalMatches > filtered.length) &&
                    <div className="phone-news-hint">Showing { filtered.length } of { totalMatches.toLocaleString() }. Type to narrow it down.</div> }
                { library && query.length > 0 && !filtered.length &&
                    <div className="phone-news-hint">Nothing matches “{ search }”.</div> }
                { libraryError &&
                    <div className="phone-news-btn phone-tap" onClick={ openPicker }>Try again</div> }
                { !library && !libraryError &&
                    <div className="phone-news-grid">{ [ 0, 1, 2, 3, 4, 5 ].map(index => <div key={ index } className="phone-news-tile is-shimmer" />) }</div> }
            </div>
        </>
    );

    return (
        <div className="phone-screen phone-app-screen phone-news">
            <div key={ `${ screen }-${ (screen === 'article') ? openId : (screen === 'compose' ? (draft?.id ?? 0) : 0) }` } className={ `phone-news-anim is-${ slide }` }>
                { (screen === 'feed') && feedScreen }
                { (screen === 'article') && articleScreen }
                { (screen === 'compose') && composeScreen }
            </div>
            { (sheet === 'menu') && menuSheet }
            { (sheet === 'delete') && deleteSheet }
            { (sheet === 'picker') && pickerSheet }
        </div>
    );
}
