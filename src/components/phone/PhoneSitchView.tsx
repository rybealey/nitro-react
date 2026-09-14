import { FC, useEffect, useState } from 'react';
import { RpSitchActivityEvent, RpSitchFeedEvent, RpSitchProfileEvent, RpSitchThreadEvent, SendSitchActivity, SendSitchFeed, SendSitchProfile, SendSitchThread, SitchActivity, SitchPost, SitchProfile, SitchSongArt } from '../../api/rp-phone/RpSitchMessages';
import { useMessageEvent } from '../../hooks';
import { PhoneFace } from './PhoneAvatar';
import { PhoneIcon } from './PhoneIcon';

// Sitch: the city's own feed. Short posts, the replies they start, and a
// profile carrying one favorite song.
//
// READ PATH. Everything here is real data from the server, but nothing writes
// yet: there is deliberately no composer and no Post button, and the like and
// repost figures are COUNTS rather than buttons. A control that looks like it
// works and silently does nothing is worse than one that is not there.
//
// Navigation is LOCAL, the way News does it - Sitch is one app with several
// screens, not several entries in PhoneView's screen union.

interface PhoneSitchViewProps
{
    onBack: () => void;
}

type Tab = 'feed' | 'search' | 'activity' | 'profile';

const TABS: { key: Tab, icon: string, label: string }[] = [
    { key: 'feed', icon: 'house', label: 'Feed' },
    { key: 'search', icon: 'magnifying-glass', label: 'Search' },
    { key: 'activity', icon: 'heart', label: 'Activity' },
    { key: 'profile', icon: 'user', label: 'Profile' }
];

const EMPTY: Record<string, { icon: string, title: string, sub: string }> = {
    feed: { icon: 'at', title: 'Nothing yet', sub: 'When people start posting, the city turns up here.' },
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
    const [ posts, setPosts ] = useState<SitchPost[]>([]);
    const [ loaded, setLoaded ] = useState(false);
    const [ thread, setThread ] = useState<SitchPost[]>(null);
    const [ profile, setProfile ] = useState<SitchProfile>(null);
    const [ profilePosts, setProfilePosts ] = useState<SitchPost[]>([]);
    const [ activity, setActivity ] = useState<SitchActivity[]>([]);

    useEffect(() =>
    {
        setLoaded(false);

        if(tab === 'feed') SendSitchFeed(following);
        else if(tab === 'activity') SendSitchActivity();
        else if(tab === 'profile') SendSitchProfile(0);
        else setLoaded(true);
    }, [ tab, following ]);

    useMessageEvent<RpSitchFeedEvent>(RpSitchFeedEvent, event =>
    {
        const parser = event.getParser();

        // A slow answer must not land in the tab that no longer asked for it.
        if(parser.following !== following) return;

        setPosts(parser.posts);
        setLoaded(true);
    });

    useMessageEvent<RpSitchThreadEvent>(RpSitchThreadEvent, event => setThread(event.getParser().posts));

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

    const openThread = (postId: number) =>
    {
        setThread([]);
        SendSitchThread(postId);
    }

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

    const postRow = (post: SitchPost, inThread: boolean = false) => (
        <div key={ post.id } className={ 'phone-sitch-post' + (inThread ? ' is-reply' : '') } onClick={ () => (!inThread && openThread(post.id)) }>
            <PhoneFace id={ post.userId } figure={ post.figure } name={ post.username } size={ 34 } className="phone-sitch-face" />
            <div className="phone-sitch-post-body">
                <div className="phone-sitch-post-head">
                    <div className="phone-sitch-post-name">{ post.username }</div>
                    { (post.rank >= 5) && <div className="phone-sitch-staff">STAFF</div> }
                    <div className="phone-sitch-post-ago">{ Ago(post.createdAt) }</div>
                </div>
                { !!post.body && <div className="phone-sitch-post-text">{ post.body }</div> }
                { !!post.photoUrl &&
                    <div className="phone-sitch-photo">
                        <img src={ post.photoUrl } alt="" loading="lazy" />
                        { !!post.photoRoom && <div className="phone-sitch-photo-room">{ post.photoRoom }</div> }
                    </div> }
                <div className="phone-sitch-stats">
                    <div className="phone-sitch-stat"><PhoneIcon icon="comment" size={ 15 } />{ Count(post.replies) }</div>
                    <div className={ 'phone-sitch-stat' + (post.reposted ? ' is-on' : '') }><PhoneIcon icon="repeat" size={ 15 } />{ Count(post.reposts) }</div>
                    <div className={ 'phone-sitch-stat' + (post.liked ? ' is-on' : '') }><PhoneIcon icon="heart" size={ 15 } />{ Count(post.likes) }</div>
                </div>
            </div>
        </div>
    );

    if(thread)
    {
        const root = (thread.length ? thread[0] : null);

        return (
            <div className="phone-screen phone-app-screen phone-sitch">
                <div className="phone-app-scroll phone-sitch-body">
                    <div className="phone-app-header">
                        <div className="phone-app-header-lead">
                            <div className="phone-tap phone-thread-back phone-sitch-back" onClick={ () => setThread(null) }>
                                <PhoneIcon icon="chevron-left" size={ 22 } />
                            </div>
                            <div className="phone-sitch-head">
                                <div className="phone-app-kicker phone-sitch-kicker">{ root ? root.username.toUpperCase() : 'SITCH' }</div>
                                <div className="phone-app-title">Thread</div>
                            </div>
                        </div>
                    </div>
                    { thread.map((post, index) => postRow(post, index > 0)) }
                    <div className="phone-scroll-spacer" />
                </div>
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
                </div>
                { (tab === 'feed') &&
                    <div className="phone-sitch-switch">
                        <div className={ 'phone-sitch-pill' + (!following ? ' is-on' : '') } onClick={ () => setFollowing(false) }>For you</div>
                        <div className={ 'phone-sitch-pill' + (following ? ' is-on' : '') } onClick={ () => setFollowing(true) }>Following</div>
                    </div> }
                { (tab === 'feed') && (loaded && !posts.length ? emptyState(following ? 'following' : 'feed') : posts.map(post => postRow(post))) }
                { (tab === 'search') && emptyState('search') }
                { (tab === 'activity') && (loaded && !activity.length ? emptyState('activity') : activity.map(row => (
                    <div key={ row.id } className="phone-sitch-act">
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
                        { (loaded && !profilePosts.length) ? emptyState('profile') : profilePosts.map(post => postRow(post)) }
                    </> }
                <div className="phone-scroll-spacer" />
            </div>
            <div className="phone-sitch-tabs">
                { TABS.map(entry => (
                    <div key={ entry.key } title={ entry.label } className={ 'phone-sitch-tab' + ((tab === entry.key) ? ' is-on' : '') } onClick={ () => setTab(entry.key) }>
                        <PhoneIcon icon={ entry.icon } size={ 21 } />
                    </div>
                )) }
            </div>
        </div>
    );
}
