import { RoomChatSettings } from '@nitrots/nitro-renderer';
import { FC, useCallback, useEffect, useRef } from 'react';
import { ChatBubbleMessage, DoChatsOverlap, GetConfiguration } from '../../../../api';
import { useChatWidget } from '../../../../hooks';
import IntervalWebWorker from '../../../../workers/IntervalWebWorker';
import { WorkerBuilder } from '../../../../workers/WorkerBuilder';
import { ChatWidgetMessageView } from './ChatWidgetMessageView';

// How long after a bubble lands the scroll step waits, so it is not nudged up as it appears.
const SETTLE_HOLD_MS = 1000;

// pixelrp: no two bubbles left on top of each other. Newest to oldest, every
// older bubble a newer one overlaps goes up above it - older chat always sits
// higher - and again until nothing moves, so a bubble pushed into a third
// moves that one too. Stock only checked the chain the newest bubble pushed
// directly, so an overlap already on screen stayed until it scrolled away.
// Bubbles not measured yet (no size) are left alone.
export const SettleChats = (chats: ChatBubbleMessage[]) =>
{
    for(let pass = 0; pass < 10; pass++)
    {
        let moved = false;

        for(let i = (chats.length - 1); i > 0; i--)
        {
            const newer = chats[i];

            if(!newer.width || !newer.height) continue;

            for(let j = (i - 1); j >= 0; j--)
            {
                const older = chats[j];

                if(!older.width || !older.height || !DoChatsOverlap(newer, older, 0)) continue;

                // one pixel clear, so the pair no longer counts as touching
                older.top = (newer.top - older.height - 1);
                moved = true;
            }
        }

        if(!moved) return;
    }
}

export const ChatWidgetView: FC<{}> = props =>
{
    const { chatMessages = [], setChatMessages = null, chatSettings = null, getScrollSpeed = 6000 } = useChatWidget();
    const elementRef = useRef<HTMLDivElement>();

    const removeHiddenChats = useCallback(() =>
    {
        setChatMessages(prevValue =>
        {
            if(prevValue)
            {
                const newMessages = prevValue.filter(chat => ((chat.top > (-(chat.height) * 2))));

                if(newMessages.length !== prevValue.length) return newMessages;
            }

            return prevValue;
        })
    }, [ setChatMessages ]);

    // When a bubble was last placed - the scroll step holds back for a moment
    // after one lands, so a new bubble is not nudged up as it appears.
    const lastPlacedRef = useRef<number>(0);

    const makeRoom = useCallback((chat: ChatBubbleMessage) =>
    {
        if(chatSettings.mode === RoomChatSettings.CHAT_MODE_FREE_FLOW)
        {
            lastPlacedRef.current = Date.now();

            setChatMessages(prevValue =>
            {
                if(prevValue) SettleChats(prevValue);

                return prevValue;
            });

            removeHiddenChats();
        }
        else
        {
            const lowestPoint = (chat.top + chat.height);
            const requiredSpace = chat.height;
            const spaceAvailable = (elementRef.current.offsetHeight - lowestPoint);
            const amount = (requiredSpace - spaceAvailable);

            if(spaceAvailable < requiredSpace)
            {
                setChatMessages(prevValue =>
                {
                    prevValue.forEach(prevChat =>
                    {
                        if(prevChat === chat) return;

                        prevChat.top -= amount;
                    });

                    return prevValue;
                });

                removeHiddenChats();
            }
        }
    }, [ chatSettings, removeHiddenChats, setChatMessages ]);

    useEffect(() =>
    {
        const resize = (event: UIEvent = null) =>
        {
            if(!elementRef || !elementRef.current) return;

            const currentHeight = elementRef.current.offsetHeight;
            const newHeight = Math.round(document.body.offsetHeight * GetConfiguration<number>('chat.viewer.height.percentage'));

            elementRef.current.style.height = `${ newHeight }px`;

            setChatMessages(prevValue =>
            {
                if(prevValue)
                {
                    prevValue.forEach(chat => (chat.top -= (currentHeight - newHeight)));
                }
    
                return prevValue;
            });
        }

        window.addEventListener('resize', resize);

        resize();

        return () =>
        {
            window.removeEventListener('resize', resize);
        }
    }, [ setChatMessages ]);

    useEffect(() =>
    {
        const moveAllChatsUp = (amount: number) =>
        {
            // pixelrp: every bubble moves, or none does. Stock let a bubble
            // that had just been placed or pushed sit one step out while the
            // rest went up 15px, which slid bubbles beside it half a bubble
            // into each other. Now a bubble placed in the last moment holds
            // the whole chat back one step instead.
            if((Date.now() - lastPlacedRef.current) < SETTLE_HOLD_MS) return;

            setChatMessages(prevValue =>
            {
                prevValue.forEach(chat => (chat.top -= amount));

                return prevValue;
            });

            removeHiddenChats();
        }

        const worker = new WorkerBuilder(IntervalWebWorker);

        worker.onmessage = () => moveAllChatsUp(15);

        worker.postMessage({ action: 'START', content: getScrollSpeed });

        return () =>
        {
            worker.postMessage({ action: 'STOP' });
        }
    }, [ getScrollSpeed, removeHiddenChats, setChatMessages ]);

    return (
        <div ref={ elementRef } className="nitro-chat-widget">
            { chatMessages.map(chat => <ChatWidgetMessageView key={ chat.id } chat={ chat } makeRoom={ makeRoom } bubbleWidth={ chatSettings.weight } />) }
        </div>
    );
}
