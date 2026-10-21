import { FC, useEffect, useState } from 'react';
import { Flex, Text } from '../../common';

// nginx answers everyone from one count for 10s (the CMS counts fresh behind
// it), so asking every 10s keeps the HUD within about 20s of the hotel without
// costing the server more however many play. Not while the tab is hidden; on
// coming back it is asked for straight away.
const POLL_INTERVAL_MS = 10000;

export const OnlineCountView: FC<{}> = props =>
{
    const [ onlineCount, setOnlineCount ] = useState<number>(null);

    useEffect(() =>
    {
        let disposed = false;

        const fetchCount = () => fetch('/api/online-count')
            .then(response => response.json())
            .then(response => { if(!disposed && (typeof response?.data?.onlineCount === 'number')) setOnlineCount(response.data.onlineCount); })
            .catch(() => {});

        const onVisibilityChange = () =>
        {
            if(document.visibilityState === 'visible') fetchCount();
        };

        fetchCount();

        const interval = setInterval(() =>
        {
            if(document.visibilityState === 'visible') fetchCount();
        }, POLL_INTERVAL_MS);

        document.addEventListener('visibilitychange', onVisibilityChange);

        return () =>
        {
            disposed = true;

            clearInterval(interval);
            document.removeEventListener('visibilitychange', onVisibilityChange);
        }
    }, []);

    if(onlineCount === null) return null;

    // pixelrp: an orange pixel person in place of the word "online" (Twist,
    // 2026-10-18; design: the "Online count icon" canvas, A). The word stays
    // for screen readers and in the hover title.
    return (
        <Flex justifyContent="end" alignItems="center" className="nitro-online-count rounded-bottom p-1 px-2" title={ `${ onlineCount } online` }>
            <span className="online-count-icon" aria-hidden="true" />
            <Text variant="white" className="text-nowrap"><b>{ onlineCount }</b><span className="visually-hidden"> online</span></Text>
        </Flex>
    );
}
