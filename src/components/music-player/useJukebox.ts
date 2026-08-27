import { RpJukeboxStateEvent } from '@nitrots/nitro-renderer';
import { useEffect, useState } from 'react';
import { useMessageEvent, useRoom } from '../../hooks';

export interface JukeboxCurrent { videoId: string; title: string; author: string; durationSec: number; startedAtMs: number; queuedBy: string; }
export interface JukeboxQueueEntry { videoId: string; title: string; author: string; queuedBy: string; }

// Server-authoritative jukebox state. Timing arrives as elapsed seconds;
// we anchor it to the local clock on receipt so the player can seek.
export const useJukebox = () =>
{
    const [ present, setPresent ] = useState(false);
    const [ current, setCurrent ] = useState<JukeboxCurrent | null>(null);
    const [ queue, setQueue ] = useState<JukeboxQueueEntry[]>([]);
    const { roomSession = null } = useRoom();

    useMessageEvent<RpJukeboxStateEvent>(RpJukeboxStateEvent, event =>
    {
        const parser = event.getParser();

        setPresent(parser.present);
        setCurrent(parser.current ? {
            videoId: parser.current.videoId,
            title: parser.current.title,
            author: parser.current.author,
            durationSec: parser.current.durationSec,
            startedAtMs: (Date.now() - (parser.current.elapsedSec * 1000)),
            queuedBy: parser.current.queuedBy
        } : null);
        setQueue(parser.queue);
    });

    useEffect(() =>
    {
        if(roomSession) return;

        // No room: hide the panel. Room-to-room switches need no client reset —
        // the server pushes a fresh state packet in every room's entry burst
        // (and that packet can arrive BEFORE roomSession updates, so wiping on
        // every change would race it and lose the just-received state).
        setPresent(false);
        setCurrent(null);
        setQueue([]);
    }, [ roomSession ]);

    return { present, current, queue };
}
