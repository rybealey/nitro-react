import { ILinkEventTracker } from '@nitrots/nitro-renderer';
import { FC, useEffect, useMemo, useState } from 'react';
import { AddEventLinkTracker, ChatEntryType, IChatEntry, LocalizeText, RemoveLinkEventTracker } from '../../api';
import { IsNarratedBubble, NarratedBubbleText } from '../../api/rp-chat/NarratedBubble';
import { GANG_ALERT_PREFIX, IsGangAlert, ParseGangAlert } from '../../api/rp-chat/GangAlert';
import { CORP_ALERT_PREFIX, IsCorpAlert, ParseCorpAlert } from '../../api/rp-chat/CorpAlert';
import { InfiniteScroll, NitroCardHeaderView, NitroCardView } from '../../common';
import { useChatHistory } from '../../hooks';
import { UsernameIconGlyph } from '../rp-settings/UsernameIconGlyph';

type HistoryTab = 'all' | 'mentions' | 'gang' | 'corp';

const TABS: { id: HistoryTab; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'mentions', label: 'Mentions' },
    { id: 'gang', label: 'Gang' },
    { id: 'corp', label: 'Corporation' }
];

const EMPTY_TEXT: { [tab in HistoryTab]: string } = {
    all: 'Nothing said yet this session.',
    mentions: 'Nobody has @ mentioned you yet.',
    gang: 'No gang chat yet. Send some with :ga.',
    corp: 'No corporation chat yet. Clock in and send some with :ca.'
};

// All has no label: it is the whole log, and saying so said nothing.
const FOOTER_TEXT: { [tab in HistoryTab]: string } = {
    all: '',
    mentions: 'Lines that @ mention you',
    gang: 'Gang chat this session',
    corp: 'Corporation chat this session'
};

const CLEAR_LABEL: { [tab in HistoryTab]: string } = {
    all: 'Clear chat history',
    mentions: 'Clear mentions',
    gang: 'Clear gang chat',
    corp: 'Clear corporation chat'
};

