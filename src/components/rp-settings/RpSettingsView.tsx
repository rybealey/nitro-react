import { AvatarFigurePartType, AvatarScaleType, AvatarSetType, ILinkEventTracker, RpUiSettingsEvent } from '@nitrots/nitro-renderer';
import { RpSaveUiSettingsComposer } from '@nitrots/nitro-renderer';
import { FC, useEffect, useState } from 'react';
import { AddEventLinkTracker, GetAvatarRenderManager, GetSessionDataManager, RemoveLinkEventTracker, SendMessageComposer } from '../../api';
import { Column, NitroCardContentView, NitroCardHeaderView, NitroCardTabsItemView, NitroCardTabsView, NitroCardView, Text } from '../../common';
import { useMessageEvent } from '../../hooks';
import { ApplyUiChrome, CHROME_OPACITY_STEPS, CHROME_SCHEMES, ChromeSwatchColor, DEFAULT_CHROME_COLOR, DEFAULT_CHROME_OPACITY, DEFAULT_HEADER_KEY, HEADER_SCHEMES, IsValidChromeColor, IsValidHeaderKey } from './UiChrome';
import { DEFAULT_USERNAME_COLOR, IsValidUsernameColor, USERNAME_COLORS } from './UsernameColors';
import { DEFAULT_USERNAME_ICON, IsValidUsernameIcon, USERNAME_ICONS } from './IconChoices';
import { UsernameIconGlyph } from './UsernameIconGlyph';

// PixelRP settings window, opened from the side drawer's Settings button
// (CreateLinkEvent('rp-settings/toggle')). Tabs beyond Interface are
// placeholders to be filled out as settings are decided.
const TABS: string[] = [ 'General', 'Social', 'Roleplay', 'System' ];

// Roleplay tab sub-pages (left rail). Empty for now — pages exist so the
// settings can be furnished one by one.
const ROLEPLAY_PAGES: string[] = [ 'Macros', 'Messages' ];

