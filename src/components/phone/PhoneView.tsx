import { ILinkEventTracker } from '@nitrots/nitro-renderer';
import { toPng } from 'html-to-image';
import { FC, useEffect, useMemo, useRef, useState } from 'react';
import { AddEventLinkTracker, GetLocalStorage, PlaySound, RemoveLinkEventTracker, SetLocalStorage, SoundNames, WindowSaveOptions } from '../../api';
import { DraggableWindow, DraggableWindowPosition } from '../../common';
import { useFriends, useMessenger } from '../../hooks';
import { PhoneAppearanceView } from './PhoneAppearanceView';
import { PhoneCallView } from './PhoneCallView';
import { PhoneCameraView } from './PhoneCameraView';
import { PhoneContactsView } from './PhoneContactsView';
import { PhoneHomeView } from './PhoneHomeView';
import { PhoneComposeView, PhoneMessagesView } from './PhoneMessagesView';
import { PhoneIcon } from './PhoneIcon';
import { PhonePhotosView } from './PhonePhotosView';
import { PhoneSettingsView } from './PhoneSettingsView';
import { PhoneThreadView } from './PhoneThreadView';
import { ReadPhonePosition, useAirplane, usePhonePhotos, usePhonePrefs, usePhoneTheme } from './usePhone';

// The PixelRP phone — the player's window to their social life, replacing
// the classic Habbo friends list + messenger windows. Opened from the
// toolbar (phone/toggle); the old 'friends/...' and 'friends-messenger/...'
// link events still work and route into the matching phone app.

type PhoneScreen = 'home' | 'messages' | 'thread' | 'compose' | 'contacts' | 'camera' | 'photos' | 'settings' | 'appearance';

// Which app each home-screen tile opens.
const APP_SCREENS: Record<string, PhoneScreen> = {
    'Messages': 'messages',
    'Contacts': 'contacts',
    'Camera': 'camera',
    'Photos': 'photos',
    'Settings': 'settings'
};

