import { FC, useEffect, useRef, useState } from 'react';
import { GetJukeboxPrefs, useJukeboxPrefs } from './JukeboxStore';
import { loadIframeApi } from './JukeboxYoutubePlayer';
import { GetJamState, ReportJam, useJamState } from './JamStore';
import { AdvanceSitchSong, GetSitchRepeat, GetSitchSong, SetSitchPlayback, SetSitchSongMeta, useSitchSong, useSitchSongPaused } from './SitchSongStore';

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
    const songPaused = useSitchSongPaused();
    // The HOST's pause is everyone's, so it stops this player too. Your own
    // pause is still your own: a guest pressing pause silences themselves and
    // leaves the other four listening, which is the only pause a guest is
    // given - see JamSession.TrySetPaused on the server.
    const jam = useJamState();
    const jamPaused = (!!song?.jamId && jam.paused);
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
                        // startSeconds is how a guest joins mid-song: the jam
                        // says where it is, and the player opens there.
                        playerRef.current.loadVideoById?.({ videoId: song.videoId, startSeconds: (song.startAtSec || 0) });
                        loadedVideoIdRef.current = song.videoId;

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
                            // A JAM's timeline is not yours to advance, and
                            // repeat has no meaning on one five people share -
                            // so the end is REPORTED and the server decides
                            // what everybody hears next.
                            if(GetSitchSong()?.jamId) ReportJam(0, true);
                            // Repeat is about THIS song, so it wins over the
                            // queue - seek and play rather than reload, which
                            // would buffer the whole video again for a song the
                            // player already has.
                            else if(GetSitchRepeat())
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
                    onError: () => (GetSitchSong()?.jamId ? ReportJam(0, true) : AdvanceSitchSong())
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

            const elapsedSec = Math.floor(player.getCurrentTime?.() ?? 0);
            const durationSec = Math.floor(player.getDuration?.() ?? 0);

            SetSitchPlayback({
                elapsedSec,
                durationSec,
                paused: (player.getPlayerState?.() === (window as any).YT.PlayerState.PAUSED)
            });

            // ---- the jam's half of this clock ---------------------------
            const playing = GetSitchSong();

            if(!playing?.jamId) return;

            const state = GetJamState();

            if(!state.inJam || (state.current?.videoId !== playing.videoId)) return;

            // ONLY WHILE IT IS ACTUALLY PLAYING. This block used to run from the
            // moment the player object existed, and for a guest joining a song
            // already in progress that broke it outright: a loading player
            // reports its position as ZERO, so against a jam forty seconds in
            // the gap read as forty, and the corrector below seeked - every
            // second, on top of a video still trying to load, restarting the
            // buffering each time. The song never started.
            //
            // It only showed for a guest joining mid-song, because that is the
            // only case where the gap is large before anything is playing: the
            // host, and a guest on the next song, both start from zero with
            // nothing to correct.
            const playerState = player.getPlayerState?.();

            if(playerState !== (window as any).YT.PlayerState.PLAYING) return;

            // The server starts a track not knowing how long it is; whoever's
            // player finds out first says so, and everyone else's report is
            // ignored. Sent once, while the length is still unknown.
            if((state.current.durationSec === 0) && (durationSec >= 10) && (durationSec <= 7200)) ReportJam(durationSec, false);

            // DRIFT. Five browsers buffering separately do not stay together on
            // their own, and a jam whose listeners are eight seconds apart is
            // not a shared session. Corrected only past three seconds: closer
            // than that, a seek is more disruptive than the gap it closes.
            if(state.paused) return;

            const expected = ((Date.now() - state.current.startedAtMs) / 1000);

            if(Math.abs(expected - elapsedSec) > 3) player.seekTo?.(expected, true);
        }, 1000);

        return () =>
        {
            window.clearInterval(clock);
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

        // ZERO IS SILENCE, AND IT HAS TO BE SAID AS A MUTE.
        //
        // This set the volume and THEN unmuted, which is backwards. YouTube
        // treats a volume of zero as muted, and unMute() puts back the level the
        // player had before that - so dragging the slider to the bottom set zero
        // and undid it in the same breath, and the music carried on at the old
        // volume underneath a speaker icon that had already flipped to mute.
        //
        // The room's player has always done these two the other way round, which
        // is exactly why only this one had the bug.
        const silent = (songMuted || (songVolume === 0));

        if(silent)
        {
            player.setVolume?.(0);
            player.mute?.();

            return;
        }

        player.unMute?.();
        player.setVolume?.(songVolume);
    }, [ songVolume, songMuted, song?.videoId ]);

    // A RESTART is the same song with its clock wound back, which nothing else
    // here would notice: the song's own screen keys off the video id, and that
    // has not changed. Without this the only thing that would eventually catch
    // it is the once-a-second drift check - so pressing back would leave the
    // music running on for another second before jumping, which reads as the
    // button not having worked.
    //
    // Stepping back a TRACK needs none of this; that changes the video, and the
    // player rebuilds on it as it would for any other song.
    useEffect(() =>
    {
        const player = playerRef.current;

        if(!player?.getCurrentTime || !song?.jamId) return;

        const state = GetJamState();

        if(!state.inJam || (state.current?.videoId !== song.videoId)) return;

        const expected = Math.max(0, ((Date.now() - state.current.startedAtMs) / 1000));

        // Same threshold the drift check uses. Below it a seek is more
        // disruptive than the gap it closes.
        if(Math.abs(expected - (player.getCurrentTime?.() ?? 0)) > 3) player.seekTo?.(expected, true);
    }, [ jam.current?.startedAtMs, song?.jamId, song?.videoId ]);

    // The player FOLLOWS the store's paused intent. It used to be asked to
    // toggle and then polled for the answer - too slow to decide with, now that
    // whether the ROOM plays hangs on it.
    useEffect(() =>
    {
        const player = playerRef.current;

        if(!player?.getPlayerState) return;

        const playing = (player.getPlayerState() === (window as any).YT.PlayerState.PLAYING);
        const paused = (songPaused || jamPaused);

        if(paused && playing)
        {
            player.pauseVideo?.();

            return;
        }

        if(paused || playing) return;

        // COMING BACK TO A JAM CATCHES UP FIRST.
        //
        // A guest's pause stops only their own player; the jam carries on
        // without them, so pressing play again would resume them exactly as far
        // behind as their pause was long. The drift corrector would eventually
        // notice - but only past three seconds, and a second late, so a short
        // pause left them quietly out of step for the rest of the song with
        // nothing to fix it.
        //
        // Seeking before playing rather than after: playing first would put out
        // the wrong few hundred milliseconds of audio before the jump.
        const playingSong = GetSitchSong();
        const state = GetJamState();

        if(playingSong?.jamId && state.inJam && !state.paused && (state.current?.videoId === playingSong.videoId))
        {
            player.seekTo?.(Math.max(0, ((Date.now() - state.current.startedAtMs) / 1000)), true);
        }

        player.playVideo?.();
    }, [ songPaused, jamPaused, song?.videoId ]);

    // A blocked autoplay leaves the music playing muted. There is no prompt
    // for it any more: the next click or tap anywhere in the hotel is the user
    // gesture the browser wants, so it unmutes then, on its own.
    useEffect(() =>
    {
        if(!needsUnmute) return;

        const unmuteOnGesture = () =>
        {
            playerRef.current?.unMute?.();
            playerRef.current?.setVolume?.(GetJukeboxPrefs().songVolume);
            // a blocked autoplay may have left the player paused
            playerRef.current?.playVideo?.();
            setNeedsUnmute(false);
        }

        window.addEventListener('pointerdown', unmuteOnGesture, { capture: true, once: true });

        return () => window.removeEventListener('pointerdown', unmuteOnGesture, { capture: true });
    }, [ needsUnmute ]);

    if(!song) return null;

    return (
        <>
            <div className="jukebox-player-hidden" aria-hidden="true">
                <div ref={ containerRef } className="jukebox-player-frame" />
            </div>
        </>
    );
}
