import { ILinkEventTracker } from '@nitrots/nitro-renderer';
import { FC, useEffect, useMemo, useState } from 'react';
import { AddEventLinkTracker, RemoveLinkEventTracker } from '../../api';
import { DraggableWindow, DraggableWindowPosition } from '../../common';
import { useFriends, useMessenger } from '../../hooks';
import { PhoneCallView } from './PhoneCallView';
import { PhoneCameraView } from './PhoneCameraView';
import { PhoneContactsView } from './PhoneContactsView';
import { PhoneHomeView } from './PhoneHomeView';
import { PhoneComposeView, PhoneMessagesView } from './PhoneMessagesView';
import { PhoneIcon } from './PhoneIcon';
import { PhonePhotosView } from './PhonePhotosView';
import { PhoneThreadView } from './PhoneThreadView';
import { usePhonePrefs } from './usePhone';

// The PixelRP phone — the player's window to their social life, replacing
// the classic Habbo friends list + messenger windows. Opened from the
// toolbar (phone/toggle); the old 'friends/...' and 'friends-messenger/...'
// link events still work and route into the matching phone app.

type PhoneScreen = 'home' | 'messages' | 'thread' | 'compose' | 'contacts' | 'camera' | 'photos';

// Which app each home-screen tile opens.
const APP_SCREENS: Record<string, PhoneScreen> = {
    'Messages': 'messages',
    'Contacts': 'contacts',
    'Camera': 'camera',
    'Photos': 'photos'
};

const animationFor = (from: PhoneScreen, to: PhoneScreen): string =>
{
    if(to === 'home') return 'home-in';
    if((from === 'home') && ((to === 'messages') || (to === 'contacts') || (to === 'camera') || (to === 'photos'))) return 'app-open';
    if(to === 'thread') return 'slide-right';
    if((from === 'thread') && (to === 'messages')) return 'slide-left';
    if(to === 'compose') return 'sheet-up';
    if(from === 'compose') return 'slide-left';

    return 'fade';
}

