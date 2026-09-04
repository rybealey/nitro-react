import { RoomEngineTriggerWidgetEvent } from '@nitrots/nitro-renderer';
import React, { FC, useState } from 'react';
import { FaVolumeMute, FaVolumeUp } from 'react-icons/fa';
import { GetRoomEngine, SendMessageComposer } from '../../api';
import { useRoomEngineEvent } from '../../hooks';
import { JukeboxYoutubePlayer } from './JukeboxYoutubePlayer';
import { SiriView } from './SiriView';
import { SiriWave } from './SiriWave';
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
        { /* The compact strip: Siri's plate (light, black border, gloss stripe)
             under a soft turning halo, the video's own art on the left, the
             waveform chip beside the kicker, volume and the QUEUE chip on one
             row. No play/skip - the room's jukebox decides what plays. */ }
        <div className={ `nitro-music-player${ current ? '' : ' is-idle' }` }>
            <div className="music-player-halo" />
            <div className="music-player-plate">
                <div className="music-player-row">
                    <div className="music-player-art">
                        { current
                            ? <img src={ `https://i.ytimg.com/vi/${ current.videoId }/mqdefault.jpg` } alt="" draggable={ false } />
                            : <div className="music-player-art-empty" /> }
                    </div>
                    <div className="music-player-info">
                        <div className="music-player-kicker-row">
                            <SiriWave className="music-player-wave" />
                            <span className="music-player-kicker">{ current ? 'NOW PLAYING' : 'NOTHING PLAYING' }</span>
                        </div>
                        <div className="music-player-title" title={ current ? `${ current.title }${ current.author ? ` - ${ current.author }` : '' }` : '' }>{ current ? current.title : 'Queue a song to get started' }</div>
                    </div>
                </div>
                <div className="music-player-controls">
                    { /* react-icons svgs are React-managed, so a direct onClick is
                         safe here (unlike the FA kit's swapped-in icons) */ }
                    { muted
                        ? <FaVolumeMute className="fa-icon music-player-mute is-muted" title="Unmute" onClick={ toggleMuted } />
                        : <FaVolumeUp className="fa-icon music-player-mute" title="Mute" onClick={ toggleMuted } /> }
                    <input type="range" min={ 0 } max={ 100 } value={ volume } style={ { '--fill': `${ volume }%` } as React.CSSProperties }
                        onChange={ event => updateVolume(parseInt(event.target.value)) } />
                    { /* also an entry point to Siri (same as double-clicking the
                         jukebox furni); the count shows what's waiting */ }
                    <span className="music-player-queue" title={ queue[0] ? `Up next: ${ queue[0].title }` : 'Queue a song' } onClick={ event => setIsSiriOpen(true) }>
                        <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M6 1.5v9M1.5 6h9" /></svg>
                        { queue.length ? `${ queue.length } QUEUED` : 'QUEUE' }
                    </span>
                </div>
                { current &&
                    <JukeboxYoutubePlayer current={ current } volume={ volume } muted={ muted } /> }
            </div>
        </div>
            { /* fixed-position popover above the chat bar; lives outside the
                 sliding panel so it stays reachable while the panel is slid
                 away */ }
            { isSiriOpen &&
                <SiriView onClose={ () => setIsSiriOpen(false) } /> }
        </div>
    );
}
