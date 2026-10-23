import { ConfigurationEvent, GetAssetManager, HabboWebTools, LegacyExternalInterface, Nitro, NitroCommunicationDemoEvent, NitroConfiguration, NitroEvent, NitroLocalizationEvent, NitroVersion, RoomEngineEvent } from '@nitrots/nitro-renderer';
import { skipHello } from '@pixi/utils';
import { FC, useCallback, useEffect, useRef, useState } from 'react';
import { GetCommunication, GetConfiguration, GetDeployStatus, GetNitroInstance, GetUIVersion } from './api';
import { InstallAssetPassRefresh } from './api/assets/AssetPassRefresh';
import { ExtendAvatarStructure } from './api/avatar/ExtendAvatarStructure';
import { InstallProximityTrace } from './api/diagnostics/ProximityTrace';
import { InstallJitterTrace } from './api/diagnostics/JitterTrace';
import { InstallFinalStepStance } from './api/nitro/room/FinalStepStance';
import { InstallTurnTrace } from './api/diagnostics/TurnTrace';
import { ApplyMaxFps } from './api/prefs/FpsStore';
import { RegisterRpCorpMessages } from './api/rp-corps/RpCorpDetailMessages';
import { RegisterRpChatMessages } from './api/rp-chat/RpChatMessages';
import { RegisterRpFurniMessages } from './api/rp-furni/RpFurniMessages';
import { RegisterRpPhoneStateMessages } from './api/rp-phone/RpPhoneStateMessages';
import { RegisterRpRegionMessages } from './api/rp-region/RpRegionMessages';
import { RegisterRpRoomRightsMessages } from './api/rp-rights/RpRoomRightsMessages';
import { RegisterRpCatalogSearchMessages } from './api/rp-catalog/RpCatalogSearchMessages';
import { RegisterRpTellerMessages } from './api/rp-teller/RpTellerMessages';
import { InstallBrowserGuard, StartDevToolsWatch } from './api/security/BrowserGuard';
import { RegisterRpBrowserGuardMessages } from './api/security/RpBrowserGuardMessages';
import { GetDisconnectReason, RegisterRpDisconnectReasonMessages } from './api/security/RpDisconnectReasonMessages';
import { RegisterRpBankMessages } from './api/rp-phone/RpBankMessages';
import { RegisterRpPayMessages } from './api/rp-phone/RpPayMessages';
import { RegisterRpOfferMessages } from './api/rp-offer/RpOfferMessages';
import { RegisterRpBinSearchMessages } from './api/rp-bin-search/RpBinSearchMessages';
import { RegisterRpMacroMessages } from './api/rp-macros/RpMacroMessages';
import { RegisterRpInventoryMessages } from './api/rp-inventory/RpInventoryMessages';
import { RegisterRpVapeRaise } from './api/rp-inventory/RpVapeRaise';
import { RegisterRpJailMessages } from './api/rp-police/RpJailMessages';
import { RegisterRpFloorOpacityMessages } from './api/rp-room/RpFloorOpacityMessages';
import { RegisterRpJuryMessages } from './api/rp-police/RpJuryMessages';
import { CHARACTER_RELOAD, RegisterRpCharacterMessages, SubscribeRpCharacterResult } from './api/rp-phone/RpCharacterMessages';
import { RegisterRpPrivacyMessages } from './api/rp-phone/RpPrivacyMessages';
import { RegisterRpWantedMessages } from './api/rp-wanted/RpWantedMessages';
import { RegisterRpStatsStore } from './api/rp-stats/RpStatsStore';
import { RegisterRpCityFurniPreload } from './api/rp-city/RpCityFurniPreload';
import { RegisterRpPhoneMessages } from './api/rp-phone/RpBirthdayMessages';
import { RegisterRpCalendarMessages } from './api/rp-phone/RpCalendarMessages';
import { RegisterRpNotesMessages } from './api/rp-phone/RpNotesMessages';
import { RegisterRpWeatherMessages } from './api/rp-phone/RpWeatherMessages';
import { RegisterRpGameClockMessages } from './api/environment/GameClock';
import { RegisterAccountPrefs } from './api/prefs/AccountPrefs';
import { RegisterRpNewsMessages } from './api/rp-phone/RpNewsMessages';
import { RegisterRpSupportMessages } from './api/rp-phone/RpSupportMessages';
import { RegisterRpSitchMessages } from './api/rp-phone/RpSitchMessages';
import { RegisterRpNotificationMessages } from './api/rp-phone/RpNotificationMessages';
import { RegisterRpStocksMessages } from './api/rp-phone/RpStocksMessages';
import { RegisterRpJamMessages } from './api/rp-phone/RpJamMessages';
import { RegisterRpTunesMessages } from './api/rp-phone/RpTunesMessages';
import { RegisterRpClothingMessages } from './api/rp-clothing/RpClothingMessages';
import { RegisterRpCityMessages } from './api/rp-city/RpCityMessages';
import { RegisterRpDepositBoxMessages } from './api/rp-bank/RpDepositBoxMessages';
import { RegisterRpEmergencyCallsMessages } from './api/rp-police/RpEmergencyCallsMessages';
import { RegisterRpMedicalCallsMessages } from './api/rp-hospital/RpMedicalCallsMessages';
import { RegisterRpTradeMessages } from './api/rp-trade/RpTradeMessages';
import { RegisterRpGymMessages } from './api/rp-gym/RpGymMessages';
import { RegisterRpGangMessages } from './api/rp-gangs/RpGangMessages';
import { RegisterRpNavigatorMessages } from './api/rp-navigator/RpNavigatorMessages';
import { RegisterRpTurfMessages } from './api/rp-turf/RpTurfMessages';
import { RegisterRpJukeboxOpenMessages } from './api/rp-jukebox/RpJukeboxOpenMessages';
import { Base, TitleBubbles, TransitionAnimation, TransitionAnimationTypes } from './common';
import { DeploymentView } from './components/deployment/DeploymentView';
import { LoadingView } from './components/loading/LoadingView';
import { MainView } from './components/main/MainView';
import { useConfigurationEvent, useLocalizationEvent, useMainEvent, useRoomEngineEvent } from './hooks';