export const PhoneView: FC<{}> = props =>
{
    const [ isVisible, setIsVisible ] = useState(false);
    const [ screen, setScreen ] = useState<PhoneScreen>('home');
    const [ animation, setAnimation ] = useState<string>('home-in');
    const [ threadId, setThreadId ] = useState<number>(0);
    const [ callFriendId, setCallFriendId ] = useState<number>(0);
    const [ clock, setClock ] = useState<string>('');
    const { visibleThreads = [], getMessageThread = null, setActiveThreadId = null } = useMessenger();
    const { requestFriend = null, getFriend = null } = useFriends();
    const { ensureLoaded } = usePhonePrefs();

    const activeThread = useMemo(() => visibleThreads.find(thread => (thread.threadId === threadId)), [ visibleThreads, threadId ]);
    const callFriend = ((callFriendId && getFriend) ? getFriend(callFriendId) : null);

    const go = (to: PhoneScreen) =>
    {
        setScreen(prevValue =>
        {
            setAnimation(animationFor(prevValue, to));

            return to;
        });

        if((to !== 'thread') && setActiveThreadId) setActiveThreadId(-1);
    }

    const show = (to: PhoneScreen = null) =>
    {
        setIsVisible(true);

        if(to) go(to);
    }

    const hide = () =>
    {
        setIsVisible(false);
        setCallFriendId(0);

        if(setActiveThreadId) setActiveThreadId(-1);
    }

    const openThreadForUser = (userId: number) =>
    {
        if(!getMessageThread) return;

        const thread = getMessageThread(userId);

        if(!thread) return;

        setThreadId(thread.threadId);

        if(setActiveThreadId) setActiveThreadId(thread.threadId);

        setIsVisible(true);
        setScreen(prevValue =>
        {
            setAnimation(animationFor(prevValue, 'thread'));

            return 'thread';
        });
    }

    const openThread = (thread: { threadId: number }) =>
    {
        setThreadId(thread.threadId);

        if(setActiveThreadId) setActiveThreadId(thread.threadId);

        setScreen(prevValue =>
        {
            setAnimation(animationFor(prevValue, 'thread'));

            return 'thread';
        });
    }

    const onHomeBar = () =>
    {
        if(screen === 'home') hide();
        else go('home');
    }

    useEffect(() =>
    {
        if(!isVisible) return;

        ensureLoaded();

        const updateClock = () =>
        {
            const now = new Date();

            setClock(`${ now.getHours().toString().padStart(2, '0') }:${ now.getMinutes().toString().padStart(2, '0') }`);
        }

        updateClock();

        const interval = window.setInterval(updateClock, 15000);

        return () => window.clearInterval(interval);
    }, [ isVisible, ensureLoaded ]);

    useEffect(() =>
    {
        const linkTracker: ILinkEventTracker = {
            linkReceived: (url: string) =>
            {
                const parts = url.split('/');

                if(parts.length < 2) return;

                switch(parts[1])
                {
                    case 'show':
                        show();
                        return;
                    case 'hide':
                        hide();
                        return;
                    case 'toggle':
                        if(isVisible) hide();
                        else show();
                        return;
                    case 'messages':
                        show('messages');
                        return;
                    case 'contacts':
                        show('contacts');
                        return;
                    case 'camera':
                        show('camera');
                        return;
                    case 'photos':
                        show('photos');
                        return;
                }
            },
            eventUrlPrefix: 'phone/'
        };

        // Classic friends-list links route into the Contacts app.
        const friendsTracker: ILinkEventTracker = {
            linkReceived: (url: string) =>
            {
                const parts = url.split('/');

                if(parts.length < 2) return;

                switch(parts[1])
                {
                    case 'show':
                    case 'toggle':
                        show('contacts');
                        return;
                    case 'hide':
                        hide();
                        return;
                    case 'request':
                        if((parts.length >= 4) && requestFriend) requestFriend(parseInt(parts[2]), parts[3]);
                        return;
                }
            },
            eventUrlPrefix: 'friends/'
        };

        // Classic messenger links route into the Messages app.
        const messengerTracker: ILinkEventTracker = {
            linkReceived: (url: string) =>
            {
                const parts = url.split('/');

                if(parts.length < 2) return;

                if(parts[1] === 'open' || parts[1] === 'toggle')
                {
                    show('messages');

                    return;
                }

                const friendId = parseInt(parts[1]);

                if(!isNaN(friendId) && (friendId > 0)) openThreadForUser(friendId);
            },
            eventUrlPrefix: 'friends-messenger/'
        };

        AddEventLinkTracker(linkTracker);
        AddEventLinkTracker(friendsTracker);
        AddEventLinkTracker(messengerTracker);

        return () =>
        {
            RemoveLinkEventTracker(linkTracker);
            RemoveLinkEventTracker(friendsTracker);
            RemoveLinkEventTracker(messengerTracker);
        }
    });

    if(!isVisible) return null;

    const onLightScreen = ((screen !== 'home') && (screen !== 'camera'));

    return (
        <DraggableWindow uniqueKey="pixelrp-phone" handleSelector=".phone-drag-region" windowPosition={ DraggableWindowPosition.CENTER }>
            <div className="pixelrp-phone">
                <div className={ `phone-shell${ (screen === 'camera') ? ' is-camera' : '' }` }>
                    <div className={ `phone-display${ (screen === 'camera') ? ' is-camera' : '' }` }>
                        <div className={ `phone-status-bar${ onLightScreen ? ' on-light' : '' }` }>
                            <div className="phone-status-time">{ clock }</div>
                            <div className="phone-status-right">
                                <span>PXL</span>
                                <PhoneIcon icon="cellular-signal-3" size={ 15 } />
                                <PhoneIcon icon="battery-full" size={ 18 } />
                            </div>
                        </div>
                        <div className="phone-notch phone-drag-region" title="Hold to move the phone" />
                        <div key={ `${ screen }-${ animation }` } className={ `phone-screen-anim phone-anim-${ animation }` }>
                            { (screen === 'home') &&
                                <PhoneHomeView openApp={ app => (APP_SCREENS[app] && go(APP_SCREENS[app])) } /> }
                            { (screen === 'messages') &&
                                <PhoneMessagesView openThread={ openThread } openThreadForUser={ openThreadForUser } openCompose={ () => go('compose') } /> }
                            { (screen === 'thread') &&
                                <PhoneThreadView thread={ activeThread } onBack={ () => go('messages') } onDeleted={ () => go('messages') } /> }
                            { (screen === 'compose') &&
                                <PhoneComposeView openThreadForUser={ openThreadForUser } onCancel={ () => go('messages') } /> }
                            { (screen === 'contacts') &&
                                <PhoneContactsView openThreadForUser={ openThreadForUser } startCall={ userId => setCallFriendId(userId) } onBack={ () => go('home') } /> }
                            { (screen === 'camera') &&
                                <PhoneCameraView openPhotos={ () => go('photos') } onExit={ () => go('home') } /> }
                            { (screen === 'photos') &&
                                <PhonePhotosView openCamera={ () => go('camera') } onBack={ () => go('home') } /> }
                        </div>
                        { callFriend &&
                            <PhoneCallView friend={ callFriend } onEnd={ () => setCallFriendId(0) } /> }
                        <div className={ `phone-home-indicator${ onLightScreen ? ' on-light' : '' }` } title={ (screen === 'home') ? 'Put phone away' : 'Home' } onClick={ onHomeBar } />
                        <div className="phone-glare" />
                    </div>
                    <div className="phone-power-btn" title="Put phone away" onClick={ hide } />
                </div>
            </div>
        </DraggableWindow>
    );
}
