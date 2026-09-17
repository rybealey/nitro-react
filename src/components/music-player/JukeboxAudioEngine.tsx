import { RpJukeboxStateEvent } from '@nitrots/nitro-renderer';
import { FC, useEffect } from 'react';
import { useMessageEvent, useRoom } from '../../hooks';
import { JukeboxYoutubePlayer } from './JukeboxYoutubePlayer';
import { SetJukeboxState, useJukeboxPrefs, useJukeboxState } from './JukeboxStore';
import { useSitchSong } from './SitchSongStore';

// THE one place a room's jukebox is heard. Mounted once at the app root, so
// audio keeps going when the phone is closed, when the player leaves a room,
// and there is never a second player to overlap the first.
//
// Plays when the station has a track AND either the phone is tuned in
// (prefs.phoneOn - the Music app's play/pause) or this room has a jukebox.
// With the phone on, the phone is the source: the room panel's mute is
// ignored, so walking into a jukebox room changes nothing you hear.
export const JukeboxAudioEngine: FC<{}> = props =>
{
    const { roomSession = null } = useRoom();
    const { present, current } = useJukeboxState();
    const { phoneOn, volume, muted } = useJukeboxPrefs();
    // A favorite song playing off somebody's Sitch profile takes the ears for
    // as long as it lasts. Spotify was already switched off by PlaySitchSong -
    // that is a real stop the player can see - but a jukebox belongs to the
    // room rather than to you, so it cannot be stopped, only waited out. The
    // station keeps its own timeline the whole time, so when the song ends the
    // furni picks up wherever the room has got to rather than where it left
    // off.
    const sitchSong = useSitchSong();

    // Timing arrives as elapsed seconds; anchor it to the local clock on
    // receipt so the player can seek. present is this room's flag.
    useMessageEvent<RpJukeboxStateEvent>(RpJukeboxStateEvent, event =>
    {
        const parser = event.getParser();

        SetJukeboxState({
            present: parser.present,
            current: parser.current ? {
                videoId: parser.current.videoId,
                title: parser.current.title,
                author: parser.current.author,
                durationSec: parser.current.durationSec,
                startedAtMs: (Date.now() - (parser.current.elapsedSec * 1000)),
                queuedBy: parser.current.queuedBy
            } : null,
            queue: parser.queue
        });
    });

    // Out of every room there is nothing to listen to: a station belongs to a
    // room now, so the whole state goes rather than just the panel's flag.
    // Keeping it would leave the phone playing a room you have walked out of,
    // and showing a queue you can no longer touch. "Just for you" is the thing
    // that plays anywhere.
    useEffect(() =>
    {
        if(!roomSession) SetJukeboxState({ present: false, current: null, queue: [] });
    }, [ roomSession ]);

    const shouldPlay = (!!current && (phoneOn || present) && !sitchSong);

    if(!shouldPlay) return null;

    // ONE mute, honoured whatever is tuned in. This used to read
    // `phoneOn ? false : muted` - tapping play in the app force-unmuted you,
    // because back then the app's play meant "listen from anywhere" and a room
    // mute was about the furni. With per-room queues a jukebox plays out loud to
    // the room regardless, so two competing answers to "am I hearing this" was
    // one too many.
    return <JukeboxYoutubePlayer current={ current } volume={ volume } muted={ muted } />;
}
