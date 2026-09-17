import { FC, useEffect } from 'react';
import { RpJamStateEvent } from '../../api/rp-phone/RpJamMessages';
import { useMessageEvent } from '../../hooks';
import { GetJamState, RequestJamState, SetJamState, useJamState } from './JamStore';
import { ClaimSitchSongForJam, GetSitchSong, PlayJamSong, SetSitchSongMeta, StopSitchSong } from './SitchSongStore';

// The jam, joined to the rest of the app.
//
// Mounted once at the root beside the audio engines, and it renders nothing. It
// does two jobs and neither of them belongs in a screen: it keeps JamStore
// current from the server, and it hands the jam's track to SitchSongStore.
//
// THAT SECOND JOB IS THE WHOLE DESIGN. A jam could have been a third source of
// sound - the room's, yours, and this - and the audio engine would then have had
// a three-way argument to settle every time any of them changed. Instead a jam
// IS your session, with people in it: the track arrives in the same store a song
// off somebody's profile arrives in, and the player, the room panel, the home
// screen and the one-set-of-ears rule all carry on without knowing anything has
// changed. What the jam marker on the song changes is only the handful of places
// where the difference is real.
export const JamSync: FC<{}> = props =>
{
    const jam = useJamState();

    // Anchored to the local clock on receipt, exactly as the room jukebox's
    // state is: the server sends how far in the track is, and a moment later
    // that number is stale, so it is turned into a start time that stays true.
    useMessageEvent<RpJamStateEvent>(RpJamStateEvent, event =>
    {
        const parser = event.getParser();

        if(!parser.inJam)
        {
            SetJamState(null);

            return;
        }

        SetJamState({
            inJam: true,
            jamId: parser.jamId,
            hostId: parser.hostId,
            hostName: parser.hostName,
            isHost: parser.isHost,
            paused: parser.paused,
            members: parser.members,
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

    // Asked once, on mount, because the server does not volunteer it.
    //
    // This is the whole of "a guest who refreshes comes back into the jam": the
    // membership was never lost - a disconnect only marks you away for a minute
    // and a half - so the new page simply asks what it is in, and is told.
    useEffect(() =>
    {
        RequestJamState();
    }, []);

    // The jam's track, into the ears.
    //
    // Keyed on the video id rather than on the state, because the state arrives
    // again every time anything at all changes - somebody joining, a song being
    // queued - and rebuilding the player for those would restart the song five
    // people are listening to.
    useEffect(() =>
    {
        const state = GetJamState();
        const song = GetSitchSong();

        if(state.inJam && state.current)
        {
            const same = (!!song && (song.jamId === state.jamId) && (song.videoId === state.current.videoId));

            // THE SONG THAT WAS ALREADY PLAYING. When a host starts a jam on the
            // track they were listening to, it comes back down as the jam's -
            // same video, now with a jam behind it. Replacing it here would
            // rebuild the player and restart their music for no reason they
            // could see, so it is claimed in place instead.
            if(!same && song && !song.jamId && (song.videoId === state.current.videoId))
            {
                ClaimSitchSongForJam(state.jamId);

                return;
            }

            if(!same)
            {
                PlayJamSong({
                    videoId: state.current.videoId,
                    title: state.current.title,
                    author: state.current.author,
                    // The host stands where a profile's owner stands: whoever's
                    // session this is.
                    userId: state.hostId,
                    jamId: state.jamId,
                    // Join halfway through a song and you start halfway through
                    // it. Hearing the same track as everyone else at a different
                    // moment is worse than not hearing it.
                    startAtSec: Math.max(0, Math.floor((Date.now() - state.current.startedAtMs) / 1000))
                });
            }
            else if(state.current.title)
            {
                // A title that arrived late, or was corrected. Cheap, and
                // guarded inside on the video id.
                SetSitchSongMeta(state.current.videoId, state.current.title, state.current.author);
            }

            return;
        }

        // Nothing playing, or no jam at all. Only OUR song is stopped: a song
        // the player started for themselves is not the jam's to end.
        if(song?.jamId) StopSitchSong();
    }, [ jam.inJam, jam.jamId, jam.current?.videoId, jam.current?.title ]);

    return null;
}
