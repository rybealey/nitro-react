import { ConfigurationEvent, GetAssetManager, HabboWebTools, LegacyExternalInterface, Nitro, NitroCommunicationDemoEvent, NitroConfiguration, NitroEvent, NitroLocalizationEvent, NitroVersion, RoomEngineEvent } from '@nitrots/nitro-renderer';
import { FC, useCallback, useEffect, useState } from 'react';
import { GetCommunication, GetConfiguration, GetDeployStatus, GetNitroInstance, GetUIVersion } from './api';
import { RegisterRpCorpMessages } from './api/rp-corps/RpCorpDetailMessages';
import { RegisterRpChatMessages } from './api/rp-chat/RpChatMessages';
import { RegisterRpPhoneMessages } from './api/rp-phone/RpBirthdayMessages';
import { RegisterRpCalendarMessages } from './api/rp-phone/RpCalendarMessages';
import { RegisterRpGangMessages } from './api/rp-gangs/RpGangMessages';
import { Base, TransitionAnimation, TransitionAnimationTypes } from './common';
import { DeploymentView } from './components/deployment/DeploymentView';
import { LoadingView } from './components/loading/LoadingView';
import { MainView } from './components/main/MainView';
import { useConfigurationEvent, useLocalizationEvent, useMainEvent, useRoomEngineEvent } from './hooks';

NitroVersion.UI_VERSION = GetUIVersion();

export const App: FC<{}> = props =>
{
    const [ isReady, setIsReady ] = useState(false);
    const [ isError, setIsError ] = useState(false);
    const [ message, setMessage ] = useState('Getting Ready');
    const [ percent, setPercent ] = useState(0);
    const [ imageRendering, setImageRendering ] = useState<boolean>(true);
    const [ isDeploying, setIsDeploying ] = useState(false);

    if(!GetNitroInstance())
    {
        //@ts-ignore
        if(!NitroConfig) throw new Error('NitroConfig is not defined!');

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
            case ConfigurationEvent.LOADED:
                GetNitroInstance().localization.init();
                setPercent(prevValue => (prevValue + 20));
                return;
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

                setTimeout(() => window.location.reload(), 1500);
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
                RegisterRpGangMessages();
                RegisterRpCorpMessages();
                RegisterRpChatMessages();
                RegisterRpPhoneMessages();
                RegisterRpCalendarMessages();

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
                //setIsError(true);
                checkForDeployment(() =>
                {
                    setMessage('Connection Error');

                    HabboWebTools.send(-1, 'client.init.handshake.fail');
                });
                return;
            case RoomEngineEvent.ENGINE_INITIALIZED:
                setPercent(prevValue => (prevValue + 20));

                setTimeout(() => setIsReady(true), 300);
                return;
            case NitroLocalizationEvent.LOADED: {
                const assetUrls = GetConfiguration<string[]>('preload.assets.urls');
                const urls: string[] = [];

                if(assetUrls && assetUrls.length) for(const url of assetUrls) urls.push(NitroConfiguration.interpolate(url));

                const status = await GetAssetManager().downloadAssets(urls);
                
                if(status)
                {
                    GetCommunication().init();

                    setPercent(prevValue => (prevValue + 20))
                }
                else
                {
                    setIsError(true);
                    setMessage('Assets Failed');
                }
                return;
            }
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
        </Base>
    );
}
