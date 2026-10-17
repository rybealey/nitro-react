import { FC, useEffect, useState } from 'react';
import { Flex, Text } from '../../common';

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

        fetchCount();

        const interval = setInterval(fetchCount, POLL_INTERVAL_MS);

        return () =>
        {
            disposed = true;

            clearInterval(interval);
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
