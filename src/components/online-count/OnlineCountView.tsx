import { FC, useEffect, useState } from 'react';
import { Flex, Text } from '../../common';

const POLL_INTERVAL_MS = 30000;

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

    return (
        <Flex justifyContent="end" className="nitro-online-count rounded-bottom p-1 px-2">
            <Text variant="white" className="text-nowrap"><b>{ onlineCount }</b> online</Text>
        </Flex>
    );
}
