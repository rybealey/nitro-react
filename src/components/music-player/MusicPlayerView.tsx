import { FC, useState } from 'react';
import { FaVolumeUp } from 'react-icons/fa';
import { useJukebox } from './useJukebox';

// PixelRP music player — the panel under the purse that appears whenever
// the room's jukebox reports itself present. Presence, current track and
// queue are all server-authoritative (see useJukebox); playback is wired
// in a later task, and the queue-add icon opens a window Task 7 mounts.
export const MusicPlayerView: FC<{}> = props =>
{
    const [ volume, setVolume ] = useState(50);
    // Task 7 mounts the add-song window from this state.
    const [ isQueueOpen, setIsQueueOpen ] = useState(false);
    const { present, current, queue } = useJukebox();

    if(!present) return null;

    return (
        <div className="nitro-music-player rounded">
            <div className="music-player-header">
                <div className="music-player-kicker">NOW PLAYING</div>
                <i className="fa-pixel fa-regular fa-plus-large music-player-add" title="Add a song" onClick={ event => setIsQueueOpen(true) } />
            </div>
            <div className="music-player-title">{ current ? current.title : 'Nothing playing' }</div>
            <div className="music-player-meta">
                <span className="music-player-artist">{ current?.author || 'Unknown artist' }</span>
                <span className="music-player-separator">·</span>
                <span className="music-player-album">{ current ? `queued by ${ current.queuedBy }` : 'Unknown album' }</span>
            </div>
            <div className="music-player-next">
                <span className="music-player-kicker">UP NEXT</span>
                <span className="music-player-next-song">{ queue[0] ? queue[0].title : 'Queue is empty' }</span>
            </div>
            <div className="music-player-volume">
                <FaVolumeUp className="fa-icon" />
                <input type="range" min={ 0 } max={ 100 } value={ volume } onChange={ event => setVolume(parseInt(event.target.value)) } />
            </div>
        </div>
    );
}
