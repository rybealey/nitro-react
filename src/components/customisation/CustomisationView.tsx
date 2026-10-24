import { AvatarFigurePartType, AvatarScaleType, AvatarSetType, ILinkEventTracker } from '@nitrots/nitro-renderer';
import { FC, useEffect, useMemo, useState } from 'react';
import { AddEventLinkTracker, GetAvatarRenderManager, GetSessionDataManager, RemoveLinkEventTracker } from '../../api';
import { Column, NitroCardContentView, NitroCardHeaderView, NitroCardView, Text } from '../../common';
import { useSessionInfo } from '../../hooks';
import { GetSelectableChatStyleIds } from '../rp-settings/ChatStyles';
import { USERNAME_ICONS } from '../rp-settings/IconChoices';
import { SaveUiAccountSettings, useUiAccountSettings } from '../rp-settings/UiAccountSettings';
import { USERNAME_COLORS } from '../rp-settings/UsernameColors';
import { UsernameIconGlyph } from '../rp-settings/UsernameIconGlyph';

// PixelRP Customisation window, open to everyone from the toolbar's menu
// (CreateLinkEvent('customisation/toggle')): how your name and your chat look.
// It was Settings > Personalization, moved here whole - the same rail, pages
// and preview, drawn with the Settings window's styles (rp-settings-window).

// Rail pages, grouped under the Username eyebrow; the chat-bubble preview
// shows on both.
const USERNAME_PAGES: string[] = [ 'Name Color', 'Icon' ];
// ...and the Chat group below it: the whole bubble, not just the name.
const CHAT_PAGES: string[] = [ 'Chat Bubble' ];

export const CustomisationView: FC<{}> = props =>
{
    const [ isVisible, setIsVisible ] = useState(false);
    const [ page, setPage ] = useState<string>(USERNAME_PAGES[0]);
    // Chat Bubble saves the same setting as the picker beside the chat box
    // (RoomUnitChatStyleComposer), from the same list.
    const { chatStyleId = 0, updateChatStyleId = null } = useSessionInfo();
    const chatStyleIds = useMemo(() => (isVisible ? GetSelectableChatStyleIds() : []), [ isVisible ]);
    // saved with the window colours, which Settings > UI keeps (UiAccountSettings)
    const { usernameColor, usernameIcon } = useUiAccountSettings();
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
            eventUrlPrefix: 'customisation/'
        };

        AddEventLinkTracker(linkTracker);

        return () => RemoveLinkEventTracker(linkTracker);
    }, []);

    if(!isVisible) return null;

    return (
        <NitroCardView resizable uniqueKey="customisation" className="rp-settings-window rp-customisation-window" theme="primary-slim">
            <NitroCardHeaderView headerText="Customisation" onCloseClick={ () => setIsVisible(false) } />
            <NitroCardContentView className="text-black rp-settings-content--light">
                <div className="prp-subnav-layout">
                    <div className="prp-subnav">
                        <div className="prp-subnav-eyebrow">Username</div>
                        { USERNAME_PAGES.map(entry => (
                            <div key={ entry }
                                className={ `prp-subnav-item ${ (page === entry) ? 'is-active' : '' }` }
                                onClick={ () => setPage(entry) }>
                                { entry }
                            </div>
                        )) }
                        <div className="prp-subnav-eyebrow">Chat</div>
                        { CHAT_PAGES.map(entry => (
                            <div key={ entry }
                                className={ `prp-subnav-item ${ (page === entry) ? 'is-active' : '' }` }
                                onClick={ () => setPage(entry) }>
                                { entry }
                            </div>
                        )) }
                    </div>
                    <Column gap={ 2 } className={ `prp-subnav-page ${ (page === 'Chat Bubble') ? 'rp-settings-bubble-page' : '' }` }>
                        { /* On Chat Bubble the preview is a plain centred box
                             over the tiles (canvas board I), no label. */ }
                        <div className={ `rp-settings-preview ${ (page === 'Chat Bubble') ? 'rp-settings-preview--centered' : '' }` }>
                            { (page !== 'Chat Bubble') &&
                                <Text small className="text-muted">Preview</Text> }
                            <div className="bubble-container" style={ { position: 'relative' } }>
                                <div className="user-container-bg" style={ { backgroundColor: previewFigure?.color } } />
                                <div className={ `chat-bubble bubble-${ chatStyleId } type-0` } style={ { maxWidth: '100%' } }>
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
                        </div>
                        { (page === 'Name Color') &&
                            <div className="rp-settings-stack-section">
                                <div className="rp-settings-stack-head">
                                    <div className="rp-settings-stack-head-text">
                                        <Text bold>Name Color</Text>
                                    </div>
                                </div>
                                <div className="rp-settings-swatches rp-settings-swatches--wide">
                                    { USERNAME_COLORS.map(entry => (
                                        <div key={ entry.key } title={ entry.name }
                                            className={ `rp-settings-swatch ${ (usernameColor === entry.color) ? 'is-selected' : '' }` }
                                            style={ { backgroundColor: entry.color } }
                                            onClick={ () => SaveUiAccountSettings({ usernameColor: entry.color }) } />
                                    )) }
                                </div>
                            </div> }
                        { (page === 'Icon') &&
                            <div className="rp-settings-stack-section">
                                <div className="rp-settings-stack-head">
                                    <div className="rp-settings-stack-head-text">
                                        <Text bold>Icon</Text>
                                    </div>
                                </div>
                                <div className="rp-settings-swatches rp-settings-swatches--wide">
                                    { USERNAME_ICONS.map(entry => (
                                        <div key={ entry.key } title={ entry.name }
                                            className={ `rp-settings-swatch rp-settings-swatch--icon ${ (usernameIcon === (entry.iconClass ?? '')) ? 'is-selected' : '' }` }
                                            onClick={ () => SaveUiAccountSettings({ usernameIcon: (entry.iconClass ?? '') }) }>
                                            <UsernameIconGlyph iconClass={ entry.iconClass } />
                                        </div>
                                    )) }
                                </div>
                            </div> }
                        { /* Every style, one tile each, in a panel that scrolls
                             on its own under the preview. No pointer in the
                             tiles; the preview keeps its own. */ }
                        { (page === 'Chat Bubble') &&
                            <div className="rp-settings-bubbles" role="radiogroup" aria-label="Chat bubble">
                                { chatStyleIds.map(styleId => (
                                    <button key={ styleId } type="button" role="radio" aria-checked={ (chatStyleId === styleId) }
                                        aria-label={ `Bubble ${ styleId }` } title={ `Bubble ${ styleId }` }
                                        className={ `rp-settings-bubble ${ (chatStyleId === styleId) ? 'is-selected' : '' }` }
                                        onClick={ () => updateChatStyleId(styleId) }>
                                        <div className="bubble-container" style={ { position: 'relative' } }>
                                            <div className="user-container-bg" />
                                            <div className={ `chat-bubble bubble-${ styleId } type-0` }>
                                                <div className="user-container" />
                                                <div className="chat-content">
                                                    <span className="message">Hey!</span>
                                                </div>
                                            </div>
                                        </div>
                                    </button>
                                )) }
                            </div> }
                    </Column>
                </div>
            </NitroCardContentView>
        </NitroCardView>
    );
}