NitroVersion.UI_VERSION = GetUIVersion();

// PixelRP: start the game over by reloading the PARENT page, not this frame:
// our own url carries the SSO ticket that was already spent at login, so
// reloading here would hand the emulator a dead ticket. /game re-runs and
// mints a fresh one.
const ReloadGamePage = (): void =>
{
    try
    {
        window.parent.location.reload();
    }
    catch (error)
    {
        // A client served from another origin cannot reach its parent;
        // reloading ourselves at least fails loudly rather than silently
        // doing nothing.
        window.location.reload();
    }
}

// PixelRP: the gamedata the engine asks for once logged in, asked for while
// the socket is still connecting - but only at a versioned address (?v=,
// written at deploy by docker/nitro/version-assets.py). A versioned file is
// kept by the browser (docker/web/nginx.conf), so the engine's own request
// finds it there; an unversioned one would just be fetched twice.
const PREFETCHED_GAMEDATA = [ 'furnidata.url', 'productdata.url', 'avatar.actions.url', 'avatar.figuredata.url', 'avatar.figuremap.url', 'avatar.effectmap.url' ];

const PrefetchGamedata = (): void =>
{
    for(const key of PREFETCHED_GAMEDATA)
    {
        const value = GetConfiguration<string>(key);

        if(!value) continue;

        const url = NitroConfiguration.interpolate(value);

        if(!/[?&]v=[^&]/.test(url)) continue;

        fetch(url).then(response => response.arrayBuffer()).catch(() => null);
    }
}

