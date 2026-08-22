import { ILinkEventTracker, RpUiSettingsEvent } from '@nitrots/nitro-renderer';
import { RpSaveUiSettingsComposer } from '@nitrots/nitro-renderer';
import { FC, useEffect, useState } from 'react';
import { AddEventLinkTracker, RemoveLinkEventTracker, SendMessageComposer } from '../../api';
import { Column, NitroCardContentView, NitroCardHeaderView, NitroCardTabsItemView, NitroCardTabsView, NitroCardView, Text } from '../../common';
import { useMessageEvent } from '../../hooks';
import { ApplyUiChrome, CHROME_SCHEMES, DEFAULT_CHROME_COLOR, IsValidChromeColor } from './UiChrome';

// PixelRP settings window, opened from the side drawer's Settings button
// (CreateLinkEvent('rp-settings/toggle')). Tabs beyond Interface are
// placeholders to be filled out as settings are decided.
const TABS: string[] = [ 'General', 'Social', 'Roleplay', 'Interface', 'System' ];

export const RpSettingsView: FC<{}> = props =>
{
    const [ isVisible, setIsVisible ] = useState(false);
    const [ currentTab, setCurrentTab ] = useState<string>(TABS[0]);
    const [ chromeColor, setChromeColor ] = useState<string>(DEFAULT_CHROME_COLOR);

    // Persisted UI settings arrive from the server at login; apply and track.
    useMessageEvent<RpUiSettingsEvent>(RpUiSettingsEvent, event =>
    {
        const color = event.getParser().chromeColor;
        const applied = (IsValidChromeColor(color) ? color : DEFAULT_CHROME_COLOR);

        setChromeColor(applied);
        ApplyUiChrome(applied);
    });

    const selectChrome = (color: string) =>
    {
        setChromeColor(color);
        ApplyUiChrome(color);
        // '' resets the server row to default; send the actual color otherwise
        SendMessageComposer(new RpSaveUiSettingsComposer((color === DEFAULT_CHROME_COLOR) ? '' : color));
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
            eventUrlPrefix: 'rp-settings/'
        };

        AddEventLinkTracker(linkTracker);

        return () => RemoveLinkEventTracker(linkTracker);
    }, []);

    if(!isVisible) return null;

    return (
        <NitroCardView uniqueKey="rp-settings" className="rp-settings-window" theme="primary-slim">
            <NitroCardHeaderView headerText="Settings" onCloseClick={ () => setIsVisible(false) } />
            <NitroCardTabsView>
                { TABS.map(tab => (
                    <NitroCardTabsItemView key={ tab } isActive={ currentTab === tab } onClick={ () => setCurrentTab(tab) }>
                        { tab }
                    </NitroCardTabsItemView>
                )) }
            </NitroCardTabsView>
            <NitroCardContentView className="text-black">
                { (currentTab === 'Interface') &&
                    <Column gap={ 2 }>
                        <div className="rp-settings-section">
                            <div className="rp-settings-section-info">
                                <Text bold>UI Color</Text>
                                <Text small className="text-muted">Choose the color scheme of your interface: the HUDs, drawer, purse and toolbars.</Text>
                            </div>
                            <div className="rp-settings-swatches">
                                { CHROME_SCHEMES.map(scheme => (
                                    <div key={ scheme.key } title={ scheme.name }
                                        className={ `rp-settings-swatch ${ (chromeColor === scheme.color) ? 'is-selected' : '' }` }
                                        style={ { backgroundColor: scheme.color } }
                                        onClick={ () => selectChrome(scheme.color) } />
                                )) }
                            </div>
                        </div>
                    </Column> }
                { (currentTab !== 'Interface') &&
                    <Column center fullHeight gap={ 1 } className="rp-settings-placeholder">
                        <Text bold>{ currentTab }</Text>
                        <Text className="text-muted">Nothing here yet.</Text>
                    </Column> }
            </NitroCardContentView>
        </NitroCardView>
    );
}
