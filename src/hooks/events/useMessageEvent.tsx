import { IMessageEvent, MessageEvent } from '@nitrots/nitro-renderer';
import { useEffect, useRef } from 'react';
import { GetCommunication } from '../../api';

export const useMessageEvent = <T extends IMessageEvent>(eventType: typeof MessageEvent, handler: (event: T) => void) =>
{
    // pixelrp (Twist, 2026-10-29): registered once, calling whatever handler
    // the latest draw passed. The handler is nearly always written inline, so
    // it is a new function every draw - and with it in the effect's list,
    // every draw took the listener down and put up a new one (a new
    // MessageEvent and parser each time): the chat's six on every chat line.
    const handlerRef = useRef(handler);

    handlerRef.current = handler;

    useEffect(() =>
    {
        //@ts-ignore
        const event = new eventType((message: T) => handlerRef.current?.(message));

        GetCommunication().registerMessageEvent(event);

        return () => GetCommunication().removeMessageEvent(event);
    }, [ eventType ]);
}
