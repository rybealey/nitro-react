import { FC, useEffect, useState } from 'react';
import { GetSessionDataManager } from '../../api';
import { RpSitchActivityEvent, RpSitchFeedEvent, RpSitchProfileEvent, RpSitchThreadEvent, SendSitchActivity, SendSitchBio, SendSitchDelete, SendSitchFeed, SendSitchFollow, SendSitchLike, SendSitchPost, SendSitchProfile, SendSitchRepost, SendSitchSong, SendSitchThread, SITCH_MAX_BODY, SitchActivity, SitchPost, SitchProfile, SitchSongArt } from '../../api/rp-phone/RpSitchMessages';
import { useMessageEvent } from '../../hooks';
import { PhoneFace } from './PhoneAvatar';
import { PhoneIcon } from './PhoneIcon';
import { usePhonePhotos } from './usePhone';

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
    search: { icon: 'magnifying-glass', title: 'Find someone', sub: 'Searching arrives with the next update.' },
    activity: { icon: 'heart', title: 'Quiet so far', sub: 'Replies, likes and new followers land here.' },
    profile: { icon: 'user', title: 'Nothing posted', sub: 'What you post shows up here.' }
};

// The verb each activity row reads as. The server sends the kind, the wording
// lives here - the same split Notes and News use.
const ACT_WORDS: Record<string, string> = {
    like: 'liked your post',
    reply: 'replied to you',
    repost: 'reposted you',
    follow: 'followed you'
};

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
    const [ bioDraft, setBioDraft ] = useState('');
    const { photos = [], photosLoaded = false, requestPhotos = null } = usePhonePhotos();
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
        else if(tab === 'activity') SendSitchActivity();
        else if(tab === 'profile') SendSitchProfile(viewing);
        else setLoaded(true);
    }, [ tab, following, viewing ]);

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
        else if(tab === 'profile') SendSitchProfile(viewing);
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

    const openCompose = (parentId: number = 0) =>
    {
        setReplyTo(parentId);
        setDraft('');
        setDraftPhoto(0);
        setSheet('compose');
    }

    const send = () =>
    {
        const body = draft.trim();

        if(!body.length && !draftPhoto) return;

        SendSitchPost(body, replyTo, draftPhoto);
        setSheet(null);
        setDraft('');
        setDraftPhoto(0);
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

    const postRow = (post: SitchPost, inThread: boolean = false, canDelete: boolean = false) => (
        <div key={ post.id } className={ 'phone-sitch-post' + (inThread ? ' is-reply' : '') }>
            <PhoneFace id={ post.userId } figure={ post.figure } name={ post.username } size={ 34 } className="phone-sitch-face" />
            <div className="phone-sitch-post-body">
                <div className="phone-sitch-post-head">
                    <div className="phone-sitch-post-name phone-tap" onClick={ () => openProfile(post.userId) }>{ post.username }</div>
                    { (post.rank >= 5) && <div className="phone-sitch-staff">STAFF</div> }
                    <div className="phone-sitch-post-ago">{ Ago(post.createdAt) }</div>
                </div>
                { !!post.body && <div className="phone-sitch-post-text" onClick={ () => (!inThread && openThread(post.id)) }>{ post.body }</div> }
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
                        <div className={ 'phone-sitch-send phone-tap' + (((draft.trim().length || draftPhoto) && (remaining >= 0)) ? '' : ' is-off') }
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
                            SendSitchBio(bioDraft); SendSitchSong(songUrl); setSheet(null); 
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
                    <div className="phone-sitch-note">One song sits on your profile, and saving a new one replaces it. It never joins the hotel queue and never plays on its own &mdash; people tap it to listen. For the room, use Tunes. Leave this empty to take it off.</div>
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
                                <PhoneIcon icon="pencil" size={ 17 } />
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
                            <PhoneIcon icon="pencil" size={ 17 } />
                        </div> }
                    { (tab === 'profile') && !!mine &&
                        <div className="phone-fab phone-tap"
                            onClick={ () => 
                            {
                                setBioDraft(profile.bio); setSongUrl(''); setSheet('edit'); 
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
                { (tab === 'search') && emptyState('search') }
                { (tab === 'activity') && (loaded && !activity.length ? emptyState('activity') : activity.map(row => (
                    <div key={ row.id } className="phone-sitch-act phone-tap" onClick={ () => (row.postId ? openThread(row.postId) : null) }>
                        <PhoneFace id={ row.actorId } figure={ row.actorFigure } name={ row.actorName } size={ 32 } className="phone-sitch-face" />
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
