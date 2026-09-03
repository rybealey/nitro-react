import { RoomChatSettings, RoomObjectCategory } from '@nitrots/nitro-renderer';
import { FC, useEffect, useMemo, useRef, useState } from 'react';
import { ChatBubbleMessage, GetRoomEngine } from '../../../../api';
import { UsernameIconGlyph } from '../../../rp-settings/UsernameIconGlyph';

interface ChatWidgetMessageViewProps
{
    chat: ChatBubbleMessage;
    makeRoom: (chat: ChatBubbleMessage) => void;
    bubbleWidth?: number;
}

// Chat styles whose asterisk-wrapped messages render as an action: 4 is the
// blue combat bubble, 5 the yellow one used when a backpack item is consumed.
const ACTION_BUBBLE_STYLES: number[] = [ 4, 5 ];

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

    // Action bubbles arrive as *action text*. Move that opening marker ahead of
    // the username so the whole line reads *Username action text*, and mark the
    // bubble so ChatWidgetView.scss can bold it.
    //
    // Two styles qualify: 4, the blue bubble every combat action uses, and 5,
    // the yellow one a consumed backpack item announces itself with (the passive
    // smoothie, a VIP token). They are the same KIND of message - the player
    // doing something, narrated in the third person - so they read the same.
    //
    // The asterisk test is what makes this safe: either style may also be a
    // player-selectable chat style, and ordinary chat in one must stay plain.
    const isActionBubble = (ACTION_BUBBLE_STYLES.includes(chat.styleId) && chat.text.startsWith('*') && chat.text.endsWith('*'));
    const formattedText = isActionBubble ? chat.formattedText.substring(1) : chat.formattedText;

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
                    <b className="username mr-1">{ isActionBubble && '*' }<span style={ chat.usernameColor ? { color: chat.usernameColor } : undefined } dangerouslySetInnerHTML={ { __html: chat.username } } />{ isActionBubble ? ' ' : ': ' }</b>
                    <span className="message" dangerouslySetInnerHTML={ { __html: formattedText } } />
                </div>
                <div className="pointer" />
            </div>
        </div>
    );
}
