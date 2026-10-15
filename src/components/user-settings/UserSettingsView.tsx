import { ILinkEventTracker } from '@nitrots/nitro-renderer';
import { FC, useEffect, useState } from 'react';
import { FaVolumeDown, FaVolumeMute, FaVolumeUp } from 'react-icons/fa';
import { AddEventLinkTracker, LocalizeText, RemoveLinkEventTracker } from '../../api';
import { classNames, Column, Flex, NitroCardContentView, NitroCardHeaderView, NitroCardView, Text } from '../../common';
import { useUserSettings } from '../../hooks';

// The top-right cog's window. The settings themselves live in useUserSettings,
// shared with Settings > General (Sound, Preferences), so both show the same.
export const UserSettingsView: FC<{}> = props =>
{
    const [ isVisible, setIsVisible ] = useState(false);
    const { userSettings, setCameraFollow, setVolume, saveVolumes } = useUserSettings();

    const processAction = (type: string, value?: boolean | number | string) =>
    {
        switch(type)
        {
            case 'close_view':
                setIsVisible(false);
                return;
            case 'camera_follow':
                setCameraFollow(value as boolean);
                return;
            case 'system_volume':
                setVolume('system', Number(value));
                return;
            case 'furni_volume':
                setVolume('furni', Number(value));
                return;
        }
    }

    const saveRangeSlider = (type: string) =>
    {
        if(type === 'volume') saveVolumes();
    }

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
                        setIsVisible(true);
                        return;
                    case 'hide':
                        setIsVisible(false);
                        return;
                    case 'toggle':
                        setIsVisible(prevValue => !prevValue);
                        return;
                }
            },
            eventUrlPrefix: 'user-settings/'
        };

        AddEventLinkTracker(linkTracker);

        return () => RemoveLinkEventTracker(linkTracker);
    }, []);

    if(!isVisible || !userSettings) return null;

    return (
        <NitroCardView uniqueKey="user-settings" className="user-settings-window" theme="primary-slim">
            <NitroCardHeaderView headerText={ LocalizeText('widget.memenu.settings.title') } onCloseClick={ event => processAction('close_view') } />
            <NitroCardContentView className="text-black">
                <Column gap={ 1 }>
                    { /* pixelrp: no "Prefer old chat" or "Ignore room invites" - see RpSettingsView. */ }
                    <Flex alignItems="center" gap={ 1 }>
                        <input className="form-check-input" type="checkbox" checked={ userSettings.cameraFollow } onChange={ event => processAction('camera_follow', event.target.checked) } />
                        <Text>{ LocalizeText('memenu.settings.other.disable.room.camera.follow') }</Text>
                    </Flex>
                    { /* pixelrp: no shop switches - dragging furni from the shop always
                       buys it and keeps the next one on the cursor (useCatalog). */ }
                </Column>
                <Column>
                    <Text bold>{ LocalizeText('widget.memenu.settings.volume') }</Text>
                    <Column gap={ 1 }>
                        <Text>{ LocalizeText('widget.memenu.settings.volume.ui') }</Text>
                        <Flex alignItems="center" gap={ 1 }>
                            { (userSettings.volumeSystem === 0) && <FaVolumeMute className={ classNames((userSettings.volumeSystem >= 50) && 'text-muted', 'fa-icon') } /> }
                            { (userSettings.volumeSystem > 0) && <FaVolumeDown className={ classNames((userSettings.volumeSystem >= 50) && 'text-muted', 'fa-icon') } /> }
                            <input type="range" className="custom-range w-100" min="0" max="100" step="1" id="volumeSystem" value={ userSettings.volumeSystem } onChange={ event => processAction('system_volume', event.target.value) } onMouseUp={ () => saveRangeSlider('volume') }/>
                            <FaVolumeUp className={ classNames((userSettings.volumeSystem < 50) && 'text-muted', 'fa-icon') } />
                        </Flex>
                    </Column>
                    <Column gap={ 1 }>
                        <Text>{ LocalizeText('widget.memenu.settings.volume.furni') }</Text>
                        <Flex alignItems="center" gap={ 1 }>
                            { (userSettings.volumeFurni === 0) && <FaVolumeMute className={ classNames((userSettings.volumeFurni >= 50) && 'text-muted', 'fa-icon') } /> }
                            { (userSettings.volumeFurni > 0) && <FaVolumeDown className={ classNames((userSettings.volumeFurni >= 50) && 'text-muted', 'fa-icon') } /> }
                            <input type="range" className="custom-range w-100" min="0" max="100" step="1" id="volumeFurni" value={ userSettings.volumeFurni } onChange={ event => processAction('furni_volume', event.target.value) } onMouseUp={ () => saveRangeSlider('volume') }/>
                            <FaVolumeUp className={ classNames((userSettings.volumeFurni < 50) && 'text-muted', 'fa-icon') } />
                        </Flex>
                    </Column>
                    { /* pixelrp: no Trax slider - PixelRP has no Trax songs. */ }
                </Column>
            </NitroCardContentView>
        </NitroCardView>
    );
}
