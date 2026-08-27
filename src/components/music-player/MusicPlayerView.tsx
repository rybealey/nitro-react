import { FC, useState } from 'react';
import { FaVolumeUp } from 'react-icons/fa';
import { JukeboxYoutubePlayer } from './JukeboxYoutubePlayer';
import { useJukebox } from './useJukebox';

const VOLUME_STORAGE_KEY = 'pixelrp.jukebox.volume';

const getStoredVolume = () =>
{
    try
    {
        const stored = parseInt(localStorage.getItem(VOLUME_STORAGE_KEY));

        if(!isNaN(stored)) return Math.min(100, Math.max(0, stored));
    }
    catch(e) { }

    return 50;
}

// PixelRP music player — the panel under the purse that appears whenever
// the room's jukebox reports itself present. Presence, current track and
// queue are all server-authoritative (see useJukebox); the queue-add icon
// opens a window Task 7 mounts.
export const MusicPlayerView: FC<{}> = props =>
{
    const [ volume, setVolume ] = useState(getStoredVolume);
    const [ expanded, setExpanded ] = useState(false);
    // Task 7 mounts the add-song window from this state.
    const [ isQueueOpen, setIsQueueOpen ] = useState(false);
    const { present, current, queue } = useJukebox();

    const updateVolume = (value: number) =>
    {
        setVolume(value);

        try { localStorage.setItem(VOLUME_STORAGE_KEY, value.toString()); }
        catch(e) { }
    }

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
                <input type="range" min={ 0 } max={ 100 } value={ volume } onChange={ event => updateVolume(parseInt(event.target.value)) } />
            </div>
            { current &&
                <JukeboxYoutubePlayer current={ current } volume={ volume } expanded={ expanded } /> }
            { current &&
                <div className="music-player-expand" onClick={ event => setExpanded(value => !value) }>{ expanded ? 'Shrink video' : 'Expand video' }</div> }
        </div>
    );
}
