import { cloneElement, FC, useEffect, useState } from 'react';
import { GetSessionDataManager } from '../../api';
import { RpSitchActivityEvent, RpSitchFeedEvent, RpSitchProfileEvent, RpSitchSearchEvent, RpSitchThreadEvent, RpSitchTrendingEvent, SendSitchActivity, SendSitchBio, SendSitchDelete, SendSitchFeed, SendSitchFollow, SendSitchLike, SendSitchPost, SendSitchProfile, SendSitchProfileByName, SendSitchRepost, SendSitchSearch, SendSitchSong, SendSitchSuppressTag, SendSitchThread, SendSitchTrending, SITCH_MAX_BODY, SitchActivity, SitchPerson, SitchPost, SitchProfile, SitchSongArt, SitchSongUrl, SitchTalkedAbout, SitchTrend } from '../../api/rp-phone/RpSitchMessages';
import { useMessageEvent } from '../../hooks';
import { PhoneFace } from './PhoneAvatar';
import { PhoneIcon } from './PhoneIcon';
import { PlaySitchSong, StopSitchSong, useSitchSong } from '../music-player/SitchSongStore';
import { usePhonePhotos } from './usePhone';
import { usePhoneNotifications } from './usePhoneNotifications';

// Sitch: the city's own feed. Short posts, the replies they start, and a
// profile carrying one favorite song.
//
// Navigation is LOCAL, the way News does it - Sitch is one app with several
// screens, not several entries in PhoneView's screen union.
//
// Nothing here is optimistic. Every action sends and then renders whatever the
// server sends back, so a like that the server refused never appears to have
// worked. That costs a round trip and buys a screen that is never lying.

interface PhoneSitchViewProps
{
    onBack: () => void;
}

type Tab = 'feed' | 'search' | 'activity' | 'profile';
type Sheet = 'compose' | 'photos' | 'edit';

const TABS: { key: Tab, icon: string, label: string }[] = [
    { key: 'feed', icon: 'house', label: 'Feed' },
    { key: 'search', icon: 'magnifying-glass', label: 'Search' },
    { key: 'activity', icon: 'heart', label: 'Activity' },
    { key: 'profile', icon: 'user', label: 'Profile' }
];

const EMPTY: Record<string, { icon: string, title: string, sub: string }> = {
    feed: { icon: 'at', title: 'Nothing yet', sub: 'Be the first to say something.' },
    following: { icon: 'user-plus', title: 'Nobody yet', sub: 'Posts from people you follow land here.' },
    search: { icon: 'magnifying-glass', title: 'Search Sitch', sub: 'Find a person, a word, or a #tag.' },
    nothing: { icon: 'magnifying-glass', title: 'Nothing found', sub: 'No people or posts match that.' },
    activity: { icon: 'heart', title: 'Quiet so far', sub: 'Replies, likes and new followers land here.' },
    profile: { icon: 'user', title: 'Nothing posted', sub: 'What you post shows up here.' }
};

// The verb each activity row reads as. The server sends the kind, the wording
// lives here - the same split Notes and News use.
const ACT_WORDS: Record<string, string> = {
    like: 'liked your post',
    reply: 'replied to you',
    repost: 'reposted you',
    follow: 'followed you',
    mention: 'mentioned you'
};