const animationFor = (from: PhoneScreen, to: PhoneScreen): string =>
{
    if(to === 'home') return 'home-in';
    if((from === 'home') && ((to === 'messages') || (to === 'contacts') || (to === 'camera') || (to === 'photos') || (to === 'settings'))) return 'app-open';
    if(to === 'thread') return 'slide-right';
    if((from === 'thread') && (to === 'messages')) return 'slide-left';
    if(to === 'appearance') return 'slide-right';
    if((from === 'appearance') && (to === 'settings')) return 'slide-left';
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
    const [ shotFlash, setShotFlash ] = useState(false);
    const [ shotToast, setShotToast ] = useState<string>(null);
    const { visibleThreads = [], getMessageThread = null, setActiveThreadId = null } = useMessenger();
    const { requestFriend = null, getFriend = null } = useFriends();
    const { ensureLoaded } = usePhonePrefs();
    const { resolvedDark = false } = usePhoneTheme();
    const { enabled: airplaneOn = false } = useAirplane();
    const { saveScreenshot = null } = usePhonePhotos();
    const displayRef = useRef<HTMLDivElement>(null);
    const powerTimer = useRef<number>(0);
    const powerLongFired = useRef(false);

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

    // Place the phone at the player's chosen side the next time it mounts.
    // DraggableWindow centers the phone (windowPosition=CENTER) then applies
    // its saved drag offset as a transform; writing that offset here slides
    // the phone to the left/center/right edge on open. Vertical stays centered.
    const applyOpenPosition = () =>
    {
        const width = (336 * 0.8); // .pixelrp-phone wrapper width (see PhoneView.scss $phone-scale)
        const margin = 20;
        const viewport = (window.innerWidth || document.body.offsetWidth || width);
        const centeredLeft = ((viewport - width) / 2);

        const position = ReadPhonePosition();

        let targetLeft = centeredLeft;

        if(position === 'left') targetLeft = margin;
        else if(position === 'right') targetLeft = (viewport - width - margin);

        const storage = { ...(GetLocalStorage<WindowSaveOptions>('nitro.windows.pixelrp-phone') || {}) } as WindowSaveOptions;

        storage.offset = { x: (targetLeft - centeredLeft), y: 0 };

        SetLocalStorage<WindowSaveOptions>('nitro.windows.pixelrp-phone', storage);
    }

    const show = (to: PhoneScreen = null) =>
    {
        if(!isVisible) applyOpenPosition();

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

        if(!isVisible) applyOpenPosition();

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

    // Side button: click puts the phone away; hold takes a screenshot of
    // whatever's on the screen and files it into Photos.
    const takeScreenshot = () =>
    {
        if(!displayRef.current || !saveScreenshot) return;

        const excluded = [ 'phone-shot-flash', 'phone-shot-toast' ];

        // html-to-image clones the DOM, and clones reset every scroll
        // position to the top. Convert each scrolled container into the
        // visually identical translated form (children shifted up, scroll
        // zeroed) for the capture, then put everything back. Both halves of
        // the swap happen in the same synchronous block, so nothing ever
        // paints differently on screen.
        const restores: (() => void)[] = [];

        displayRef.current.querySelectorAll('*').forEach(element =>
        {
            const container = element as HTMLElement;

            if((container.scrollTop <= 0) && (container.scrollLeft <= 0)) return;

            const scrollTop = container.scrollTop;
            const scrollLeft = container.scrollLeft;
            const children = Array.from(container.children) as HTMLElement[];
            const previousTransforms = children.map(child => child.style.transform);

            children.forEach(child => (child.style.transform = `translate(${ -scrollLeft }px, ${ -scrollTop }px)`));
            container.scrollTop = 0;
            container.scrollLeft = 0;

            restores.push(() =>
            {
                children.forEach((child, index) => (child.style.transform = previousTransforms[index]));
                container.scrollTop = scrollTop;
                container.scrollLeft = scrollLeft;
            });
        });

        const restoreScrolls = () => restores.reverse().forEach(restore => restore());

        toPng(displayRef.current, { pixelRatio: 1, backgroundColor: '#000000', filter: node => !(node.classList && excluded.some(name => node.classList.contains(name))) })
            .then(dataUrl =>
            {
                restoreScrolls();
                PlaySound(SoundNames.CAMERA_SHUTTER);
                setShotFlash(true);
                window.setTimeout(() => setShotFlash(false), 220);
                saveScreenshot(dataUrl);
                setShotToast('Saved to Photos');
                window.setTimeout(() => setShotToast(null), 1800);
            })
            .catch(() =>
            {
                restoreScrolls();
                setShotToast('Screenshot failed');
                window.setTimeout(() => setShotToast(null), 1800);
            });
    }

    const onPowerDown = () =>
    {
        powerLongFired.current = false;

        window.clearTimeout(powerTimer.current);

        powerTimer.current = window.setTimeout(() =>
        {
            powerLongFired.current = true;

            takeScreenshot();
        }, 550);
    }

    const onPowerUp = () =>
    {
        window.clearTimeout(powerTimer.current);

        if(!powerLongFired.current) hide();

        powerLongFired.current = false;
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
                    case 'settings':
                        show('settings');
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
        <DraggableWindow uniqueKey="pixelrp-phone" handleSelector=".phone-drag-handle" windowPosition={ DraggableWindowPosition.CENTER } minVisible={ 48 }>
            <div className="pixelrp-phone">
                <div className={ `phone-shell${ (screen === 'camera') ? ' is-camera' : '' }` }>
                    <div ref={ displayRef } className={ `phone-display${ (screen === 'camera') ? ' is-camera' : '' }${ resolvedDark ? ' is-dark' : '' }` }>
                        <div className={ `phone-status-bar${ onLightScreen ? ' on-light' : '' }` }>
                            <div className="phone-status-time">{ clock }</div>
                            <div className="phone-status-right">
                                <span>PXL</span>
                                { /* Airplane mode replaces the signal bars, like a real phone. */ }
                                <PhoneIcon icon={ airplaneOn ? 'plane-up' : 'cellular-signal-3' } size={ 15 } />
                                <PhoneIcon icon="battery-full" size={ 18 } />
                            </div>
                        </div>
                        <div className="phone-notch" />
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
                            { (screen === 'settings') &&
                                <PhoneSettingsView onBack={ () => go('home') } openAppearance={ () => go('appearance') } /> }
                            { (screen === 'appearance') &&
                                <PhoneAppearanceView onBack={ () => go('settings') } /> }
                        </div>
                        { callFriend &&
                            <PhoneCallView friend={ callFriend } onEnd={ () => setCallFriendId(0) } /> }
                        <div className={ `phone-home-indicator${ onLightScreen ? ' on-light' : '' }` } title={ (screen === 'home') ? 'Put phone away' : 'Home' } onClick={ onHomeBar } />
                        { shotFlash &&
                            <div className="phone-shot-flash" /> }
                        { shotToast &&
                            <div className="phone-camera-toast phone-shot-toast">
                                <PhoneIcon icon="check" size={ 14 } />
                                <span>{ shotToast }</span>
                            </div> }
                        <div className="phone-glare" />
                    </div>
                    { /* The drag handle: DraggableWindow binds mousedown to this one
                         wrapper; only its children take pointer events, so the grab
                         zones are the orange bezel edges plus the dynamic island —
                         screen content underneath stays fully interactive. */ }
                    <div className="phone-drag-handle">
                        <div className="phone-drag-edge is-top" title="Drag to move the phone" />
                        <div className="phone-drag-edge is-bottom" title="Drag to move the phone" />
                        <div className="phone-drag-edge is-left" title="Drag to move the phone" />
                        <div className="phone-drag-edge is-right" title="Drag to move the phone" />
                        <div className="phone-drag-island" title="Hold to move the phone" />
                    </div>
                    <div className="phone-power-btn" title="Put phone away · hold for screenshot" onPointerDown={ onPowerDown } onPointerUp={ onPowerUp } onPointerLeave={ () => window.clearTimeout(powerTimer.current) } />
                </div>
            </div>
        </DraggableWindow>
    );
}
