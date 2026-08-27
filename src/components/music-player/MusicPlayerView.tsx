import { RoomObjectCategory } from '@nitrots/nitro-renderer';
import { FC, useCallback, useEffect, useState } from 'react';
import { FaVolumeUp } from 'react-icons/fa';
import { GetRoomEngine } from '../../api';
import { useFurniAddedEvent, useFurniRemovedEvent, useRoom } from '../../hooks';

// PixelRP music player — the panel under the purse that appears whenever a
// Jukebox (jukebox*1) stands in the current room. Interface shell only for
// now: the song/artist/album, queue and volume are placeholders awaiting the
// playback wiring.
const JUKEBOX_CLASS_NAME = 'jukebox*1';

export const MusicPlayerView: FC<{}> = props =>
{
    const [ hasJukebox, setHasJukebox ] = useState(false);
    const [ volume, setVolume ] = useState(50);
    const { roomSession = null } = useRoom();

    const updateJukeboxPresence = useCallback(() =>
    {
        if(!roomSession)
        {
            setHasJukebox(false);

            return;
        }

        const floorObjects = GetRoomEngine().getRoomObjects(roomSession.roomId, RoomObjectCategory.FLOOR);

        setHasJukebox(floorObjects.some(roomObject => (roomObject.type === JUKEBOX_CLASS_NAME)));
    }, [ roomSession ]);

    useEffect(() =>
    {
        updateJukeboxPresence();
    }, [ updateJukeboxPresence ]);

    // Rescan on every furni add/remove — covers placement, pickup and the
    // object stream while a room loads.
    useFurniAddedEvent(!!roomSession, event => updateJukeboxPresence());
    useFurniRemovedEvent(!!roomSession, event => updateJukeboxPresence());

    if(!hasJukebox) return null;

    return (
        <div className="nitro-music-player rounded">
            <div className="music-player-kicker">NOW PLAYING</div>
            <div className="music-player-title">Nothing playing</div>
            <div className="music-player-meta">
                <span className="music-player-artist">Unknown artist</span>
                <span className="music-player-separator">·</span>
                <span className="music-player-album">Unknown album</span>
            </div>
            <div className="music-player-next">
                <span className="music-player-kicker">UP NEXT</span>
                <span className="music-player-next-song">Queue is empty</span>
            </div>
            <div className="music-player-volume">
                <FaVolumeUp className="fa-icon" />
                <input type="range" min={ 0 } max={ 100 } value={ volume } onChange={ event => setVolume(parseInt(event.target.value)) } />
            </div>
        </div>
    );
}
