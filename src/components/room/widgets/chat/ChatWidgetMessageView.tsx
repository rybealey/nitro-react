import { RoomChatSettings, RoomObjectCategory } from '@nitrots/nitro-renderer';
import { FC, useEffect, useMemo, useRef, useState } from 'react';
import { ChatBubbleMessage, GetRoomEngine } from '../../../../api';
import { IsNarratedBubble, NarratedBubbleText } from '../../../../api/rp-chat/NarratedBubble';
import { UsernameIconGlyph } from '../../../rp-settings/UsernameIconGlyph';
import { GANG_ALERT_PREFIX, IsGangAlert, ParseGangAlert } from '../../../../api/rp-chat/GangAlert';
import { CORP_ALERT_PREFIX, IsCorpAlert, ParseCorpAlert } from '../../../../api/rp-chat/CorpAlert';
import { IsStaffAlert, ParseStaffAlert, STAFF_ALERT_PREFIX } from '../../../../api/rp-chat/StaffAlert';

interface ChatWidgetMessageViewProps
{
    chat: ChatBubbleMessage;
    makeRoom: (chat: ChatBubbleMessage) => void;
    bubbleWidth?: number;
}


export const ChatWidgetMessageView: FC<ChatWidgetMessageViewProps> = props =>
{
    const { chat = null, makeRoom = null, bubbleWidth = RoomChatSettings.CHAT_BUBBLE_WIDTH_NORMAL } = props;
    const [ isVisible, setIsVisible ] = useState(false);
    const [ isReady, setIsReady ] = useState<boolean>(false);
    const elementRef = useRef<HTMLDivElement>();

    const getBubbleWidth = useMemo(() =>
    {
        switch(bubbleWidth)
        {
            case RoomChatSettings.CHAT_BUBBLE_WIDTH_NORMAL:
                return 350;
            case RoomChatSettings.CHAT_BUBBLE_WIDTH_THIN:
                return 240;
            case RoomChatSettings.CHAT_BUBBLE_WIDTH_WIDE:
                return 2000;
        }
    }, [ bubbleWidth ]);

    useEffect(() =>
    {
        setIsVisible(false);
        
        const element = elementRef.current;

        if(!element) return;

        const width = element.offsetWidth;
        const height = element.offsetHeight;

        chat.width = width;
        chat.height = height;
        chat.elementRef = element;
        
        let left = chat.left;
        let top = chat.top;

        if(!left && !top)
        {
            left = (chat.location.x - (width / 2));
            top = (element.parentElement.offsetHeight - height);
            
            chat.left = left;
            chat.top = top;
        }

        setIsReady(true);

        return () =>
        {
            chat.elementRef = null;

            setIsReady(false);
        }
    }, [ chat ]);

    useEffect(() =>
    {
        if(!isReady || !chat || isVisible) return;
        
        if(makeRoom) makeRoom(chat);

        setIsVisible(true);
    }, [ chat, isReady, isVisible, makeRoom ]);

    // Narrated bubbles arrive as *action text*. Move that opening marker
    // ahead of the username so the whole line reads *Username action text*,
    // and mark the bubble so ChatWidgetView.scss can bold it. The rule itself
    // lives in NarratedBubble, shared with the Chat History window.
    const isActionBubble = IsNarratedBubble(chat.styleId, chat.text);
    const formattedText = isActionBubble ? NarratedBubbleText(chat.formattedText) : chat.formattedText;

    // A gang alert is whispered to the recipient's OWN avatar, so the name the
    // bubble would show is theirs, with the real sender buried in the text.
    // Credit the sender and tag the line: "[Gang] Ryan: hello".
    const gangAlert = IsGangAlert(chat.styleId) ? ParseGangAlert(formattedText) : null;
    // A corporation alert (:ca) arrives the same way; "[Corporation] Sana: hello".
    const corpAlert = (!gangAlert && IsCorpAlert(chat.styleId, chat.type, chat.username, chat.text)) ? ParseCorpAlert(formattedText) : null;
    // A staff alert (:sa) too; "[Staff] Ryan: hello".
    const staffAlert = (!gangAlert && !corpAlert && IsStaffAlert(chat.styleId)) ? ParseStaffAlert(formattedText) : null;
    const alert = (gangAlert || corpAlert || staffAlert);
    const displayName = alert ? `${ gangAlert ? GANG_ALERT_PREFIX : corpAlert ? CORP_ALERT_PREFIX : STAFF_ALERT_PREFIX } ${ alert.sender }` : chat.username;
    const displayText = alert ? alert.message : formattedText;

    return (
        <div ref={ elementRef } className={ `bubble-container ${ isVisible ? 'visible' : 'invisible' }` } onClick={ event => GetRoomEngine().selectRoomObject(chat.roomId, chat.senderId, RoomObjectCategory.UNIT) }>
            { (chat.styleId === 0) &&
                <div className="user-container-bg" style={ { backgroundColor: chat.color } } /> }
            <div className={ `chat-bubble bubble-${ chat.styleId } type-${ chat.type }${ isActionBubble ? ' is-action' : '' }` } style={ { maxWidth: getBubbleWidth } }>
                <div className="user-container">
                    { chat.imageUrl && (chat.imageUrl.length > 0) &&
                        <div className="user-image" style={ { backgroundImage: `url(${ chat.imageUrl })` } } /> }
                </div>
                <div className="chat-content">
                    { chat.usernameIcon &&
                        <b className="username mr-1"><UsernameIconGlyph iconClass={ chat.usernameIcon } />{ ' ' }</b> }
                    <b className="username mr-1">{ isActionBubble && '*' }<span style={ chat.usernameColor ? { color: chat.usernameColor } : undefined } dangerouslySetInnerHTML={ { __html: displayName } } />{ isActionBubble ? ' ' : ': ' }</b>
                    <span className="message" dangerouslySetInnerHTML={ { __html: displayText } } />
                </div>
                <div className="pointer" />
            </div>
        </div>
    );
}
