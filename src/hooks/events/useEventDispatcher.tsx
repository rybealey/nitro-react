import { IEventDispatcher, NitroEvent } from '@nitrots/nitro-renderer';
import { useEffect, useRef } from 'react';

export const useEventDispatcher = <T extends NitroEvent>(type: string | string[], eventDispatcher: IEventDispatcher, handler: (event: T) => void, enabled: boolean = true) =>
{
    // pixelrp (Twist, 2026-10-29): added once, calling whatever handler the
    // latest draw passed - not taken off and added again on every draw because
    // an inline handler (or an inline list of types) is new each time. The
    // list of types counts as changed only when the names in it do.
    const handlerRef = useRef(handler);
    const typesKey = Array.isArray(type) ? type.join('\n') : type;

    handlerRef.current = handler;

    useEffect(() =>
    {
        if(!enabled) return;

        const types = typesKey ? typesKey.split('\n') : [];
        const listener = (event: T) => handlerRef.current?.(event);

        types.forEach(name => eventDispatcher.addEventListener(name, listener));

        return () => types.forEach(name => eventDispatcher.removeEventListener(name, listener));
    }, [ typesKey, eventDispatcher, enabled ]);
}
