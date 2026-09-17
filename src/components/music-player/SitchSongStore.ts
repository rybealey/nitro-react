import { useEffect, useState } from 'react';
import { SetJukeboxPhoneOn } from './JukeboxStore';

// A profile's favorite song, playing for THIS player and nobody else.
//
// Deliberately not part of the jukebox. A room's station is one shared
// timeline everybody hears at the same offset; this is one person tapping play
// on somebody's profile card. Nothing is sent to the server, nothing is
// queued, and nobody else hears it - which is the promise the app made when
// the favorite song was added ("this won't sync to the radio nor will it
// autoplay").
//
// It does take over the ears, though, because two songs at once is not a
// feature. See PlaySitchSong for which half is a stop and which is a yield.

export interface SitchSong
{
    videoId: string;
    title: string;
    author: string;
    // whose profile it came from, so the card that started it is the card that
    // shows as playing
    userId: number;
}

let song: SitchSong = null;

const listeners = new Set<() => void>();
const notify = () => listeners.forEach(listener => listener());

export const GetSitchSong = () => song;

/// Start a profile's song.
///
/// The Spotify radio is STOPPED rather than suppressed: phoneOn is this player's
/// own play/pause switch, so turning it off leaves the Music app showing
/// paused, which is the honest reading of what just happened. A jukebox in the
/// room cannot be stopped - it belongs to the room, not to you - so that half
/// is a yield in JukeboxAudioEngine, and the furni picks straight back up when
/// the song ends.
export const PlaySitchSong = (next: SitchSong) =>
{
    if(!next || !next.videoId) return;

    song = next;

    SetJukeboxPhoneOn(false);

    notify();
}

export const StopSitchSong = () =>
{
    if(!song) return;

    song = null;

    notify();
}

export const useSitchSong = (): SitchSong =>
{
    const [ , setTick ] = useState(0);

    useEffect(() =>
    {
        const listener = () => setTick(tick => (tick + 1));

        listeners.add(listener);

        return () =>
        {
            listeners.delete(listener);
        };
    }, []);

    return song;
}

// A YouTube link to its video id, or null.
//
// Mirrors JukeboxStation.ParseVideoId on the server, deliberately: a link the
// room jukebox would take must not be refused by the phone's own player, and a
// player pasting the same link into both should not meet two different ideas of
// what counts. Bare ids, watch, youtu.be, shorts and embed - the same five.
//
// Client-side because a song played only for you never reaches the server:
// there is nothing to ask and nobody to ask.
export const ParseVideoId = (input: string): string =>
{
    if(!input) return null;

    const trimmed = input.trim();

    if(/^[A-Za-z0-9_-]{11}$/.test(trimmed)) return trimmed;

    const match = trimmed.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/);

    return (match ? match[1] : null);
}
