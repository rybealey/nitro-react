import { ILinkEventTracker, RpUiSettingsEvent } from '@nitrots/nitro-renderer';
import { RpSaveUiSettingsComposer } from '@nitrots/nitro-renderer';
import { FC, useEffect, useState } from 'react';
import { AddEventLinkTracker, RemoveLinkEventTracker, SendMessageComposer } from '../../api';
import { Column, NitroCardContentView, NitroCardHeaderView, NitroCardTabsItemView, NitroCardTabsView, NitroCardView, Text } from '../../common';
import { useMessageEvent } from '../../hooks';
import { ApplyUiChrome, CHROME_OPACITY_STEPS, CHROME_SCHEMES, DEFAULT_CHROME_COLOR, DEFAULT_CHROME_OPACITY, DEFAULT_HEADER_KEY, HEADER_SCHEMES, IsValidChromeColor, IsValidHeaderKey } from './UiChrome';

// PixelRP settings window, opened from the side drawer's Settings button
// (CreateLinkEvent('rp-settings/toggle')). Tabs beyond Interface are
// placeholders to be filled out as settings are decided.
const TABS: string[] = [ 'General', 'Social', 'Roleplay', 'Interface', 'System' ];

// Roleplay tab sub-pages (left rail). Empty for now — pages exist so the
// settings can be furnished one by one.
const ROLEPLAY_PAGES: string[] = [ 'Macros', 'Color', 'Tag', 'Messages' ];

// Interface tab sub-pages (left rail).
const INTERFACE_PAGES: string[] = [ 'Windows', 'Components' ];