// #hashtag and @mention, matched the same way the server extracts them so what
// lights up here is exactly what it indexed and notified. The capturing groups
// keep the delimiters, so split() returns the text and the tokens together.
const TOKENS = /([#@][A-Za-z0-9_\-.]+)/g;

// "4m", "3h", "2d" - a feed reads better in elapsed time than in clock time.
const Ago = (seconds: number): string =>
{
    const gap = Math.max(0, Math.floor(Date.now() / 1000) - seconds);

    if(gap < 60) return 'now';
    if(gap < 3600) return `${ Math.floor(gap / 60) }m`;
    if(gap < 86400) return `${ Math.floor(gap / 3600) }h`;

    return `${ Math.floor(gap / 86400) }d`;
}

const Count = (value: number): string => ((value > 0) ? value.toLocaleString('en-US') : '');

export const PhoneSitchView: FC<PhoneSitchViewProps> = props =>
{
    const { onBack = null } = props;
    const [ tab, setTab ] = useState<Tab>('feed');
    const [ following, setFollowing ] = useState(false);
    const [ canModerate, setCanModerate ] = useState(false);
    const [ posts, setPosts ] = useState<SitchPost[]>([]);
    const [ loaded, setLoaded ] = useState(false);
    const [ thread, setThread ] = useState<SitchPost[]>(null);
    const [ profile, setProfile ] = useState<SitchProfile>(null);
    const [ profilePosts, setProfilePosts ] = useState<SitchPost[]>([]);
    const [ activity, setActivity ] = useState<SitchActivity[]>([]);
    const [ sheet, setSheet ] = useState<Sheet>(null);
    const [ draft, setDraft ] = useState('');
    const [ draftPhoto, setDraftPhoto ] = useState(0);
    const [ replyTo, setReplyTo ] = useState(0);
    const [ songUrl, setSongUrl ] = useState('');
    // The song being attached to the post being written. Separate from songUrl,
    // which belongs to the profile's edit sheet - the two are open at different
    // times but there is no reason to make them fight over one box.
    const [ draftSong, setDraftSong ] = useState('');
    // What the edit sheet opened with. Saving re-resolves a link through
    // YouTube's oEmbed endpoint, so an untouched field should not pay for that
    // - and, far worse, the field used to open EMPTY, which meant editing your
    // bio silently deleted your favorite song (an empty link is how you remove
    // one). The field now opens with what is saved, and Save only sends it when
    // it actually differs.
    const [ songUrlOpened, setSongUrlOpened ] = useState('');
    const [ bioDraft, setBioDraft ] = useState('');
    const [ query, setQuery ] = useState('');
    const [ people, setPeople ] = useState<SitchPerson[]>([]);
    const [ found, setFound ] = useState<SitchPost[]>([]);
    const [ searched, setSearched ] = useState(false);
    const [ trendTags, setTrendTags ] = useState<SitchTrend[]>([]);
    const [ trendPeople, setTrendPeople ] = useState<SitchTalkedAbout[]>([]);
    const { photos = [], photosLoaded = false, requestPhotos = null } = usePhonePhotos();
    const { markAppSeen = null } = usePhoneNotifications();
    const playingSong = useSitchSong();
    const ownUserId = GetSessionDataManager().userId;

    // Whose profile the Profile tab is showing. 0 is mine; tapping a name
    // in the feed puts somebody else's id here, which is what makes Follow
    // reachable at all.
    const [ viewing, setViewing ] = useState(0);

    const mine = (!!profile && (profile.userId === ownUserId));

    useEffect(() =>
    {
        setLoaded(false);

        if(tab === 'feed') SendSitchFeed(following);
        else if(tab === 'activity')
        {
            SendSitchActivity();

            // The Activity tab shows the same events the notifications
            // describe, so opening it reads them.
            if(markAppSeen) markAppSeen('sitch');
        }
        // Trending is the Search tab at rest, so it is fetched on arrival
        // rather than waiting for somebody to type.
        else if(tab === 'search') SendSitchTrending();
        else if(tab === 'profile') 
        {
            if(viewing >= 0) SendSitchProfile(viewing); 
        }
        else setLoaded(true);
        // markAppSeen is deliberately out of the deps: its identity changes
        // with the notification list, and depending on it would re-fetch the
        // feed every time a notification arrived.
    }, [ tab, following, viewing ]); // eslint-disable-line react-hooks/exhaustive-deps

    // Typing is not a query: the box waits until somebody stops, which is the
    // server's protection as much as the field's responsiveness.
    useEffect(() =>
    {
        const trimmed = query.trim();

        if(!trimmed.length)
        {
            setPeople([]);
            setFound([]);
            setSearched(false);

            return;
        }

        const timeout = window.setTimeout(() => SendSitchSearch(trimmed), 300);

        return () => window.clearTimeout(timeout);
    }, [ query ]);

    useMessageEvent<RpSitchSearchEvent>(RpSitchSearchEvent, event =>
    {
        const parser = event.getParser();

        // A slow answer must not overwrite a newer question.
        if(parser.query.trim().toLowerCase() !== query.trim().toLowerCase()) return;

        setPeople(parser.people);
        setFound(parser.posts);
        setSearched(true);
    });

    useMessageEvent<RpSitchTrendingEvent>(RpSitchTrendingEvent, event =>
    {
        const parser = event.getParser();

        setTrendTags(parser.tags);
        setTrendPeople(parser.people);
        // The trending packet carries it too, so a staff member who opened
        // straight into Search still gets the button.
        setCanModerate(parser.canModerate);
    });

    useMessageEvent<RpSitchFeedEvent>(RpSitchFeedEvent, event =>
    {
        const parser = event.getParser();

        setCanModerate(parser.canModerate);

        // A slow answer must not land in the tab that no longer asked for it.
        if(parser.following !== following) return;

        setPosts(parser.posts);
        setLoaded(true);
    });

    useMessageEvent<RpSitchThreadEvent>(RpSitchThreadEvent, event =>
    {
        // Only follow a thread answer while a thread is open - a like sent
        // from the feed answers with one too, and it must not hijack the view.
        setThread(current => (current ? event.getParser().posts : current));
    });

    useMessageEvent<RpSitchProfileEvent>(RpSitchProfileEvent, event =>
    {
        const parser = event.getParser();

        setProfile(parser.profile);
        setProfilePosts(parser.posts);
        setLoaded(true);
    });

    useMessageEvent<RpSitchActivityEvent>(RpSitchActivityEvent, event =>
    {
        setActivity(event.getParser().rows);
        setLoaded(true);
    });

    const refresh = () =>
    {
        if(thread && thread.length) SendSitchThread(thread[0].id);
        else if(tab === 'profile') 
        {
            if(viewing >= 0) SendSitchProfile(viewing); 
        }
        else SendSitchFeed(following);
    }

    const openThread = (postId: number) =>
    {
        setThread([]);
        SendSitchThread(postId);
    }

    const openProfile = (userId: number) =>
    {
        setViewing((userId === ownUserId) ? 0 : userId);
        setThread(null);
        setTab('profile');
    }

    const openTag = (tag: string) =>
    {
        setThread(null);
        setQuery(tag);
        setTab('search');
    }

    const openMention = (name: string) =>
    {
        setThread(null);
        setViewing(-1);
        setTab('profile');
        SendSitchProfileByName(name);
    }

    // A body with its hashtags and mentions made real. Everything else is
    // plain text - this deliberately does not linkify bare URLs, which would
    // turn a typo into something tappable.
    const richBody = (body: string) => body.split(TOKENS).map((piece, index) =>
    {
        if(piece.startsWith('#') && (piece.length > 1))
            return <span key={ index } className="phone-sitch-token" onClick={ event => 
            {
                event.stopPropagation(); openTag(piece); 
            } }>{ piece }</span>;

        if(piece.startsWith('@') && (piece.length > 1))
            return <span key={ index } className="phone-sitch-token" onClick={ event => 
            {
                event.stopPropagation(); openMention(piece.substring(1)); 
            } }>{ piece }</span>;

        return <span key={ index }>{ piece }</span>;
    });

    const openCompose = (parentId: number = 0) =>
    {
        setReplyTo(parentId);
        setDraft('');
        setDraftPhoto(0);
        setDraftSong('');
        setSheet('compose');
    }

    const send = () =>
    {
        const body = draft.trim();
        const song = draftSong.trim();

        // A song on its own is a post: "here, listen to this" is the whole
        // message. The server agrees, so the two do not disagree about what an
        // empty post is.
        if(!body.length && !draftPhoto && !song.length) return;

        SendSitchPost(body, replyTo, draftPhoto, song);
        setSheet(null);
        setDraft('');
        setDraftPhoto(0);
        setDraftSong('');
    }

    const remove = (postId: number) =>
    {
        SendSitchDelete(postId);
        setThread(null);
    }

    const like = (post: SitchPost) =>
    {
        SendSitchLike(post.id, !post.liked);
        // The like answers with a thread; ask for the view we are actually on.
        if(!thread) window.setTimeout(refresh, 60);
    }

    const repost = (post: SitchPost) =>
    {
        SendSitchRepost(post.id, !post.reposted);
        if(!thread) window.setTimeout(refresh, 60);
    }

    const remaining = (SITCH_MAX_BODY - draft.length);

    const emptyState = (key: string) =>
    {
        const empty = EMPTY[key];

        return (
            <div className="phone-sitch-empty">
                <div className="phone-sitch-empty-icon"><PhoneIcon icon={ empty.icon } size={ 24 } /></div>
                <div className="phone-sitch-empty-title">{ empty.title }</div>
                <div className="phone-sitch-empty-sub">{ empty.sub }</div>
            </div>
        );
    }

    /**
     * One post. On a profile it may be somebody else's, put there by a repost -
     * in which case the card keeps the ORIGINAL author's name and head, exactly
     * as X and Threads do, and a line above says who passed it on. Attributing
     * it to the reposter would be quietly rewriting who said it.
     */
    const postRow = (post: SitchPost, inThread: boolean = false, canDelete: boolean = false) =>
    {
        const card = postCard(post, inThread, canDelete);

        if(!post.repostedBy) return cloneElement(card, { key: post.id });

        return (
            <div key={ post.id } className="phone-sitch-repost">
                <div className="phone-sitch-repost-head">
                    <PhoneIcon icon="repeat" size={ 12 } />
                    <span>{ post.repostedBy } reposted</span>
                </div>
                { card }
            </div>
        );
    }

    const postCard = (post: SitchPost, inThread: boolean, canDelete: boolean) => (
        <div className={ 'phone-sitch-post' + (inThread ? ' is-reply' : '') }>
            <PhoneFace id={ post.userId } figure={ post.figure } name={ post.username } size={ 34 } className="phone-sitch-face" onClick={ () => openProfile(post.userId) } />
            <div className="phone-sitch-post-body">
                <div className="phone-sitch-post-head">
                    <div className="phone-sitch-post-name phone-tap" onClick={ () => openProfile(post.userId) }>{ post.username }</div>
                    { (post.rank >= 5) && <i className="fa-solid fa-badge-check phone-sitch-verified" title="PixelRP Staff" aria-hidden="true" /> }
                    <div className="phone-sitch-post-ago">{ Ago(post.createdAt) }</div>
                </div>
                { !!post.body && <div className="phone-sitch-post-text" onClick={ () => (!inThread && openThread(post.id)) }>{ richBody(post.body) }</div> }
                { !!post.songVideoId &&
                    <div className="phone-sitch-song is-inpost">
                        <img className="phone-sitch-song-art" src={ SitchSongArt(post.songVideoId) } alt="" loading="lazy" />
                        <div className="phone-sitch-song-text">
                            <div className="phone-sitch-song-title">{ post.songTitle || post.songVideoId }</div>
                            { !!post.songAuthor && <div className="phone-sitch-song-author">{ post.songAuthor }</div> }
                        </div>
                        { /* Same player as a profile's favorite song, so two
                             songs never overlap and Tunes is stopped either way. */ }
                        <div className={ 'phone-sitch-song-play phone-tap' + ((playingSong?.videoId === post.songVideoId) ? ' is-on' : '') }
                            title={ (playingSong?.videoId === post.songVideoId) ? 'Stop' : 'Play' }
                            onClick={ () =>
                            {
                                if(playingSong?.videoId === post.songVideoId) StopSitchSong();
                                else PlaySitchSong({
                                    videoId: post.songVideoId,
                                    title: (post.songTitle || post.songVideoId),
                                    author: post.songAuthor,
                                    userId: post.userId
                                });
                            } }>
                            <PhoneIcon icon={ (playingSong?.videoId === post.songVideoId) ? 'stop' : 'play' } size={ 15 } />
                        </div>
                    </div> }
                { !!post.photoUrl &&
                    <div className="phone-sitch-photo">
                        <img src={ post.photoUrl } alt="" loading="lazy" />
                        { !!post.photoRoom && <div className="phone-sitch-photo-room">{ post.photoRoom }</div> }
                    </div> }
                <div className="phone-sitch-stats">
                    <div className="phone-sitch-stat phone-tap" onClick={ () => openCompose(post.id) }>
                        <PhoneIcon icon="comment" size={ 15 } />{ Count(post.replies) }
                    </div>
                    <div className={ 'phone-sitch-stat phone-tap' + (post.reposted ? ' is-on' : '') } onClick={ () => repost(post) }>
                        <PhoneIcon icon="repeat" size={ 15 } />{ Count(post.reposts) }
                    </div>
                    <div className={ 'phone-sitch-stat phone-tap' + (post.liked ? ' is-on' : '') } onClick={ () => like(post) }>
                        <PhoneIcon icon="heart" size={ 15 } />{ Count(post.likes) }
                    </div>
                    { canDelete &&
                        <div className="phone-sitch-stat phone-tap phone-sitch-remove" onClick={ () => remove(post.id) }>
                            <PhoneIcon icon="trash" size={ 15 } />
                        </div> }
                </div>
            </div>
        </div>
    );

    // A post is removable by its author, or by staff holding the permission.
    // The server checks again either way - this only decides what is offered.
    const deletable = (post: SitchPost): boolean => (canModerate || (post.userId === ownUserId));

    const sheetView = () =>
    {
        if(sheet === 'compose')
        {
            const photo = photos.find(entry => (entry.id === draftPhoto));

            return (
                <div className="phone-sitch-sheet">
                    <div className="phone-sitch-sheet-bar">
                        <div className="phone-tap" onClick={ () => setSheet(null) }>Cancel</div>
                        <div className="phone-sitch-sheet-title">{ replyTo ? 'Reply' : 'New post' }</div>
                        <div className={ 'phone-sitch-send phone-tap' + (((draft.trim().length || draftPhoto || draftSong.trim().length) && (remaining >= 0)) ? '' : ' is-off') }
                            onClick={ send }>Post</div>
                    </div>
                    <textarea className="phone-sitch-input" autoFocus value={ draft } maxLength={ SITCH_MAX_BODY + 40 }
                        placeholder={ replyTo ? 'Say something back…' : 'What’s happening in the city?' }
                        onChange={ event => setDraft(event.target.value) } />
                    { !!photo &&
                        <div className="phone-sitch-draft-photo">
                            <img src={ photo.url } alt="" />
                            <div className="phone-tap phone-sitch-draft-drop" onClick={ () => setDraftPhoto(0) }>
                                <PhoneIcon icon="close" size={ 11 } />
                            </div>
                        </div> }
                    { /* Its own field, never the body: the body refuses links,
                         and this is the box that makes that rule affordable. */ }
                    <div className="phone-sitch-draft-song">
                        <PhoneIcon icon="music" size={ 14 } />
                        <input className="phone-sitch-line" type="text" value={ draftSong } spellCheck={ false }
                            placeholder="Add a song (YouTube link)" onChange={ event => setDraftSong(event.target.value) } />
                        { !!draftSong.length &&
                            <div className="phone-tap phone-sitch-draft-drop is-inline" onClick={ () => setDraftSong('') }>
                                <PhoneIcon icon="close" size={ 11 } />
                            </div> }
                    </div>
                    <div className="phone-sitch-sheet-foot">
                        <div className={ 'phone-tap phone-sitch-attach' + (draftPhoto ? ' is-on' : '') }
                            onClick={ () => 
                            {
                                requestPhotos && requestPhotos(); setSheet('photos'); 
                            } }>
                            <PhoneIcon icon="image" size={ 19 } />
                        </div>
                        <div className={ 'phone-sitch-count' + ((remaining < 0) ? ' is-over' : ((remaining <= 40) ? ' is-near' : '')) }>{ remaining }</div>
                    </div>
                </div>
            );
        }

        if(sheet === 'photos')
        {
            return (
                <div className="phone-sitch-sheet">
                    <div className="phone-sitch-sheet-bar">
                        <div className="phone-tap" onClick={ () => setSheet('compose') }>Back</div>
                        <div className="phone-sitch-sheet-title">Photos</div>
                        <div className="phone-sitch-send is-off">Add</div>
                    </div>
                    { (photosLoaded && !photos.length)
                        ? <div className="phone-sitch-empty-sub phone-sitch-nophotos">Nothing in your library yet. Take a photo with the Camera first.</div>
                        : <div className="phone-sitch-grid">
                            { photos.map(entry => (
                                <div key={ entry.id } className={ 'phone-sitch-cell phone-tap' + ((entry.id === draftPhoto) ? ' is-on' : '') }
                                    onClick={ () => 
                                    {
                                        setDraftPhoto(entry.id); setSheet('compose'); 
                                    } }>
                                    <img src={ entry.url } alt="" loading="lazy" />
                                    { !!entry.roomName && <div className="phone-sitch-cell-room">{ entry.roomName }</div> }
                                </div>
                            )) }
                        </div> }
                </div>
            );
        }

        return (
            <div className="phone-sitch-sheet">
                <div className="phone-sitch-sheet-bar">
                    <div className="phone-tap" onClick={ () => setSheet(null) }>Cancel</div>
                    <div className="phone-sitch-sheet-title">Edit profile</div>
                    <div className="phone-sitch-send phone-tap"
                        onClick={ () => 
                        {
                            SendSitchBio(bioDraft);
                            if(songUrl.trim() !== songUrlOpened.trim()) SendSitchSong(songUrl);
                            setSheet(null); 
                        } }>Save</div>
                </div>
                <div className="phone-sitch-field">
                    <div className="phone-app-kicker phone-sitch-kicker">BIO</div>
                    <textarea className="phone-sitch-input is-short" value={ bioDraft } maxLength={ 160 }
                        placeholder="A line about you" onChange={ event => setBioDraft(event.target.value) } />
                </div>
                <div className="phone-sitch-field">
                    <div className="phone-app-kicker phone-sitch-kicker">FAVORITE SONG</div>
                    <input className="phone-sitch-line" type="text" value={ songUrl } spellCheck={ false }
                        placeholder="Paste a YouTube link" onChange={ event => setSongUrl(event.target.value) } />
                    <div className="phone-sitch-note">One song sits on your profile, and saving a new one replaces it. It never joins the hotel queue and never plays on its own &mdash; people tap it to listen, and it takes over from Spotify and the room&rsquo;s jukebox while it does. For the room, use Spotify. Clear this box to take it off.</div>
                </div>
            </div>
        );
    }

    if(thread)
    {
        const root = (thread.length ? thread[0] : null);

        return (
            <div className="phone-screen phone-app-screen phone-sitch">
                <div className="phone-app-scroll phone-sitch-body">
                    <div className="phone-app-header">
                        <div className="phone-app-header-lead">
                            <div className="phone-tap phone-thread-back phone-sitch-back" onClick={ () => 
                            {
                                setThread(null); refresh(); 
                            } }>
                                <PhoneIcon icon="chevron-left" size={ 22 } />
                            </div>
                            <div className="phone-sitch-head">
                                <div className="phone-app-kicker phone-sitch-kicker">{ root ? root.username.toUpperCase() : 'SITCH' }</div>
                                <div className="phone-app-title">Thread</div>
                            </div>
                        </div>
                        { !!root &&
                            <div className="phone-fab phone-tap" onClick={ () => openCompose(root.id) }>
                                <PhoneIcon icon="compose" size={ 17 } />
                            </div> }
                    </div>
                    { thread.map((post, index) => postRow(post, index > 0, deletable(post))) }
                    <div className="phone-scroll-spacer" />
                </div>
                { !!sheet && sheetView() }
            </div>
        );
    }

    return (
        <div className="phone-screen phone-app-screen phone-sitch">
            <div className="phone-app-scroll phone-sitch-body">
                <div className="phone-app-header">
                    <div className="phone-app-header-lead">
                        <div className="phone-tap phone-thread-back phone-sitch-back" onClick={ () => onBack && onBack() }>
                            <PhoneIcon icon="chevron-left" size={ 22 } />
                        </div>
                        <div className="phone-sitch-head">
                            <div className="phone-app-kicker phone-sitch-kicker">THE CITY, OUT LOUD</div>
                            <div className="phone-app-title">Sitch</div>
                        </div>
                    </div>
                    { (tab === 'feed') &&
                        <div className="phone-fab phone-tap" onClick={ () => openCompose(0) }>
                            <PhoneIcon icon="compose" size={ 17 } />
                        </div> }
                    { (tab === 'profile') && !!mine &&
                        <div className="phone-fab phone-tap"
                            onClick={ () => 
                            {
                                const saved = SitchSongUrl(profile.favoriteVideoId);

                                setBioDraft(profile.bio); setSongUrl(saved); setSongUrlOpened(saved); setSheet('edit'); 
                            } }>
                            <PhoneIcon icon="pencil" size={ 17 } />
                        </div> }
                </div>
                { (tab === 'feed') &&
                    <div className="phone-sitch-switch">
                        <div className={ 'phone-sitch-pill' + (!following ? ' is-on' : '') } onClick={ () => setFollowing(false) }>For you</div>
                        <div className={ 'phone-sitch-pill' + (following ? ' is-on' : '') } onClick={ () => setFollowing(true) }>Following</div>
                    </div> }
                { (tab === 'feed') && (loaded && !posts.length ? emptyState(following ? 'following' : 'feed') : posts.map(post => postRow(post, false, deletable(post)))) }
                { (tab === 'search') &&
                    <>
                        <div className="phone-sitch-searchbar">
                            <PhoneIcon icon="magnifying-glass" size={ 15 } />
                            <input className="phone-sitch-searchinput" type="text" value={ query } spellCheck={ false }
                                placeholder="Names, words, #tags" onChange={ event => setQuery(event.target.value) } />
                            { !!query.length &&
                                <div className="phone-tap phone-sitch-clear" onClick={ () => setQuery('') }>
                                    <PhoneIcon icon="close" size={ 13 } />
                                </div> }
                        </div>
                        { /* The Search tab at rest. Trending is the answer to
                             "what is going on", which is what somebody opening
                             search usually wants before they know what to type.
                             The blank prompt stays as the fallback for a quiet
                             hotel with nothing to show. */ }
                        { !query.trim().length && (!trendTags.length && !trendPeople.length) && emptyState('search') }
                        { !query.trim().length && !!trendTags.length &&
                            <>
                                <div className="phone-app-kicker phone-sitch-kicker phone-sitch-section">TRENDING</div>
                                { trendTags.map(entry => (
                                    <div key={ entry.tag } className="phone-sitch-trend">
                                        <div className="phone-sitch-trend-text phone-tap" onClick={ () => setQuery('#' + entry.tag) }>
                                            <div className="phone-sitch-trend-tag">#{ entry.tag }</div>
                                            <div className="phone-sitch-trend-count">
                                                { entry.posts.toLocaleString('en-US') } { (entry.posts === 1) ? 'post' : 'posts' }
                                            </div>
                                        </div>
                                        { canModerate &&
                                            <div className="phone-tap phone-sitch-trend-hush" title="Suppress this tag"
                                                onClick={ () => SendSitchSuppressTag(entry.tag, true) }>
                                                <PhoneIcon icon="ban" size={ 15 } />
                                            </div> }
                                    </div>
                                )) }
                            </> }
                        { !query.trim().length && !!trendPeople.length &&
                            <>
                                <div className="phone-app-kicker phone-sitch-kicker phone-sitch-section">TALKED ABOUT</div>
                                { trendPeople.map(person => (
                                    <div key={ person.userId } className="phone-sitch-person phone-tap" onClick={ () => openProfile(person.userId) }>
                                        <PhoneFace id={ person.userId } figure={ person.figure } name={ person.username } size={ 34 } className="phone-sitch-face" />
                                        <div className="phone-sitch-person-text">
                                            <div className="phone-sitch-post-name">{ person.username }</div>
                                            <div className="phone-sitch-person-sub">
                                                mentioned by { person.mentions.toLocaleString('en-US') } { (person.mentions === 1) ? 'person' : 'people' }
                                            </div>
                                        </div>
                                    </div>
                                )) }
                            </> }
                        { (searched && !!query.trim().length && !people.length && !found.length) && emptyState('nothing') }
                        { !!people.length &&
                            <>
                                <div className="phone-app-kicker phone-sitch-kicker phone-sitch-section">PEOPLE</div>
                                { people.map(person => (
                                    <div key={ person.userId } className="phone-sitch-person phone-tap" onClick={ () => openProfile(person.userId) }>
                                        <PhoneFace id={ person.userId } figure={ person.figure } name={ person.username } size={ 34 } className="phone-sitch-face" />
                                        <div className="phone-sitch-person-text">
                                            <div className="phone-sitch-post-name">{ person.username }</div>
                                            <div className="phone-sitch-person-sub">{ person.bio || `${ person.followers.toLocaleString('en-US') } followers` }</div>
                                        </div>
                                        { person.follows && <div className="phone-sitch-person-flag">Following</div> }
                                    </div>
                                )) }
                            </> }
                        { !!found.length &&
                            <>
                                <div className="phone-app-kicker phone-sitch-kicker phone-sitch-section">POSTS</div>
                                { found.map(post => postRow(post, false, deletable(post))) }
                            </> }
                    </> }
                { (tab === 'activity') && (loaded && !activity.length ? emptyState('activity') : activity.map(row => (
                    <div key={ row.id } className="phone-sitch-act phone-tap" onClick={ () => (row.postId ? openThread(row.postId) : null) }>
                        { /* the row itself opens the post being talked about, so the
                             head has to stop the tap or you would get the profile
                             with the thread opening on top of it */ }
                        <PhoneFace id={ row.actorId } figure={ row.actorFigure } name={ row.actorName } size={ 32 } className="phone-sitch-face" onClick={ event => { event.stopPropagation(); openProfile(row.actorId); } } />
                        <div className="phone-sitch-act-body">
                            <div className="phone-sitch-act-text">
                                <strong>{ row.actorName }</strong> { ACT_WORDS[row.kind] ?? 'did something' }
                                { !!row.postBody && <span className="phone-sitch-act-quote"> &ldquo;{ row.postBody }&rdquo;</span> }
                            </div>
                            <div className="phone-sitch-act-ago">{ Ago(row.createdAt) }</div>
                        </div>
                    </div>
                ))) }
                { (tab === 'profile') && !!profile &&
                    <>
                        <div className="phone-sitch-profile">
                            <div className="phone-sitch-profile-top">
                                <div className="phone-sitch-profile-names">
                                    <div className="phone-sitch-profile-name">{ profile.username }</div>
                                    { !!profile.motto && <div className="phone-sitch-profile-motto">{ profile.motto }</div> }
                                </div>
                                <PhoneFace id={ profile.userId } figure={ profile.figure } name={ profile.username } size={ 60 } className="phone-sitch-face" />
                            </div>
                            { !!profile.bio && <div className="phone-sitch-profile-bio">{ profile.bio }</div> }
                            <div className="phone-sitch-profile-counts">
                                <div><strong>{ profile.followers.toLocaleString('en-US') }</strong> followers</div>
                                <div><strong>{ profile.following.toLocaleString('en-US') }</strong> following</div>
                            </div>
                            { !mine &&
                                <div className={ 'phone-sitch-follow phone-tap' + (profile.follows ? ' is-on' : '') }
                                    onClick={ () => SendSitchFollow(profile.userId, !profile.follows) }>
                                    { profile.follows ? 'Following' : 'Follow' }
                                </div> }
                            { !!profile.favoriteVideoId &&
                                <>
                                    <div className="phone-app-kicker phone-sitch-kicker phone-sitch-song-label">FAVORITE SONG</div>
                                    <div className="phone-sitch-song">
                                        <img className="phone-sitch-song-art" src={ SitchSongArt(profile.favoriteVideoId) } alt="" loading="lazy" />
                                        <div className="phone-sitch-song-text">
                                            <div className="phone-sitch-song-title">{ profile.favoriteTitle || profile.favoriteVideoId }</div>
                                            { !!profile.favoriteAuthor && <div className="phone-sitch-song-author">{ profile.favoriteAuthor }</div> }
                                        </div>
                                        { /* Playing is this listener's own business: nobody else
                                             hears it, and it stops Spotify and talks over the room's
                                             jukebox for as long as it runs. */ }
                                        <div className={ 'phone-sitch-song-play phone-tap' + ((playingSong?.videoId === profile.favoriteVideoId) ? ' is-on' : '') }
                                            title={ (playingSong?.videoId === profile.favoriteVideoId) ? 'Stop' : 'Play' }
                                            onClick={ () =>
                                            {
                                                if(playingSong?.videoId === profile.favoriteVideoId) StopSitchSong();
                                                else PlaySitchSong({
                                                    videoId: profile.favoriteVideoId,
                                                    title: (profile.favoriteTitle || profile.favoriteVideoId),
                                                    author: profile.favoriteAuthor,
                                                    userId: profile.userId
                                                });
                                            } }>
                                            <PhoneIcon icon={ (playingSong?.videoId === profile.favoriteVideoId) ? 'stop' : 'play' } size={ 15 } />
                                        </div>
                                    </div>
                                </> }
                        </div>
                        { (loaded && !profilePosts.length) ? emptyState('profile') : profilePosts.map(post => postRow(post, false, deletable(post))) }
                    </> }
                <div className="phone-scroll-spacer" />
            </div>
            <div className="phone-sitch-tabs">
                { TABS.map(entry => (
                    <div key={ entry.key } title={ entry.label } className={ 'phone-sitch-tab' + ((tab === entry.key) ? ' is-on' : '') } onClick={ () => 
                    {
                        if(entry.key === 'profile') setViewing(0); setTab(entry.key); 
                    } }>
                        <PhoneIcon icon={ entry.icon } size={ 21 } />
                    </div>
                )) }
            </div>
            { !!sheet && sheetView() }
        </div>
    );
}