export const App: FC<{}> = props =>
{
    const [ isReady, setIsReady ] = useState(false);
    const [ isError, setIsError ] = useState(false);
    const [ message, setMessage ] = useState('Getting Ready');
    const [ percent, setPercent ] = useState(0);
    const [ imageRendering, setImageRendering ] = useState<boolean>(true);
    const [ isDeploying, setIsDeploying ] = useState(false);
    // `handler` is memoized on checkForDeployment alone, so it can never read
    // a fresh `isReady`. The ref is what lets the disconnect paths below tell
    // "we never got in" from "we were in and the line dropped".
    const isReadyRef = useRef(false);
    // pixelrp: what the engine waits for before it starts (ConfigurationEvent.LOADED).
    const bootTexts = useRef<Promise<void>>(null);
    const textsLoaded = useRef<() => void>(null);
    const bootPreload = useRef<Promise<boolean>>(null);

    if(!GetNitroInstance())
    {
        //@ts-ignore
        if(!NitroConfig) throw new Error('NitroConfig is not defined!');

        // Before bootstrap: the renderer reads its avatar tables once, at
        // init, and misc items and pets have to be in them by then.
        ExtendAvatarStructure();

        // Keeps the asset pass alive for as long as the client stays open.
        InstallAssetPassRefresh();

        // No browser right-click menu in-game; DevTools shortcuts send the
        // player back to the website.
        InstallBrowserGuard();

        // No version banners in players' consoles - Nitro's and PixiJS's.
        NitroVersion.sayHello = () => null;
        skipHello();

        Nitro.bootstrap();
    }

    // When the hotel goes down for a tracked deployment, the deployment
    // screen replaces the standard disconnect handling entirely.
    const checkForDeployment = useCallback(async (fallback: () => void) =>
    {
        let status = await GetDeployStatus();

        if(!status || ((status.status !== 'deploying') && (status.status !== 'done')))
        {
            // The status endpoint caches briefly server-side — a deploy that
            // just dropped us can lag by a few seconds, so look twice.
            await new Promise(resolve => setTimeout(resolve, 3000));

            status = await GetDeployStatus();
        }

        if(status && ((status.status === 'deploying') || (status.status === 'done')))
        {
            setIsDeploying(true);

            return;
        }

        fallback();
    }, []);

    const exitDeployment = useCallback(() =>
    {
        setIsDeploying(false);

        HabboWebTools.send(-1, 'client.init.handshake.fail');
    }, []);

    const handler = useCallback(async (event: NitroEvent) =>
    {
        switch(event.type)
        {
            case ConfigurationEvent.LOADED: {
                // pixelrp: everything login needs starts here, side by side -
                // the texts, the preload files, the gamedata the engine asks
                // for after login, and the socket. They used to go one after
                // another, the socket last, each wait a round trip; far from
                // the server that was seconds. The engine still starts only
                // once the texts and preload files are in (AUTHENTICATED), and
                // the socket holds every packet until the client is ready.
                bootTexts.current = new Promise(resolve => (textsLoaded.current = resolve));

                GetNitroInstance().localization.init();

                const assetUrls = GetConfiguration<string[]>('preload.assets.urls');
                const urls: string[] = [];

                if(assetUrls && assetUrls.length) for(const url of assetUrls) urls.push(NitroConfiguration.interpolate(url));

                bootPreload.current = GetAssetManager().downloadAssets(urls).then(status =>
                {
                    if(status)
                    {
                        setPercent(prevValue => (prevValue + 20));
                    }
                    else
                    {
                        setIsError(true);
                        setMessage('Assets Failed');
                    }

                    return status;
                });

                PrefetchGamedata();

                GetCommunication().init();

                setPercent(prevValue => (prevValue + 20));
                return;
            }
            case ConfigurationEvent.FAILED:
                setIsError(true);
                setMessage('Configuration Failed');
                return;
            case Nitro.WEBGL_UNAVAILABLE:
                setIsError(true);
                setMessage('WebGL Required');
                return;
            case Nitro.WEBGL_CONTEXT_LOST:
                setIsError(true);
                setMessage('WebGL Context Lost - Reloading');

                // PixelRP: the whole game page, not this frame - a graphics
                // reset (sleep and wake, a driver update) reloading the frame
                // logged in again with its already-spent SSO ticket, and was
                // turned away. The page brings a fresh one, and the server puts
                // the player back where they were.
                setTimeout(ReloadGamePage, 1500);
                return;
            case NitroCommunicationDemoEvent.CONNECTION_HANDSHAKING:
                setPercent(prevValue => (prevValue + 20));
                return;
            case NitroCommunicationDemoEvent.CONNECTION_HANDSHAKE_FAILED:
                checkForDeployment(() =>
                {
                    setIsError(true);
                    setMessage('Handshake Failed');
                });
                return;
            case NitroCommunicationDemoEvent.CONNECTION_AUTHENTICATED:
                setPercent(prevValue => (prevValue + 20));

                // PixelRP: client-source packets (gangs, the extended corp
                // roster) register against the live connection here, BEFORE
                // MainView's children mount their useMessageEvent hooks (child
                // effects run before the parent's, so registering in MainView
                // would be too late). registerMessages is additive - the stock
                // configuration stays intact.
                // Console handle only - nothing is registered on the ticker and
                // nothing is measured until pixelrpCrossingTrace() arms it.
                InstallProximityTrace();
                // Always on, unlike the proximity trace: it registers its own
                // ticker callback and records every turn, but prints flagged
                // ones only after pixelrpTurnLog() in DevTools.
                InstallTurnTrace();
                // Always on, counters only: how unevenly movement packets
                // arrive. Read as pixelrpJitter in DevTools.
                InstallJitterTrace();
                // The walking legs stop the moment the last step is drawn,
                // not when the stop status arrives (FinalStepStance).
                InstallFinalStepStance();
                RegisterRpGangMessages();
                RegisterRpTurfMessages();
                RegisterRpNavigatorMessages();
                RegisterRpJukeboxOpenMessages();
                RegisterRpCorpMessages();
                RegisterRpChatMessages();
                RegisterRpFurniMessages();
                RegisterRpPhoneMessages();
                RegisterRpPhoneStateMessages();
                RegisterRpRegionMessages();
                RegisterRpCharacterMessages();
                RegisterRpBankMessages();
                RegisterRpPayMessages();
                RegisterRpOfferMessages();
                RegisterRpBinSearchMessages();
                RegisterRpMacroMessages();
                RegisterRpInventoryMessages();
                RegisterRpVapeRaise();
                RegisterRpJailMessages();
                RegisterRpFloorOpacityMessages();
                RegisterRpJuryMessages();
                RegisterRpRoomRightsMessages();
                RegisterRpTellerMessages();
                RegisterRpCatalogSearchMessages();
                RegisterRpPrivacyMessages();
                RegisterRpWantedMessages();
                RegisterRpStatsStore();
                RegisterRpCityFurniPreload();
                RegisterRpCalendarMessages();
                RegisterRpNotesMessages();
                RegisterRpWeatherMessages();
                RegisterRpGameClockMessages();
                // settings kept on the account, like the macros
                RegisterAccountPrefs();
                RegisterRpNewsMessages();
                RegisterRpSupportMessages();
                RegisterRpSitchMessages();
                RegisterRpNotificationMessages();
                RegisterRpStocksMessages();
                RegisterRpTunesMessages();
                RegisterRpJamMessages();
                RegisterRpClothingMessages();
                RegisterRpCityMessages();
                RegisterRpDepositBoxMessages();
                RegisterRpEmergencyCallsMessages();
                RegisterRpMedicalCallsMessages();
                RegisterRpBrowserGuardMessages();
                RegisterRpDisconnectReasonMessages();
                RegisterRpTradeMessages();
                RegisterRpGymMessages();

                // pixelrp: the texts and preload files may still be on their
                // way - login no longer waits for them (ConfigurationEvent.LOADED).
                // A failed preload has already put up its error.
                if(!(await Promise.all([ bootTexts.current, bootPreload.current ]))[1]) return;

                GetNitroInstance().init();

                if(LegacyExternalInterface.available) LegacyExternalInterface.call('legacyTrack', 'authentication', 'authok', []);
                return;
            case NitroCommunicationDemoEvent.CONNECTION_ERROR:
                checkForDeployment(() =>
                {
                    setIsError(true);
                    setMessage('Connection Error');
                });
                return;
            case NitroCommunicationDemoEvent.CONNECTION_CLOSED:
                //if(GetNitroInstance().roomEngine) GetNitroInstance().roomEngine.dispose();
                checkForDeployment(() =>
                {
                    setMessage('Connection Error');

                    // The server closing the socket during login - a refused
                    // ticket, a hotel that will not have us - used to leave the
                    // bar sitting at 60% with no error, which reads as a hang
                    // and sends you looking for the wrong fault entirely. Say
                    // so instead. Only before we are in: once the hotel is up,
                    // a dropped line is handled by the client's own reconnect
                    // and must not be painted over with the loading screen.
                    if(!isReadyRef.current) setIsError(true);

                    // The website's /game page draws the disconnected screen
                    // over this frame. Before we were in, the close is a failed
                    // login; after, it is whatever the server said it was
                    // (RpDisconnectReasonMessages) or a line that just dropped.
                    HabboWebTools.send(-1, isReadyRef.current ? (GetDisconnectReason() ?? 'connection.lost') : 'client.init.handshake.fail');
                });
                return;
            case RoomEngineEvent.ENGINE_INITIALIZED:
                setPercent(prevValue => (prevValue + 20));
                isReadyRef.current = true;

                // Nitro sets maxFPS from system.fps.max during bootstrap, so
                // the player's own cap has to be re-applied after the ticker
                // exists or it would only take effect on the next change.
                ApplyMaxFps();

                // DevTools that are already open, checked from here on - by now
                // the rank that exempts staff has arrived.
                StartDevToolsWatch();

                // pixelrp: the full bar is painted once, then the hotel shows -
                // a fixed 300ms used to sit here on every login. A hidden tab
                // paints nothing, so it still gets in by the old 300ms.
                requestAnimationFrame(() => requestAnimationFrame(() => setIsReady(true)));
                setTimeout(() => setIsReady(true), 300);
                return;
            case NitroLocalizationEvent.LOADED:
                if(textsLoaded.current) textsLoaded.current();
                return;
        }
    }, [ checkForDeployment ]);

    useMainEvent(Nitro.WEBGL_UNAVAILABLE, handler);
    useMainEvent(Nitro.WEBGL_CONTEXT_LOST, handler);
    useMainEvent(NitroCommunicationDemoEvent.CONNECTION_HANDSHAKING, handler);
    useMainEvent(NitroCommunicationDemoEvent.CONNECTION_HANDSHAKE_FAILED, handler);
    useMainEvent(NitroCommunicationDemoEvent.CONNECTION_AUTHENTICATED, handler);
    useMainEvent(NitroCommunicationDemoEvent.CONNECTION_ERROR, handler);
    useMainEvent(NitroCommunicationDemoEvent.CONNECTION_CLOSED, handler);
    useRoomEngineEvent(RoomEngineEvent.ENGINE_INITIALIZED, handler);
    useLocalizationEvent(NitroLocalizationEvent.LOADED, handler);
    useConfigurationEvent(ConfigurationEvent.LOADED, handler);
    useConfigurationEvent(ConfigurationEvent.FAILED, handler);

    // PixelRP: switching character is a RECONNECT. The session is bound to
    // its character at authentication and cannot be rebound, so the server
    // points the account at the new one and asks the client to leave. The
    // game page reloads (ReloadGamePage) and logs in whoever the account now
    // points at.
    useEffect(() => SubscribeRpCharacterResult(outcome =>
    {
        if(outcome !== CHARACTER_RELOAD) return;

        ReloadGamePage();
    }), []);

    useEffect(() =>
    {
        GetNitroInstance().core.configuration.init();

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if((import.meta as any).env?.DEV && new URLSearchParams(window.location.search).has('deploy-preview')) setIsDeploying(true);

        const resize = (event: UIEvent) => setImageRendering(!(window.devicePixelRatio % 1));

        window.addEventListener('resize', resize);

        resize(null);

        return () =>
        {
            window.removeEventListener('resize', resize);
        }
    }, []);
    
    return (
        <Base fit overflow="hidden" className={ imageRendering && 'image-rendering-pixelated' }>
            { (!isReady || isError) &&
                <LoadingView isError={ isError } message={ message } percent={ percent } /> }
            <TransitionAnimation type={ TransitionAnimationTypes.FADE_IN } inProp={ (isReady) }>
                <MainView />
            </TransitionAnimation>
            { isDeploying &&
                <DeploymentView onFallback={ exitDeployment } /> }
            <Base id="draggable-windows-container" />
            <TitleBubbles />
        </Base>
    );
}
