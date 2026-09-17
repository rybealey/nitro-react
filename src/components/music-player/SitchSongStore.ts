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

// Where the song has got to, so its screen can draw the same progress bar and
// transport the room's player does.
//
// A SEPARATE listener set from the song's, deliberately. This changes once a
// second, and the song's subscribers include the audio engine and the Sitch
// profile view - neither of which has any use for a clock ticking under them.
export interface SitchPlayback
{
    elapsedSec: number;
    durationSec: number;
    paused: boolean;
}

let playback: SitchPlayback = { elapsedSec: 0, durationSec: 0, paused: false };

const playbackListeners = new Set<() => void>();
const notifyPlayback = () => playbackListeners.forEach(listener => listener());

export const GetSitchPlayback = () => playback;

export const SetSitchPlayback = (next: SitchPlayback) =>
{
    if((playback.elapsedSec === next.elapsedSec) && (playback.durationSec === next.durationSec) && (playback.paused === next.paused)) return;

    playback = next;

    notifyPlayback();
}

export const useSitchPlayback = (): SitchPlayback =>
{
    const [ , setTick ] = useState(0);

    useEffect(() =>
    {
        const listener = () => setTick(tick => (tick + 1));

        playbackListeners.add(listener);

        return () => { playbackListeners.delete(listener); };
    }, []);

    return playback;
}

// The screen holds the buttons; the player holds the iframe. This is the wire
// between them - the player registers what it can do on ready and lets go on
// unmount, so a button pressed after the song stopped reaches nothing.
export interface SitchSongControls { toggle: () => void; }

let controls: SitchSongControls = null;

export const SetSitchSongControls = (next: SitchSongControls) => { controls = next; };

export const ToggleSitchSongPaused = () => controls?.toggle();

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

/// The title and channel, once the player knows them.
///
/// A song started from a pasted link arrives here with neither: that path never
/// reaches the server, and the server is what resolves a YouTube link into a
/// name. The player that is already making the sound knows perfectly well what
/// it is playing, so it is asked - no round trip, and no CORS fight with the
/// oEmbed endpoint, which refuses browsers.
///
/// Guarded on the video id: a late answer about a song that has already been
/// stopped or replaced must not relabel whatever is playing now.
export const SetSitchSongMeta = (videoId: string, title: string, author: string) =>
{
    if(!song || (song.videoId !== videoId)) return;
    if((song.title === (title || '')) && (song.author === (author || ''))) return;

    song = { ...song, title: (title || ''), author: (author || '') };

    notify();
}

// YOUR queue. Nothing like the room's, because it is nobody else's: the room's
// rules - a cooldown, one pending song each, a cap of twenty - all exist to
// stop one player crowding out the others, and there are no others here. The
// only limit is a ceiling so a stuck loop cannot grow without end.
const QUEUE_MAX = 50;

let queue: SitchSong[] = [];

export const GetSitchQueue = () => queue;

/// Plays now if nothing is, joins the back of the queue otherwise. Returns
/// whether it started, so the caller can decide where to send the player.
export const EnqueueSitchSong = (next: SitchSong): boolean =>
{
    if(!next || !next.videoId) return false;

    if(!song)
    {
        PlaySitchSong(next);

        return true;
    }

    if(queue.length >= QUEUE_MAX) return false;

    queue = [ ...queue, next ];

    notify();

    return false;
}

export const RemoveSitchSongAt = (index: number) =>
{
    if((index < 0) || (index >= queue.length)) return;

    queue = queue.filter((entry, at) => (at !== index));

    notify();
}

/// What happens when a song ends: the next one, or silence.
///
/// Not PlaySitchSong, which also stops the station - that already happened when
/// this session started, and calling it again would be a second stop of
/// something already stopped.
export const AdvanceSitchSong = () =>
{
    if(!queue.length)
    {
        StopSitchSong();

        return;
    }

    song = queue[0];
    queue = queue.slice(1);

    notify();
}

export const useSitchQueue = (): SitchSong[] =>
{
    const [ , setTick ] = useState(0);

    useEffect(() =>
    {
        const listener = () => setTick(tick => (tick + 1));

        listeners.add(listener);

        return () => { listeners.delete(listener); };
    }, []);

    return queue;
}

/// Ends the session, queue and all. The line at the bottom of the app calls
/// this "your session" rather than "your song" for exactly this reason - one
/// stop, and the whole thing is over. Taking songs out one at a time is what
/// the queue screen is for.
export const StopSitchSong = () =>
{
    if(!song && !queue.length) return;

    song = null;
    queue = [];

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
