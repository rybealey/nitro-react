import { useEffect, useState } from 'react';
import { SendMessageComposer } from '../../api';
import {
    RpJamAddComposer, RpJamBackComposer, RpJamEndComposer, RpJamInviteComposer, RpJamKickComposer, RpJamMoveComposer, RpJamJoinComposer, RpJamLeaveComposer, RpJamPauseComposer,
    RpJamRemoveComposer, RpJamReportComposer, RpJamSkipComposer, RpJamStartComposer, RpJamStateRequestComposer
} from '../../api/rp-phone/RpJamMessages';

// THE JAM you are in, as the server sees it - plus the handful of one-line
// senders that ask it to change.
//
// A plain module store with subscribers, like JukeboxStore next door, for the
// same reason: the phone's app, the room panel and the audio engine all have to
// read the same truth, and the state arrives from the network rather than from
// any of them.
//
// Nothing here is persisted. A jam lives on the server and is told to you; a
// remembered copy would only ever be a stale one, and the very first thing that
// happens on connect is asking.

export interface JamMember { id: number; username: string; away: boolean; }
export interface JamTrack { videoId: string; title: string; author: string; durationSec: number; startedAtMs: number; queuedBy: string; }
export interface JamQueueEntry { videoId: string; title: string; author: string; queuedBy: string; }

export interface JamState
{
    inJam: boolean;
    jamId: number;
    hostId: number;
    hostName: string;
    // Whether YOU are hosting. Comes down per recipient rather than being worked
    // out from hostId here, because the server is the only thing that knows for
    // certain which of the two you are.
    isHost: boolean;
    // The HOST's pause, which is everyone's. A guest's own pause is a different
    // thing entirely and lives in SitchSongStore, where it always has.
    paused: boolean;
    members: JamMember[];
    current: JamTrack | null;
    queue: JamQueueEntry[];
    // Whether anything has played yet, which is what decides whether the back
    // button steps back a track or only restarts this one. The server keeps the
    // history; this is all the client needs to label the button honestly.
    hasPrevious: boolean;
}

const EMPTY: JamState = { inJam: false, jamId: 0, hostId: 0, hostName: '', isHost: false, paused: false, members: [], current: null, queue: [], hasPrevious: false };

let state: JamState = EMPTY;

const listeners = new Set<() => void>();
const notify = () => listeners.forEach(listener => listener());

export const GetJamState = () => state;

export const SetJamState = (next: JamState) =>
{
    state = (next ?? EMPTY);

    notify();
}

export const useJamState = (): JamState =>
{
    const [ , setVersion ] = useState(0);

    useEffect(() =>
    {
        const listener = () => setVersion(value => (value + 1));

        listeners.add(listener);

        return () => { listeners.delete(listener); };
    }, []);

    return state;
}

// ---- asking the server for things ---------------------------------------
// Every one of these is a REQUEST. Nothing below changes `state`; the answer
// always arrives as a fresh state packet, which is what keeps five people's
// screens agreeing about whose jam it is and what is playing.

export const RequestJamState = () => SendMessageComposer(new RpJamStateRequestComposer());

/// Starts a jam ON WHAT YOU ARE ALREADY PLAYING.
///
/// A song of your own never reaches the server, so without this the jam began
/// empty: the host carried on hearing their song and every guest arrived to
/// silence. What goes up is the video, how far in it is, and the queue behind
/// it - enough for the server to start the jam mid-song rather than from
/// nothing.
export const StartJam = (videoId: string = '', elapsedSec: number = 0, queueIds: string[] = []) =>
    SendMessageComposer(new RpJamStartComposer(videoId || '', Math.max(0, Math.floor(elapsedSec || 0)), queueIds.length, ...queueIds));

/// BY NAME. The picker offers friends as taps and a box for anyone else, and a
/// name typed into that box is all this has - the client is never told a
/// stranger's id, and it should not be.
export const InviteToJam = (username: string) => SendMessageComposer(new RpJamInviteComposer(username));

export const JoinJam = (jamId: number) => SendMessageComposer(new RpJamJoinComposer(jamId));

export const LeaveJam = () => SendMessageComposer(new RpJamLeaveComposer());

/// The host puts somebody out, and NOBODY is told - not the jam, not the room,
/// not the person. Their music stops and their app shows them no jam, which is
/// answer enough. They cannot walk back in on the invite still sitting in their
/// messages either, or it would be a nudge rather than a kick.
export const KickFromJam = (userId: number) => SendMessageComposer(new RpJamKickComposer(userId));

/// The HOST's, and not the same button as leaving.
///
/// A host who LEAVES hands the jam to whoever has been in it longest and it
/// carries on without them; a host who ENDS it stops it and everybody goes back
/// to their own ears. Both are things you might want at the end of a session -
/// "I am done" and "we are done" - so neither stands in for the other.
export const EndJam = () => SendMessageComposer(new RpJamEndComposer());

export const AddToJam = (url: string) => SendMessageComposer(new RpJamAddComposer(url));

export const RemoveFromJam = (index: number) => SendMessageComposer(new RpJamRemoveComposer(index));

/// Drag a song up or down the jam's queue. The host's, matching who may pull
/// anyone's song out - moving somebody's request down the list is the same kind
/// of act done more gently.
export const MoveInJam = (from: number, to: number) => SendMessageComposer(new RpJamMoveComposer(from, to));

/// Any member may. Deliberately not the same rule as the pause below - see
/// JamSession.TrySkip on the server for why.
export const SkipJam = () => SendMessageComposer(new RpJamSkipComposer());

/// The back button, which is two buttons wearing one face - past the first few
/// seconds of a track it restarts it, inside them it steps back to the song
/// before. The SERVER decides which, because only it knows how far in the jam
/// actually is; this just says the button was pressed.
export const BackJam = () => SendMessageComposer(new RpJamBackComposer());

/// The HOST's pause only. A guest calling this is refused server-side, which is
/// why the app never offers it to them: their pause button stops their own
/// player and leaves everyone else's running.
export const SetJamPaused = (paused: boolean) => SendMessageComposer(new RpJamPauseComposer(paused));

/// The real duration once the player knows it, and the end of the track. Same
/// contract as the room jukebox's report - except a jam has several players
/// watching one track, so the server takes the first credible answer and
/// ignores the rest.
export const ReportJam = (durationSec: number, ended: boolean) => SendMessageComposer(new RpJamReportComposer(durationSec, ended));

// The invite arrives as an ordinary console message carrying a marker, so it
// lands in the player's messages like anything else somebody sent them. This is
// what turns that text back into a jam id.
//
// Kept beside the sender rather than in the messages view: the marker is half of
// a wire format, and the two halves drifting apart would break invites silently.
export const JAM_INVITE_PREFIX = '[jam:';

export const ParseJamInvite = (message: string): { jamId: number, text: string } =>
{
    if(!message || !message.startsWith(JAM_INVITE_PREFIX)) return null;

    const close = message.indexOf(']');

    if(close < 0) return null;

    const jamId = parseInt(message.substring(JAM_INVITE_PREFIX.length, close));

    if(isNaN(jamId) || (jamId <= 0)) return null;

    return { jamId, text: message.substring(close + 1).trim() };
}