// Social tab sub-pages (left rail), grouped under the Personalization
// eyebrow; the chat-bubble preview shows on both.
const SOCIAL_PAGES: string[] = [ 'Color', 'Icon' ];

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
    const [ socialPage, setSocialPage ] = useState<string>(SOCIAL_PAGES[0]);
    const [ usernameColor, setUsernameColor ] = useState<string>(DEFAULT_USERNAME_COLOR);
    const [ usernameIcon, setUsernameIcon ] = useState<string>(DEFAULT_USERNAME_ICON);
    const [ usernameIconColor, setUsernameIconColor ] = useState<string>(DEFAULT_USERNAME_COLOR);
    const [ interfacePage, setInterfacePage ] = useState<string>(INTERFACE_PAGES[0]);
    // Own avatar head + chest color for the preview bubble, built the same way
    // the chat widget builds them (useChatWidget's setFigureImage).
    const [ previewFigure, setPreviewFigure ] = useState<{ imageUrl: string, color: string }>(null);

    useEffect(() =>
    {
        if(!isVisible) return;

        let disposed = false;

        const buildFigure = (figure: string) =>
        {
            const avatarImage = GetAvatarRenderManager().createAvatarImage(figure, AvatarScaleType.LARGE, null, {
                resetFigure: figure =>
                {
                    if(!disposed) buildFigure(figure);
                },
                dispose: () => {},
                disposed: false
            });

            if(!avatarImage) return;

            const image = avatarImage.getCroppedImage(AvatarSetType.HEAD);
            const color = avatarImage.getPartColor(AvatarFigurePartType.CHEST);

            setPreviewFigure({ imageUrl: image.src, color: ('#' + ((color && color.rgb) || 16777215).toString(16).padStart(6, '0')) });
            avatarImage.dispose();
        }

        buildFigure(GetSessionDataManager().figure);

        return () =>
        {
            disposed = true;
        }
    }, [ isVisible ]);

    // Snap any stored value onto the nearest of the five slider stops.
    const snapOpacity = (value: number) => CHROME_OPACITY_STEPS.reduce((prev, curr) => ((Math.abs(curr - value) < Math.abs(prev - value)) ? curr : prev));

    // Persisted UI settings arrive from the server at login; apply and track.
    useMessageEvent<RpUiSettingsEvent>(RpUiSettingsEvent, event =>
    {
        const parser = event.getParser();
        const color = (IsValidChromeColor(parser.chromeColor) ? parser.chromeColor : DEFAULT_CHROME_COLOR);
        const opacity = snapOpacity(parser.chromeOpacity);
        const header = (IsValidHeaderKey(parser.headerColor) ? parser.headerColor : DEFAULT_HEADER_KEY);
        const uname = (IsValidUsernameColor(parser.usernameColor) ? parser.usernameColor : DEFAULT_USERNAME_COLOR);
        const uicon = (IsValidUsernameIcon(parser.icon) ? parser.icon : DEFAULT_USERNAME_ICON);
        const uiconColor = (IsValidUsernameColor(parser.iconColor) ? parser.iconColor : DEFAULT_USERNAME_COLOR);

        setChromeColor(color);
        setChromeOpacity(opacity);
        setHeaderKey(header);
        setUsernameColor(uname);
        setUsernameIcon(uicon);
        setUsernameIconColor(uiconColor);
        ApplyUiChrome(color, opacity, header);
    });

    const saveSettings = (color: string, opacity: number, header: string, uname: string, icon: string, iconColor: string) =>
    {
        // '' resets the server row's color/header/username/icon to default
        SendMessageComposer(new RpSaveUiSettingsComposer(
            (color === DEFAULT_CHROME_COLOR) ? '' : color,
            opacity,
            (header === DEFAULT_HEADER_KEY) ? '' : header,
            (uname === DEFAULT_USERNAME_COLOR) ? '' : uname,
            icon,
            (iconColor === DEFAULT_USERNAME_COLOR) ? '' : iconColor));
    }

    const selectChrome = (color: string) =>
    {
        setChromeColor(color);
        ApplyUiChrome(color, chromeOpacity, headerKey);
        saveSettings(color, chromeOpacity, headerKey, usernameColor, usernameIcon, usernameIconColor);
    }

    const selectOpacity = (index: number) =>
    {
        const opacity = (CHROME_OPACITY_STEPS[index] ?? DEFAULT_CHROME_OPACITY);

        setChromeOpacity(opacity);
        ApplyUiChrome(chromeColor, opacity, headerKey);
        saveSettings(chromeColor, opacity, headerKey, usernameColor, usernameIcon, usernameIconColor);
    }

    const selectHeader = (key: string) =>
    {
        setHeaderKey(key);
        ApplyUiChrome(chromeColor, chromeOpacity, key);
        saveSettings(chromeColor, chromeOpacity, key, usernameColor, usernameIcon, usernameIconColor);
    }

    const selectUsernameColor = (color: string) =>
    {
        setUsernameColor(color);
        saveSettings(chromeColor, chromeOpacity, headerKey, color, usernameIcon, usernameIconColor);
    }

    const selectUsernameIcon = (icon: string) =>
    {
        setUsernameIcon(icon);
        saveSettings(chromeColor, chromeOpacity, headerKey, usernameColor, icon, usernameIconColor);
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
                { (currentTab === 'System') &&
                    <div className="rp-settings-subnav-layout">
                        <div className="rp-settings-subnav">
                            { /* sectioned links: eyebrow header per group */ }
                            <div className="rp-settings-subnav-eyebrow">Interface</div>
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
                                                    style={ { backgroundColor: ChromeSwatchColor(scheme.color) } }
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
                { (currentTab === 'Social') &&
                    <div className="rp-settings-subnav-layout">
                        <div className="rp-settings-subnav">
                            <div className="rp-settings-subnav-eyebrow">Personalization</div>
                            { SOCIAL_PAGES.map(page => (
                                <div key={ page }
                                    className={ `rp-settings-subnav-item ${ (socialPage === page) ? 'is-active' : '' }` }
                                    onClick={ () => setSocialPage(page) }>
                                    { page }
                                </div>
                            )) }
                            { /* future groups - links land here as their settings ship */ }
                            <div className="rp-settings-subnav-eyebrow">Interactions</div>
                            <div className="rp-settings-subnav-eyebrow">Verification</div>
                            <div className={ `rp-settings-subnav-item ${ (socialPage === 'Discord') ? 'is-active' : '' }` }
                                onClick={ () => setSocialPage('Discord') }>
                                Discord
                            </div>
                        </div>
                        <Column gap={ 2 } className="rp-settings-subpage">
                            <>
                                { ((socialPage === 'Color') || (socialPage === 'Icon')) &&
                                <div className="rp-settings-preview">
                                    <Text small className="text-muted">Preview</Text>
                                    <div className="bubble-container" style={ { position: 'relative' } }>
                                        <div className="user-container-bg" style={ { backgroundColor: previewFigure?.color } } />
                                        <div className="chat-bubble bubble-0 type-0" style={ { maxWidth: '100%' } }>
                                            <div className="user-container">
                                                { previewFigure?.imageUrl &&
                                                    <div className="user-image" style={ { backgroundImage: `url(${ previewFigure.imageUrl })` } } /> }
                                            </div>
                                            <div className="chat-content">
                                                { usernameIcon &&
                                                    <b className="username mr-1"><UsernameIconGlyph iconClass={ usernameIcon } />{ ' ' }</b> }
                                                <b className="username mr-1"><span style={ { color: usernameColor } }>{ GetSessionDataManager().userName }</span>{ ': ' }</b>
                                                <span className="message">Welcome to San Francisco!</span>
                                            </div>
                                            <div className="pointer" />
                                        </div>
                                    </div>
                                </div> }
                                { (socialPage === 'Color') &&
                                <div className="rp-settings-stack-section">
                                    <div className="rp-settings-stack-head">
                                        <Text bold>Color</Text>
                                        <Text small className="text-muted">The color of your username in your chat bubbles.</Text>
                                    </div>
                                    <div className="rp-settings-swatches rp-settings-swatches--wide">
                                        { USERNAME_COLORS.map(entry => (
                                            <div key={ entry.key } title={ entry.name }
                                                className={ `rp-settings-swatch ${ (usernameColor === entry.color) ? 'is-selected' : '' }` }
                                                style={ { backgroundColor: entry.color } }
                                                onClick={ () => selectUsernameColor(entry.color) } />
                                        )) }
                                    </div>
                                </div> }
                                { (socialPage === 'Icon') &&
                                <div className="rp-settings-stack-section">
                                    <div className="rp-settings-stack-head">
                                        <Text bold>Icon</Text>
                                        <Text small className="text-muted">An icon before your name in chat.</Text>
                                    </div>
                                    <div className="rp-settings-swatches rp-settings-swatches--wide">
                                        { USERNAME_ICONS.map(entry => (
                                            <div key={ entry.key } title={ entry.name }
                                                className={ `rp-settings-swatch rp-settings-swatch--icon ${ (usernameIcon === (entry.iconClass ?? '')) ? 'is-selected' : '' }` }
                                                onClick={ () => selectUsernameIcon(entry.iconClass ?? '') }>
                                                <UsernameIconGlyph iconClass={ entry.iconClass } />
                                            </div>
                                        )) }
                                    </div>
                                </div> }
                                { (socialPage === 'Discord') &&
                                <Column center fullHeight gap={ 1 } className="rp-settings-placeholder">
                                    <Text bold>Discord</Text>
                                    <Text className="text-muted">Link your Discord account to get verified - coming soon.</Text>
                                </Column> }
                            </>
                        </Column>
                    </div> }
                { (currentTab !== 'System') && (currentTab !== 'Roleplay') && (currentTab !== 'Social') &&
                    <Column center fullHeight gap={ 1 } className="rp-settings-placeholder">
                        <Text bold>{ currentTab }</Text>
                        <Text className="text-muted">Nothing here yet.</Text>
                    </Column> }
            </NitroCardContentView>
        </NitroCardView>
    );
}