const escapeHtml = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Marks the search term inside a line's formatted HTML. Only text between tags
// and entities is touched, so a search for "b" cannot land inside a <b> tag or
// split an &amp;.
const highlight = (html: string, query: string): string =>
{
    if(!html || !query) return html;

    const needle = escapeHtml(query).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(needle, 'gi');

    return html.split(/(<[^>]*>|&[#a-z0-9]+;)/i)
        .map(part => ((part.startsWith('<') || /^&[#a-z0-9]+;$/i.test(part)) ? part : part.replace(pattern, match => `<mark class="rp-ch-hit">${ match }</mark>`)))
        .join('');
}

export const ChatHistoryView: FC<{}> = props =>
{
    const [ isVisible, setIsVisible ] = useState(false);
    const [ searchText, setSearchText ] = useState<string>('');
    const [ tab, setTab ] = useState<HistoryTab>('all');
    // Tabs emptied with the bin, so an empty tab can say why it is empty.
    const [ cleared, setCleared ] = useState<HistoryTab[]>([]);
    const [ scrollKey, setScrollKey ] = useState(0);
    const {
        chatHistory = [], mentions = [], mentionsUnread = 0, clearMentionsUnread = null,
        gangChat = [], gangUnread = 0, clearGangUnread = null,
        corpChat = [], corpUnread = 0, clearCorpUnread = null, clearHistory = null
    } = useChatHistory();

    const query = searchText.trim().toLowerCase();

    const rows = useMemo(() =>
    {
        const source = ((tab === 'mentions') ? mentions : (tab === 'gang') ? gangChat : (tab === 'corp') ? corpChat : chatHistory);

        if(!query.length) return source;

        return source.filter(entry => (((entry.text || entry.message) && (entry.text || entry.message).toLowerCase().includes(query)) || (entry.name && entry.name.toLowerCase().includes(query))));
    }, [ chatHistory, mentions, gangChat, corpChat, query, tab ]);

    // The list holds still while you read: a new line lands below and nothing
    // moves. It goes to the newest line only when you open the window, change
    // tab, or press Latest - InfiniteScroll's scrollToBottom re-scrolled on
    // every render, so each incoming line yanked the view away from what you
    // were reading.
    useEffect(() =>
    {
        if(isVisible) setScrollKey(prevValue => (prevValue + 1));
    }, [ isVisible, tab ]);

    const matchCount = useMemo(() => rows.filter(row => (row.type === ChatEntryType.TYPE_CHAT)).length, [ rows ]);

    // The count clears whenever the tab is actually in front of the player -
    // opening the window on it, switching to it, and a line landing while
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
        if(isVisible && (tab === 'corp') && clearCorpUnread) clearCorpUnread();
    }, [ isVisible, tab, corpChat.length ]);

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

    const unreadOf = (id: HistoryTab) =>
    {
        if(id === tab) return 0;
        if(id === 'mentions') return mentionsUnread;
        if(id === 'gang') return gangUnread;
        if(id === 'corp') return corpUnread;

        return 0;
    }

    const clearTab = () =>
    {
        if(clearHistory) clearHistory(tab);

        setCleared(prevValue => ((tab === 'all') ? TABS.map(entry => entry.id) : [ ...prevValue.filter(id => (id !== tab)), tab ]));
        setSearchText('');
    }

    const emptyText = query.length ? `No lines match “${ searchText.trim() }”.` : (cleared.includes(tab) ? 'Cleared. New lines will show up here.' : EMPTY_TEXT[tab]);

    const renderRow = (row: IChatEntry) =>
    {
        if(row.type === ChatEntryType.TYPE_ROOM_INFO)
        {
            return (
                <div className="rp-ch-room">
                    <i className="icon icon-small-room" />
                    <span className="rp-ch-room-name">{ row.name }</span>
                    <span className="rp-ch-time">{ row.timestamp }</span>
                </div>
            );
        }

        if(row.type !== ChatEntryType.TYPE_CHAT) return <div />;

        // The same rule the in-room bubble applies, from the same
        // module: a narrated line reads "*Yavn drops Murder against
        // twist*" here too, rather than "Yavn: *drops ...*".
        const isActionBubble = IsNarratedBubble(row.style, row.text);
        const message = isActionBubble ? NarratedBubbleText(row.message) : row.message;

        // Same treatment as the in-room bubble, from the same module, so the
        // Gang and Corporation tabs read exactly like the line in the room.
        const gangAlert = IsGangAlert(row.style) ? ParseGangAlert(message) : null;
        const corpAlert = (!gangAlert && IsCorpAlert(row.style, row.chatType, row.name, row.text)) ? ParseCorpAlert(message) : null;
        const alert = (gangAlert || corpAlert);
        const displayName = alert ? `${ gangAlert ? GANG_ALERT_PREFIX : CORP_ALERT_PREFIX } ${ alert.sender }` : row.name;
        const displayText = alert ? alert.message : message;

        return (
            <div className="rp-ch-line">
                <span className="rp-ch-time">{ row.timestamp }</span>
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
                            <b className="username mr-1">{ isActionBubble && '*' }<span style={ row.usernameColor ? { color: row.usernameColor } : undefined } dangerouslySetInnerHTML={ { __html: highlight(displayName, query) } } />{ isActionBubble ? ' ' : ': ' }</b>
                            <span className="message" dangerouslySetInnerHTML={ { __html: highlight(displayText, query) } } />
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <NitroCardView resizable uniqueKey="chat-history" className="nitro-chat-history" theme="primary-slim">
            <NitroCardHeaderView headerText={ LocalizeText('room.chathistory.button.text') } onCloseClick={ event => setIsVisible(false) }/>
            <div className="rp-ch-tabs" role="tablist" aria-label="Chat history views">
                { TABS.map(entry =>
                {
                    const count = unreadOf(entry.id);

                    return (
                        <button key={ entry.id } type="button" role="tab" aria-selected={ (entry.id === tab) }
                            className={ 'rp-ch-tab' + ((entry.id === tab) ? ' is-active' : '') } onClick={ () => setTab(entry.id) }>
                            { entry.label }
                            { (count > 0) && <span className="rp-ch-count">{ count }</span> }
                        </button>
                    );
                }) }
            </div>
            <div className="rp-ch-body">
                <div className="rp-ch-search">
                    <label className="rp-ch-search-field">
                        <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true"><circle cx="6" cy="6" r="4.5" /><path d="M9.5 9.5L13 13" /></svg>
                        <input type="text" aria-label="Search chat" placeholder={ LocalizeText('generic.search') } value={ searchText } onChange={ event => setSearchText(event.target.value) } />
                    </label>
                    { (query.length > 0) &&
                        <span className="rp-ch-matches">{ matchCount } { (matchCount === 1) ? 'match' : 'matches' }</span> }
                    <button type="button" className="rp-ch-clear" aria-label={ CLEAR_LABEL[tab] } title={ CLEAR_LABEL[tab] } onClick={ clearTab }>
                        <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M2 3.5h10" /><path d="M5.5 3.5V2h3v1.5" /><path d="M3.5 3.5l.6 8.5h5.8l.6-8.5" /><path d="M5.8 6v3.8M8.2 6v3.8" /></svg>
                    </button>
                </div>
                <div className="rp-ch-list">
                    { !rows.length &&
                        <div className="rp-ch-empty">{ emptyText }</div> }
                    { (rows.length > 0) &&
                        <InfiniteScroll rows={ rows } scrollKey={ scrollKey } rowRender={ renderRow } /> }
                </div>
                <div className="rp-ch-footer">
                    <span>{ FOOTER_TEXT[tab] }</span>
                    <button type="button" className="rp-ch-latest" onClick={ () => setScrollKey(prevValue => (prevValue + 1)) }>
                        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 1.5v7M2 5.5l3 3 3-3" /></svg>
                        Latest
                    </button>
                </div>
            </div>
        </NitroCardView>
    );
}
