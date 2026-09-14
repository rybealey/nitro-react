import { FC, useState } from 'react';
import { PhoneIcon } from './PhoneIcon';

// Sitch: the city's own feed. Short posts, the replies they start, and a
// profile you can put something of yourself on.
//
// SHELL ONLY, for now. The app installs, opens, themes and navigates; every
// screen shows an honest empty state because there is no server behind it
// yet. Nothing here pretends to work - there is deliberately no composer and
// no post button until the write path lands, because a Post button that
// silently does nothing is worse than no Post button.
//
// Navigation is LOCAL, like News (PhoneNewsView's own `Screen` type) rather
// than new entries in PhoneView's PhoneScreen union: Sitch is one app with
// several screens, not several apps.

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

// One per tab. An empty state earns its place by saying what will fill it,
// not by apologising.
const EMPTY: Record<Tab, { icon: string, title: string, sub: string }> = {
    feed: {
        icon: 'at',
        title: 'Nothing yet',
        sub: 'When people start posting, the city turns up here.'
    },
    search: {
        icon: 'magnifying-glass',
        title: 'Find someone',
        sub: 'Search for a name once there are people to find.'
    },
    activity: {
        icon: 'heart',
        title: 'Quiet so far',
        sub: 'Replies, likes and new followers land here.'
    },
    profile: {
        icon: 'user',
        title: 'Your profile',
        sub: 'Your posts, and the one song you want people to hear.'
    }
};

export const PhoneSitchView: FC<PhoneSitchViewProps> = props =>
{
    const { onBack = null } = props;
    const [ tab, setTab ] = useState<Tab>('feed');
    const [ feed, setFeed ] = useState<'foryou' | 'following'>('foryou');

    const empty = EMPTY[tab];

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
                        <div className={ 'phone-sitch-pill' + ((feed === 'foryou') ? ' is-on' : '') }
                            onClick={ () => setFeed('foryou') }>For you</div>
                        <div className={ 'phone-sitch-pill' + ((feed === 'following') ? ' is-on' : '') }
                            onClick={ () => setFeed('following') }>Following</div>
                    </div> }
                <div className="phone-sitch-empty">
                    <div className="phone-sitch-empty-icon">
                        <PhoneIcon icon={ empty.icon } size={ 24 } />
                    </div>
                    <div className="phone-sitch-empty-title">{ empty.title }</div>
                    <div className="phone-sitch-empty-sub">{ empty.sub }</div>
                </div>
                <div className="phone-scroll-spacer" />
            </div>
            <div className="phone-sitch-tabs">
                { TABS.map(entry => (
                    <div key={ entry.key } title={ entry.label }
                        className={ 'phone-sitch-tab' + ((tab === entry.key) ? ' is-on' : '') }
                        onClick={ () => setTab(entry.key) }>
                        <PhoneIcon icon={ entry.icon } size={ 21 } />
                    </div>
                )) }
            </div>
        </div>
    );
}
