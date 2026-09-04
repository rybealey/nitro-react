import { RoomEngineTriggerWidgetEvent, RpJukeboxSkipComposer } from '@nitrots/nitro-renderer';
import { FC, useState } from 'react';
import { FaForward, FaVolumeMute, FaVolumeUp } from 'react-icons/fa';
import { GetRoomEngine, SendMessageComposer } from '../../api';
import { useRoomEngineEvent } from '../../hooks';
import { JukeboxYoutubePlayer } from './JukeboxYoutubePlayer';
import { SiriView } from './SiriView';
import { useJukebox } from './useJukebox';

const VOLUME_STORAGE_KEY = 'pixelrp.jukebox.volume';
const MUTED_STORAGE_KEY = 'pixelrp.jukebox.muted';

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

const getStoredMuted = () =>
{
    try { return localStorage.getItem(MUTED_STORAGE_KEY) === 'true'; }
    catch(e) { return false; }
}

// PixelRP music player — the panel under the purse that appears whenever
// the room's jukebox reports itself present. Presence, current track and
// queue are all server-authoritative (see useJukebox); double-clicking the
// jukebox furniture summons Siri (the chat-bar link popover).
export const MusicPlayerView: FC<{}> = props =>
{
    const [ volume, setVolume ] = useState(getStoredVolume);
    const [ muted, setMuted ] = useState(getStoredMuted);
    const [ isSiriOpen, setIsSiriOpen ] = useState(false);
    const { present, current, queue } = useJukebox();

    // Double-clicking the jukebox summons Siri. The renderer's jukebox
    // furni logic swallows the generic double-click and fires the
    // playlist-editor trigger instead — the stock trax editor is retired
    // (see FurnitureWidgetsView), so that trigger is ours. Room objects
    // carry the color-stripped classname ('jukebox' for jukebox*1).
    useRoomEngineEvent<RoomEngineTriggerWidgetEvent>(RoomEngineTriggerWidgetEvent.REQUEST_PLAYLIST_EDITOR, event =>
    {
        const roomObject = GetRoomEngine().getRoomObject(event.roomId, event.objectId, event.category);

        if(roomObject && (roomObject.type === 'jukebox')) setIsSiriOpen(true);
    });

    const updateVolume = (value: number) =>
    {
        setVolume(value);

        try { localStorage.setItem(VOLUME_STORAGE_KEY, value.toString()); }
        catch(e) { }
    }

    const toggleMuted = () =>
    {
        setMuted(prevValue =>
        {
            try { localStorage.setItem(MUTED_STORAGE_KEY, (!prevValue).toString()); }
            catch(e) { }

            return !prevValue;
        });
    }

    // The panel slides in only while something is queued or playing; the
    // double-click hook and Siri stay live while it's hidden so the first
    // song can always be queued.
    const active = (present && (!!current || (queue.length > 0)));

    return (
        <div className={ `nitro-music-player-slide${ active ? ' is-active' : '' }` }>
        <div className="nitro-music-player rounded">
            <div className="music-player-kicker">NOW PLAYING</div>
            <div className="music-player-title-row">
                <div className="music-player-title">{ current ? current.title : 'Nothing playing' }</div>
                { /* Skip lived in the retired queue window; rights are
                     enforced server-side, the packet is a no-op without them */ }
                { current &&
                    <FaForward className="fa-icon music-player-skip" title="Skip (room rights)" onClick={ event => SendMessageComposer(new RpJukeboxSkipComposer()) } /> }
            </div>
            { /* also an entry point to Siri (same as double-clicking the
                 jukebox furni) */ }
            <div className="music-player-next" title="Queue a song" onClick={ event => setIsSiriOpen(true) }>
                <span className="music-player-kicker">{ queue[0] ? 'UP NEXT' : 'NOTHING ELSE QUEUED' }</span>
                { queue[0] &&
                    <span className="music-player-next-song">{ queue[0].title }</span> }
            </div>
            <div className="music-player-volume">
                { /* react-icons svgs are React-managed, so a direct onClick is
                     safe here (unlike the FA kit's swapped-in icons) */ }
                { muted
                    ? <FaVolumeMute className="fa-icon music-player-mute is-muted" title="Unmute" onClick={ toggleMuted } />
                    : <FaVolumeUp className="fa-icon music-player-mute" title="Mute" onClick={ toggleMuted } /> }
                <input type="range" min={ 0 } max={ 100 } value={ volume } onChange={ event => updateVolume(parseInt(event.target.value)) } />
            </div>
            { current &&
                <JukeboxYoutubePlayer current={ current } volume={ volume } muted={ muted } /> }
        </div>
            { /* fixed-position popover above the chat bar; lives outside the
                 sliding panel so it stays reachable while the panel is slid
                 away */ }
            { isSiriOpen &&
                <SiriView onClose={ () => setIsSiriOpen(false) } /> }
        </div>
    );
}
