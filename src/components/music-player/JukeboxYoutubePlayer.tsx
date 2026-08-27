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

interface JukeboxYoutubePlayerProps { current: JukeboxCurrent; volume: number; expanded: boolean; }

export const JukeboxYoutubePlayer: FC<JukeboxYoutubePlayerProps> = props =>
{
    const { current = null, volume = 50, expanded = false } = props;
    const containerRef = useRef<HTMLDivElement>(null);
    const playerRef = useRef<any>(null);
    const currentRef = useRef<JukeboxCurrent>(null);
    const loadedVideoIdRef = useRef<string>(null);
    const reportedDurationFor = useRef<string>(null);
    const errorReportTimerRef = useRef<number>(null);
    const [ needsUnmute, setNeedsUnmute ] = useState(true);

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
                        playerRef.current.mute();
                        syncToCurrent();
                    },
                    onStateChange: (event: any) =>
                    {
                        if(event.data === (window as any).YT.PlayerState.ENDED)
                            SendMessageComposer(new RpJukeboxReportComposer(0, true));
                        if(event.data === (window as any).YT.PlayerState.PLAYING)
                        {
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

    const unmute = () =>
    {
        playerRef.current?.unMute?.();
        playerRef.current?.setVolume?.(volume);
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
