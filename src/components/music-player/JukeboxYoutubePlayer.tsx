import { FC, useEffect, useRef, useState } from 'react';
import { RpJukeboxReportComposer } from '@nitrots/nitro-renderer';
import { SendMessageComposer } from '../../api';
import { JukeboxCurrent } from './useJukebox';

// Compliance note: YouTube's embed terms forbid hidden/audio-only playback.
// This player is ALWAYS rendered (>= 200x200) while a track is active —
// "collapsed" means the mini dock, never display:none.
let apiPromise: Promise<void> = null;

const loadIframeApi = () =>
{
    if(apiPromise) return apiPromise;
    apiPromise = new Promise<void>(resolve =>
    {
        if((window as any).YT && (window as any).YT.Player) { resolve(); return; }
        (window as any).onYouTubeIframeAPIReady = () => resolve();
        const tag = document.createElement('script');
        tag.src = 'https://www.youtube.com/iframe_api';
        document.head.appendChild(tag);
    });
    return apiPromise;
}

interface JukeboxYoutubePlayerProps { current: JukeboxCurrent; volume: number; muted: boolean; expanded: boolean; }

export const JukeboxYoutubePlayer: FC<JukeboxYoutubePlayerProps> = props =>
{
    const { current = null, volume = 50, muted = false, expanded = false } = props;
    const containerRef = useRef<HTMLDivElement>(null);
    const playerRef = useRef<any>(null);
    const currentRef = useRef<JukeboxCurrent>(null);
    const loadedVideoIdRef = useRef<string>(null);
    const reportedDurationFor = useRef<string>(null);
    const errorReportTimerRef = useRef<number>(null);
    const autoplayWatchdogRef = useRef<number>(null);
    const mutedRef = useRef<boolean>(muted);
    const [ needsUnmute, setNeedsUnmute ] = useState(false);

    // Unmuted is the default: the hotel always has user activation by the
    // time a track starts (login, walking, clicking), which satisfies the
    // browser autoplay policy. If playback still gets blocked, fall back to
    // muted playback + the unmute pill so the room at least stays in sync.
    const fallBackToMuted = () =>
    {
        if(!playerRef.current) return;

        playerRef.current.mute?.();
        playerRef.current.playVideo?.();
        // no pill when the player chose mute themselves — the speaker icon
        // is their control
        if(!mutedRef.current) setNeedsUnmute(true);
    }

    const clearAutoplayWatchdog = () =>
    {
        if(!autoplayWatchdogRef.current) return;

        window.clearTimeout(autoplayWatchdogRef.current);
        autoplayWatchdogRef.current = null;
    }

    // Not every browser fires onAutoplayBlocked — a watchdog catches the
    // silent-refusal case (player just sits unstarted/paused after a load).
    const armAutoplayWatchdog = () =>
    {
        clearAutoplayWatchdog();

        autoplayWatchdogRef.current = window.setTimeout(() =>
        {
            autoplayWatchdogRef.current = null;

            const YT = (window as any).YT;
            const state = playerRef.current?.getPlayerState?.();

            if((state === YT?.PlayerState?.PLAYING) || (state === YT?.PlayerState?.BUFFERING) || (state === YT?.PlayerState?.ENDED)) return;

            fallBackToMuted();
        }, 2500);
    }

    // track changes / seeks — re-broadcasts of the same video re-anchor
    // startedAtMs server-side as elapsed drifts, so only reseek when the
    // videoId changes or the local position has actually drifted; otherwise
    // a reload on every state packet would stutter playback.
    const syncToCurrent = () =>
    {
        const track = currentRef.current;
        if(!playerRef.current?.loadVideoById || !track) return;

        const elapsed = Math.max(0, (Date.now() - track.startedAtMs) / 1000);

        if(loadedVideoIdRef.current === track.videoId)
        {
            const currentTime = playerRef.current.getCurrentTime?.();

            if((typeof currentTime === 'number') && (Math.abs(currentTime - elapsed) <= 3)) return;

            playerRef.current.seekTo(elapsed, true);
            return;
        }

        loadedVideoIdRef.current = track.videoId;
        playerRef.current.loadVideoById({ videoId: track.videoId, startSeconds: elapsed });
        armAutoplayWatchdog();
    }

    // create the player once
    useEffect(() =>
    {
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
                        if(mutedRef.current) playerRef.current.mute?.();
                        else playerRef.current.unMute?.();
                        playerRef.current.setVolume?.(volume);
                        syncToCurrent();
                    },
                    // Chrome's dedicated blocked-autoplay signal; the watchdog
                    // covers browsers that don't fire it.
                    onAutoplayBlocked: () => fallBackToMuted(),
                    onStateChange: (event: any) =>
                    {
                        if(event.data === (window as any).YT.PlayerState.ENDED)
                            SendMessageComposer(new RpJukeboxReportComposer(0, true));
                        if(event.data === (window as any).YT.PlayerState.PLAYING)
                        {
                            clearAutoplayWatchdog();

                            if(!playerRef.current.isMuted?.()) setNeedsUnmute(false);

                            const duration = Math.round(playerRef.current.getDuration());
                            if(duration > 0 && reportedDurationFor.current !== currentRef.current?.videoId)
                            {
                                reportedDurationFor.current = currentRef.current?.videoId;
                                SendMessageComposer(new RpJukeboxReportComposer(duration, false));
                            }
                        }
                    },
                    // embed-disabled / removed videos: advance the room queue.
                    // The server ignores an unknown-duration "ended" report until
                    // elapsed >= 30s, so the immediate report here is dropped and
                    // an error'd track would otherwise stall for the full 600s
                    // Cycle cap. Schedule a follow-up report timed to land just
                    // past that 30s gate so the queue actually advances.
                    onError: () =>
                    {
                        SendMessageComposer(new RpJukeboxReportComposer(0, true));

                        if(errorReportTimerRef.current) window.clearTimeout(errorReportTimerRef.current);

                        const delay = Math.max(0, ((currentRef.current?.startedAtMs ?? Date.now()) + 35000) - Date.now());

                        errorReportTimerRef.current = window.setTimeout(() =>
                        {
                            errorReportTimerRef.current = null;
                            SendMessageComposer(new RpJukeboxReportComposer(0, true));
                        }, delay);
                    }
                }
            });
        });

        return () =>
        {
            disposed = true;
            playerRef.current?.destroy?.();
            playerRef.current = null;

            clearAutoplayWatchdog();

            if(errorReportTimerRef.current)
            {
                window.clearTimeout(errorReportTimerRef.current);
                errorReportTimerRef.current = null;
            }
        }
    }, []);

    useEffect(() =>
    {
        if(errorReportTimerRef.current)
        {
            window.clearTimeout(errorReportTimerRef.current);
            errorReportTimerRef.current = null;
        }

        currentRef.current = current;
        syncToCurrent();
    }, [ current?.videoId, current?.startedAtMs ]);

    useEffect(() => { playerRef.current?.setVolume?.(volume); }, [ volume ]);

    useEffect(() =>
    {
        mutedRef.current = muted;

        if(!playerRef.current) return;

        if(muted)
        {
            playerRef.current.mute?.();
            setNeedsUnmute(false);
        }
        else
        {
            // the toggle click is a user gesture, so unmuting always sticks
            playerRef.current.unMute?.();
            playerRef.current.setVolume?.(volume);
            setNeedsUnmute(false);
        }
    }, [ muted ]);

    const unmute = () =>
    {
        playerRef.current?.unMute?.();
        playerRef.current?.setVolume?.(volume);
        // a blocked autoplay may have left the player paused
        playerRef.current?.playVideo?.();
        setNeedsUnmute(false);
    }

    return (
        <div className={ `jukebox-player${ expanded ? ' is-expanded' : '' }` }>
            <div ref={ containerRef } className="jukebox-player-frame" />
            { needsUnmute &&
                <div className="jukebox-player-unmute" onClick={ unmute }>Tap to unmute</div> }
        </div>
    );
}
