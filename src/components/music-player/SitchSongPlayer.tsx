import { FC, useEffect, useRef, useState } from 'react';
import { GetJukeboxPrefs, useJukeboxPrefs } from './JukeboxStore';
import { loadIframeApi } from './JukeboxYoutubePlayer';
import { AdvanceSitchSong, GetSitchRepeat, SetSitchPlayback, SetSitchSongControls, SetSitchSongMeta, useSitchSong } from './SitchSongStore';

// The one place a profile's favorite song is heard. Mounted at the app root
// beside JukeboxAudioEngine, for the same reason that one is: audio should not
// stop because the phone closed or the player walked into another room.
//
// A separate player from the jukebox's on purpose. JukeboxYoutubePlayer reports
// duration and end-of-track to the room's station, and a personal song reporting
// into the shared queue would advance a track nobody else has finished. The two
// share only the IFrame API loader.
export const SitchSongPlayer: FC<{}> = props =>
{
    const song = useSitchSong();
    const { songVolume, songMuted } = useJukeboxPrefs();
    const containerRef = useRef<HTMLDivElement>(null);
    const playerRef = useRef<any>(null);
    const loadedVideoIdRef = useRef<string>(null);
    const [ needsUnmute, setNeedsUnmute ] = useState(false);

    useEffect(() =>
    {
        if(!song) return;

        let disposed = false;

        loadIframeApi().then(() =>
        {
            if(disposed || !containerRef.current) return;

            playerRef.current = new (window as any).YT.Player(containerRef.current, {
                width: '100%', height: '100%',
                playerVars: { autoplay: 1, controls: 0, disablekb: 1, rel: 0 },
                events: {
                    onReady: () =>
                    {
                        playerRef.current.unMute?.();
                        // Its OWN volume, not the room's. They are different
                        // sounds that can play at different moments, and turning
                        // the room down to hear this over it is exactly what one
                        // shared slider made impossible.
                        playerRef.current.setVolume?.(GetJukeboxPrefs().songVolume);
                        playerRef.current.loadVideoById?.({ videoId: song.videoId });
                        loadedVideoIdRef.current = song.videoId;

                        // The screen's play/pause reaches the iframe through
                        // this. Registered on ready and dropped on unmount, so a
                        // button pressed after the song stopped reaches nothing.
                        SetSitchSongControls({
                            toggle: () =>
                            {
                                const state = playerRef.current?.getPlayerState?.();

                                if(state === (window as any).YT.PlayerState.PLAYING) playerRef.current?.pauseVideo?.();
                                else playerRef.current?.playVideo?.();
                            }
                        });
                    },
                    // A song the player chose to start is not autoplay, but the
                    // browser does not know that. Fall back the way the station
                    // does rather than playing nothing.
                    onAutoplayBlocked: () =>
                    {
                        playerRef.current?.mute?.();
                        playerRef.current?.playVideo?.();
                        setNeedsUnmute(true);
                    },
                    onStateChange: (event: any) =>
                    {
                        if(event.data === (window as any).YT.PlayerState.ENDED)
                        {
                            // Repeat is about THIS song, so it wins over the
                            // queue - seek and play rather than reload, which
                            // would buffer the whole video again for a song the
                            // player already has.
                            if(GetSitchRepeat())
                            {
                                playerRef.current?.seekTo?.(0, true);
                                playerRef.current?.playVideo?.();
                            }
                            // otherwise the next one of yours, or silence and
                            // the room back
                            else AdvanceSitchSong();
                        }
                        if(event.data === (window as any).YT.PlayerState.PLAYING)
                        {
                            if(!playerRef.current?.isMuted?.()) setNeedsUnmute(false);

                            // Read once it is actually playing: the data is not
                            // populated until the video has loaded, so asking on
                            // ready gets an empty title.
                            const data = playerRef.current?.getVideoData?.();

                            if(data?.video_id) SetSitchSongMeta(data.video_id, data.title, data.author);
                        }
                    },
                    // Private, removed or embed-disabled. Skip it the way an
                    // ended song is skipped, so one dead link in a queue does
                    // not end the whole session.
                    onError: () => AdvanceSitchSong()
                }
            });
        });

        // Where the song has got to, once a second, for the progress bar. Read
        // off the player rather than counted here: a pause, a buffer or a seek
        // all move it, and only the player knows about any of them.
        const clock = window.setInterval(() =>
        {
            const player = playerRef.current;

            if(!player?.getDuration) return;

            SetSitchPlayback({
                elapsedSec: Math.floor(player.getCurrentTime?.() ?? 0),
                durationSec: Math.floor(player.getDuration?.() ?? 0),
                paused: (player.getPlayerState?.() === (window as any).YT.PlayerState.PAUSED)
            });
        }, 1000);

        return () =>
        {
            window.clearInterval(clock);
            SetSitchSongControls(null);
            SetSitchPlayback({ elapsedSec: 0, durationSec: 0, paused: false });
            disposed = true;
            playerRef.current?.destroy?.();
            playerRef.current = null;
            loadedVideoIdRef.current = null;
            setNeedsUnmute(false);
        }
        // song itself is out of the deps on purpose: this effect BUILDS the
        // player, and re-running it on anything but a different song would tear
        // down a playing one and start it again from zero.
    }, [ song?.videoId, song?.userId ]); // eslint-disable-line react-hooks/exhaustive-deps

    // Volume and mute applied as they CHANGE. Its own effect on purpose: the one
    // above is keyed on the SONG, so setting them there meant the slider moved
    // and nothing happened until the next track - the value was read once at
    // load and never read again.
    useEffect(() =>
    {
        const player = playerRef.current;

        if(!player) return;

        player.setVolume?.(songVolume);

        if(songMuted) player.mute?.();
        else player.unMute?.();
    }, [ songVolume, songMuted, song?.videoId ]);

    if(!song) return null;

    const unmute = () =>
    {
        playerRef.current?.unMute?.();
        playerRef.current?.setVolume?.(GetJukeboxPrefs().songVolume);
        playerRef.current?.playVideo?.();
        setNeedsUnmute(false);
    }

    return (
        <>
            <div className="jukebox-player-hidden" aria-hidden="true">
                <div ref={ containerRef } className="jukebox-player-frame" />
            </div>
            { needsUnmute &&
                <div className="jukebox-unmute-toast" onClick={ unmute }>Tap to unmute the music</div> }
        </>
    );
}