export const RpSettingsView: FC<{}> = props =>
{
    const [ isVisible, setIsVisible ] = useState(false);
    const [ currentTab, setCurrentTab ] = useState<string>(TABS[0]);
    const [ chromeColor, setChromeColor ] = useState<string>(DEFAULT_CHROME_COLOR);
    const [ chromeOpacity, setChromeOpacity ] = useState<number>(DEFAULT_CHROME_OPACITY);
    const [ headerKey, setHeaderKey ] = useState<string>(DEFAULT_HEADER_KEY);
    const [ roleplayPage, setRoleplayPage ] = useState<string>(ROLEPLAY_PAGES[0]);
    const [ interfacePage, setInterfacePage ] = useState<string>(INTERFACE_PAGES[0]);

    // Snap any stored value onto the nearest of the five slider stops.
    const snapOpacity = (value: number) => CHROME_OPACITY_STEPS.reduce((prev, curr) => ((Math.abs(curr - value) < Math.abs(prev - value)) ? curr : prev));

    // Persisted UI settings arrive from the server at login; apply and track.
    useMessageEvent<RpUiSettingsEvent>(RpUiSettingsEvent, event =>
    {
        const parser = event.getParser();
        const color = (IsValidChromeColor(parser.chromeColor) ? parser.chromeColor : DEFAULT_CHROME_COLOR);
        const opacity = snapOpacity(parser.chromeOpacity);
        const header = (IsValidHeaderKey(parser.headerColor) ? parser.headerColor : DEFAULT_HEADER_KEY);

        setChromeColor(color);
        setChromeOpacity(opacity);
        setHeaderKey(header);
        ApplyUiChrome(color, opacity, header);
    });

    const saveChrome = (color: string, opacity: number, header: string) =>
    {
        // '' resets the server row's color/header to default
        SendMessageComposer(new RpSaveUiSettingsComposer((color === DEFAULT_CHROME_COLOR) ? '' : color, opacity, (header === DEFAULT_HEADER_KEY) ? '' : header));
    }

    const selectChrome = (color: string) =>
    {
        setChromeColor(color);
        ApplyUiChrome(color, chromeOpacity, headerKey);
        saveChrome(color, chromeOpacity, headerKey);
    }

    const selectOpacity = (index: number) =>
    {
        const opacity = (CHROME_OPACITY_STEPS[index] ?? DEFAULT_CHROME_OPACITY);

        setChromeOpacity(opacity);
        ApplyUiChrome(chromeColor, opacity, headerKey);
        saveChrome(chromeColor, opacity, headerKey);
    }

    const selectHeader = (key: string) =>
    {
        setHeaderKey(key);
        ApplyUiChrome(chromeColor, chromeOpacity, key);
        saveChrome(chromeColor, chromeOpacity, key);
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
                    <div className="rp-settings-subnav-layout">
                        <div className="rp-settings-subnav">
                            { INTERFACE_PAGES.map(page => (
                                <div key={ page }
                                    className={ `rp-settings-subnav-item ${ (interfacePage === page) ? 'is-active' : '' }` }
                                    onClick={ () => setInterfacePage(page) }>
                                    { page }
                                </div>
                            )) }
                        </div>
                        <Column gap={ 2 } className="rp-settings-subpage">
                            { (interfacePage === 'Windows') &&
                                <div className="rp-settings-section">
                                    <div className="rp-settings-section-info">
                                        <Text bold>Header Style</Text>
                                        <Text small className="text-muted">The color of window title bars, in the classic two-tone style.</Text>
                                    </div>
                                    <div className="rp-settings-swatches rp-settings-swatches--headers">
                                        { HEADER_SCHEMES.map(scheme => (
                                            <div key={ scheme.key } title={ scheme.name }
                                                className={ `rp-settings-swatch ${ (headerKey === scheme.key) ? 'is-selected' : '' }` }
                                                style={ { background: `linear-gradient(${ scheme.top } 50%, ${ scheme.bottom } 50%)` } }
                                                onClick={ () => selectHeader(scheme.key) } />
                                        )) }
                                    </div>
                                </div> }
                            { (interfacePage === 'Components') &&
                                <div className="rp-settings-section">
                                    <div className="rp-settings-section-info">
                                        <Text bold>Color</Text>
                                        <Text small className="text-muted">The color and opacity of your interface: the HUDs, drawer, purse and toolbars.</Text>
                                    </div>
                                    <div className="rp-settings-color-control">
                                        <div className="rp-settings-swatches">
                                            { CHROME_SCHEMES.map(scheme => (
                                                <div key={ scheme.key } title={ scheme.name }
                                                    className={ `rp-settings-swatch ${ (chromeColor === scheme.color) ? 'is-selected' : '' }` }
                                                    style={ { backgroundColor: scheme.color } }
                                                    onClick={ () => selectChrome(scheme.color) } />
                                            )) }
                                        </div>
                                        <div className="rp-settings-opacity">
                                            <input type="range" min={ 0 } max={ CHROME_OPACITY_STEPS.length - 1 } step={ 1 }
                                                value={ CHROME_OPACITY_STEPS.indexOf(chromeOpacity) }
                                                onChange={ event => selectOpacity(parseInt(event.target.value)) } />
                                            <Text small className="rp-settings-opacity-value">{ chromeOpacity }%</Text>
                                        </div>
                                    </div>
                                </div> }
                        </Column>
                    </div> }
                { (currentTab === 'Roleplay') &&
                    <div className="rp-settings-subnav-layout">
                        <div className="rp-settings-subnav">
                            { ROLEPLAY_PAGES.map(page => (
                                <div key={ page }
                                    className={ `rp-settings-subnav-item ${ (roleplayPage === page) ? 'is-active' : '' }` }
                                    onClick={ () => setRoleplayPage(page) }>
                                    { page }
                                </div>
                            )) }
                        </div>
                        <Column center fullHeight gap={ 1 } className="rp-settings-placeholder rp-settings-subpage">
                            <Text bold>{ roleplayPage }</Text>
                            <Text className="text-muted">Nothing here yet.</Text>
                        </Column>
                    </div> }
                { (currentTab !== 'Interface') && (currentTab !== 'Roleplay') &&
                    <Column center fullHeight gap={ 1 } className="rp-settings-placeholder">
                        <Text bold>{ currentTab }</Text>
                        <Text className="text-muted">Nothing here yet.</Text>
                    </Column> }
            </NitroCardContentView>
        </NitroCardView>
    );
}
