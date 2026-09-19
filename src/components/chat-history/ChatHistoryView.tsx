import { ILinkEventTracker } from '@nitrots/nitro-renderer';
import { FC, useEffect, useMemo, useRef, useState } from 'react';
import { AddEventLinkTracker, ChatEntryType, IChatEntry, LocalizeText, RemoveLinkEventTracker } from '../../api';
import { IsNarratedBubble, NarratedBubbleText } from '../../api/rp-chat/NarratedBubble';
import { Flex, InfiniteScroll, NitroCardContentView, NitroCardHeaderView, NitroCardTabsItemView, NitroCardTabsView, NitroCardView, Text } from '../../common';
import { useChatHistory } from '../../hooks';
import { UsernameIconGlyph } from '../rp-settings/UsernameIconGlyph';

type HistoryTab = 'all' | 'mentions' | 'gang';

export const ChatHistoryView: FC<{}> = props =>
{
    const [ isVisible, setIsVisible ] = useState(false);
    const [ searchText, setSearchText ] = useState<string>('');
    const [ tab, setTab ] = useState<HistoryTab>('all');
    const { chatHistory = [], mentions = [], mentionsUnread = 0, clearMentionsUnread = null, gangChat = [], gangUnread = 0, clearGangUnread = null } = useChatHistory();
    const elementRef = useRef<HTMLDivElement>(null);

    const rows = useMemo(() =>
    {
        const source = ((tab === 'mentions') ? mentions : (tab === 'gang') ? gangChat : chatHistory);

        if(searchText.length === 0) return source;

        let text = searchText.toLowerCase();

        return source.filter(entry => ((entry.message && entry.message.toLowerCase().includes(text))) || (entry.name && entry.name.toLowerCase().includes(text)));
    }, [ chatHistory, mentions, gangChat, searchText, tab ]);

    useEffect(() =>
    {
        if(elementRef && elementRef.current && isVisible) elementRef.current.scrollTop = elementRef.current.scrollHeight;
    }, [ isVisible ]);

    // The count clears whenever the tab is actually in front of the player -
    // opening the window on it, switching to it, and a mention landing while
    // they are already looking at it. It is not cleared by the ping alone.
    useEffect(() =>
    {
        if(isVisible && (tab === 'mentions') && clearMentionsUnread) clearMentionsUnread();
    }, [ isVisible, tab, mentions.length ]);

    useEffect(() =>
    {
        if(isVisible && (tab === 'gang') && clearGangUnread) clearGangUnread();
    }, [ isVisible, tab, gangChat.length ]);

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
            eventUrlPrefix: 'chat-history/'
        };

        AddEventLinkTracker(linkTracker);

        return () => RemoveLinkEventTracker(linkTracker);
    }, []);

    if(!isVisible) return null;

    const renderRow = (row: IChatEntry) =>
    {
        // The same rule the in-room bubble applies, from the same
        // module: a narrated line reads "*Yavn drops Murder against
        // twist*" here too, rather than "Yavn: *drops ...*".
        const isActionBubble = IsNarratedBubble(row.style, row.text);
        const message = isActionBubble ? NarratedBubbleText(row.message) : row.message;

        return (
            <Flex alignItems="center" className="p-1" gap={ 2 }>
                <Text variant="muted">{ row.timestamp }</Text>
                { (row.type === ChatEntryType.TYPE_CHAT) &&
                    <div className="bubble-container" style={ { position: 'relative' } }>
                        { (row.style === 0) &&
                        <div className="user-container-bg" style={ { backgroundColor: row.color } } /> }
                        <div className={ `chat-bubble bubble-${ row.style } type-${ row.chatType }${ isActionBubble ? ' is-action' : '' }` } style={ { maxWidth: '100%' } }>
                            <div className="user-container">
                                { row.imageUrl && (row.imageUrl.length > 0) &&
                    <div className="user-image" style={ { backgroundImage: `url(${ row.imageUrl })` } } /> }
                            </div>
                            <div className="chat-content">
                                { row.usernameIcon &&
                                    <b className="username mr-1"><UsernameIconGlyph iconClass={ row.usernameIcon } />{ ' ' }</b> }
                                <b className="username mr-1">{ isActionBubble && '*' }<span style={ row.usernameColor ? { color: row.usernameColor } : undefined } dangerouslySetInnerHTML={ { __html: row.name } } />{ isActionBubble ? ' ' : ': ' }</b>
                                <span className="message" dangerouslySetInnerHTML={ { __html: `${ message }` } } />
                            </div>
                        </div>
                    </div> }
                { (row.type === ChatEntryType.TYPE_ROOM_INFO) &&
                    <>
                        <i className="icon icon-small-room" />
                        <Text textBreak wrap grow>{ row.name }</Text>
                    </> }
            </Flex>
        )
    }

    return (
        <NitroCardView resizable uniqueKey="chat-history" className="nitro-chat-history" theme="primary-slim">
            <NitroCardHeaderView headerText={ LocalizeText('room.chathistory.button.text') } onCloseClick={ event => setIsVisible(false) }/>
            <NitroCardTabsView>
                { /* "World" rather than the window's own name: a tab repeating
                     the title says nothing, and World/Mentions reads as what
                     the two actually are - everything said in the room, and the
                     part of it aimed at you. The header and the room-tools
                     button keep the localized name. */ }
                <NitroCardTabsItemView isActive={ (tab === 'all') } onClick={ event => setTab('all') }>
                    World
                </NitroCardTabsItemView>
                <NitroCardTabsItemView isActive={ (tab === 'mentions') } count={ mentionsUnread } onClick={ event => setTab('mentions') }>
                    Mentions
                </NitroCardTabsItemView>
                <NitroCardTabsItemView isActive={ (tab === 'gang') } count={ gangUnread } onClick={ event => setTab('gang') }>
                    Gang Chat
                </NitroCardTabsItemView>
            </NitroCardTabsView>
            <NitroCardContentView innerRef={ elementRef } overflow="hidden" gap={ 2 }>
                <input type="text" className="form-control form-control-sm" placeholder={ LocalizeText('generic.search') } value={ searchText } onChange={ event => setSearchText(event.target.value) } />
                { (tab === 'mentions') && !mentions.length &&
                    <Text variant="muted" className="p-1">Nobody has @ mentioned you yet.</Text> }
                { (tab === 'gang') && !gangChat.length &&
                    <Text variant="muted" className="p-1">No gang chat yet. Send some with :ga.</Text> }
                <InfiniteScroll rows={ rows } scrollToBottom={ true } rowRender={ renderRow } />
            </NitroCardContentView>
        </NitroCardView>
    );
}
