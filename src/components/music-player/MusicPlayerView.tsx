import { RoomEngineTriggerWidgetEvent } from '@nitrots/nitro-renderer';
import React, { FC, useEffect, useState } from 'react';
import { FaVolumeMute, FaVolumeUp } from 'react-icons/fa';
import { CreateLinkEvent, GetRoomEngine } from '../../api';
import { useRoomEngineEvent } from '../../hooks';
import { FormatClock, SetJukeboxMuted, SetJukeboxRoomPaused, SetJukeboxVolume, useJukeboxPrefs, useJukeboxState } from './JukeboxStore';
import { PhoneMarquee } from '../phone/PhoneMarquee';
import { useSitchSong, useSitchSongPaused } from './SitchSongStore';
import { SiriView } from './SiriView';
import { SiriWave } from './SiriWave';

// PixelRP music player — the panel under the purse that appears whenever
// the room's jukebox reports itself present. Presence, current track and
// queue are all server-authoritative (see useJukebox); double-clicking the
// jukebox furniture summons Siri (the chat-bar link popover).
export const MusicPlayerView: FC<{}> = props =>
{
    const [ isSiriOpen, setIsSiriOpen ] = useState(false);
    const [ now, setNow ] = useState(() => Date.now());
    const { present, current, queue } = useJukeboxState();
    // volume and mute are shared with the phone's Music app; the audio itself
    // plays from JukeboxAudioEngine (mounted once at the root), never here
    const { volume, muted, roomPaused } = useJukeboxPrefs();
    // A song of your own already silences the room's track - the audio engine
    // yields to it. The speaker showing anything else would be describing sound
    // nobody is hearing.
    const personal = useSitchSong();
    const personalPaused = useSitchSongPaused();
    // only while it is actually PLAYING: paused, the room has its sound back
    const songHasEars = (!!personal && !personalPaused);
    // THREE ways to be hearing nothing, and this panel used to know about one.
    // roomPaused is saved and survives a logout, so a pause from days ago could
    // leave a player silent with a normal-looking speaker and a track playing
    // happily beside it - nothing on screen said why, and the only way out was
    // the phone. One fact, shown wherever it is true.
    const silenced = (muted || roomPaused || songHasEars);
    // A slider at the bottom is silence too, so the speaker says so. Kept apart
    // from `silenced` on purpose: that one decides what a CLICK does, and
    // lifting a mute you never set would leave the volume at zero and the sound
    // still off - a button that appears to do nothing.
    const looksSilent = (silenced || (volume === 0));

    // Double-clicking the jukebox summons Siri. The renderer's jukebox
    // furni logic swallows the generic double-click and fires the
    // playlist-editor trigger instead — the stock trax editor is retired
    // (see FurnitureWidgetsView), so that trigger is ours. Room objects
    // carry the color-stripped classname ('jukebox' for jukebox*1).
    useRoomEngineEvent<RoomEngineTriggerWidgetEvent>(RoomEngineTriggerWidgetEvent.REQUEST_PLAYLIST_EDITOR, event =>
    {
        const roomObject = GetRoomEngine().getRoomObject(event.roomId, event.objectId, event.category);

        // Either end saying yes is enough to OPEN it - the classname the
        // renderer fires this for, or the server's own present flag, which is
        // what a builder gets by giving some other furni the jukebox behaviour.
        // Siri itself refuses the link when the server says no, so opening
        // generously costs nothing and reaches both.
        if(roomObject && ((roomObject.type === 'jukebox') || present)) setIsSiriOpen(true);
    });

    // Reaching for the volume is reaching to HEAR something: it lifts a mute and
    // a pause rather than sliding a control on silence. Your own song is left
    // alone - it holds the ears deliberately, and taking them back should be a
    // press on the song, not a nudge of a slider meant for the room.
    const listenAgain = () =>
    {
        if(muted) SetJukeboxMuted(false);
        if(roomPaused) SetJukeboxRoomPaused(false);
    }

    // A second hand, only while there is something to count. The server sends
    // when the track started and how long it is; the rest is arithmetic, so
    // there is nothing to ask anybody - just a reason to re-read the clock.
    useEffect(() =>
    {
        if(!current) return;

        const timer = window.setInterval(() => setNow(Date.now()), 1000);

        return () => window.clearInterval(timer);
    }, [ current?.videoId ]);

    const elapsed = (current ? Math.max(0, (now - current.startedAtMs) / 1000) : 0);
    const duration = (current?.durationSec ?? 0);
    // Capped at the duration so a track that has run over does not read past its
    // own end while the server works out that it is finished.
    const clock = (current
        ? ((duration > 0)
            ? `${ FormatClock(Math.min(elapsed, duration)) } / ${ FormatClock(duration) }`
            : FormatClock(elapsed))
        : '');

    const updateVolume = (value: number) =>
    {
        SetJukeboxVolume(value);
        listenAgain();
    }

    const toggleMuted = () => (silenced ? listenAgain() : SetJukeboxMuted(true));

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
                            { /* In the kicker's own row, so the panel gains a
                                 readout without gaining a line. */ }
                            { !!clock && <span className="music-player-clock">{ clock }</span> }
                        </div>
                        { /* Scrolls when it does not fit, the same component the
                             phone uses - its styles moved out of the phone's scope
                             so this panel could have them. */ }
                        <PhoneMarquee className="music-player-title" text={ current ? current.title : 'Queue a song to get started' } />
                    </div>
                </div>
                <div className="music-player-controls">
                    { /* Always here. It used to disappear whenever the phone was
                         tuned in, replaced by a Phone label saying to pause it
                         there - which was true only because mute was being
                         overridden in that state. One mute now, so the button
                         that sets it is always the button that sets it.

                         react-icons svgs are React-managed, so a direct onClick
                         is safe here (unlike the FA kit's swapped-in icons) */ }
                    { looksSilent
                        ? <FaVolumeMute
                            className={ `fa-icon music-player-mute is-muted${ songHasEars ? ' is-forced' : '' }` }
                            title={ songHasEars ? 'Your own song is playing - pause it to hear the room' : (roomPaused ? 'Paused - click to listen again' : 'Unmute') }
                            onClick={ songHasEars ? undefined : toggleMuted } />
                        : <FaVolumeUp className="fa-icon music-player-mute" title="Mute" onClick={ toggleMuted } /> }
                    <input type="range" min={ 0 } max={ 100 } value={ volume } style={ { '--fill': `${ volume }%` } as React.CSSProperties }
                        onChange={ event => updateVolume(parseInt(event.target.value)) } />
                    { /* A READOUT, not a button. It used to open the paste box,
                         which is now the jukebox furni's job alone - this only
                         says how many are waiting, and only when any are. An
                         empty queue has nothing to report, so it is not there to
                         be pressed at all. */ }
                    { /* Opens the phone on this room's queue. Still cannot ADD a
                         song - that is the furni's job - but looking at a list is
                         not adding, so it is pressable again and says so. */ }
                    { (queue.length > 0) &&
                        <span className="music-player-queue" title={ `Up next: ${ queue[0].title }` } onClick={ event => CreateLinkEvent('phone/music-queue') }>
                            { queue.length } QUEUED
                        </span> }
                </div>
                { /* One line, no artwork: the track above is the one with a
                     picture, and a second thumbnail for a song nobody is
                     hearing yet would compete with it. The label reuses the
                     NOW PLAYING kicker rather than inventing a second idea of
                     what a small label looks like. */ }
                { (queue.length > 0) &&
                    <div className="music-player-next">
                        <span className="music-player-kicker">UP NEXT</span>
                        <PhoneMarquee className="music-player-next-title" text={ queue[0].title } />
                    </div> }
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
