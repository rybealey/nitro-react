import { RpJukeboxAddComposer, RpJukeboxRemoveComposer, RpJukeboxSkipComposer } from '@nitrots/nitro-renderer';
import React, { FC, useEffect, useRef, useState } from 'react';
import { GetSessionDataManager, SendMessageComposer } from '../../api';
import { RpGetTunesAccessComposer, RpTunesAccessEvent } from '../../api/rp-phone/RpTunesMessages';
import { useMessageEvent, useNavigator } from '../../hooks';
import { SetJukeboxMuted, SetJukeboxRoomPaused, SetJukeboxVolume, SetSongMuted, SetSongVolume, TakeMusicOpenTarget, useJukeboxPrefs, useJukeboxState } from '../music-player/JukeboxStore';
import { AdvanceSitchSong, EnqueueSitchSong, ParseVideoId, RemoveSitchSongAt, SetSitchSongPaused, ToggleSitchRepeat, ToggleSitchSongPaused, useSitchPlayback, useSitchQueue, useSitchRepeat, useSitchSong, useSitchSongPaused } from '../music-player/SitchSongStore';
import { SiriWave } from '../music-player/SiriWave';
import { PhoneIcon } from './PhoneIcon';
import { PhoneMarquee } from './PhoneMarquee';

// Spotify app: THIS ROOM's jukebox on your phone, in a streaming-app idiom - an
// always-dark ground, big square cover, one green for "playing" and the
// primary action, flat rows for the queue. Now Playing shows the track the
// room hears (state is server-authoritative and pushed to the room);
// play/pause is YOUR on/off switch - it never touches the stream - and the
// sound comes from the one JukeboxAudioEngine at the app root, so it keeps
// going when the phone is closed and never doubles up in a jukebox room.
// Requests go through the same Siri-style sheet as the room jukebox.
// Staff (RpTunesAccess) can skip the playing song - everyone in the room, so
// it asks once - and remove any request; players can remove their own.
//
// Requesting needs a jukebox in the room: a queue belongs to one, so with no
// jukebox standing there is nothing to request into.
//
// JUST FOR YOU is the other half: a link played for this listener and nobody
// else. It is the same private player a Sitch profile song uses, so it stops
// the station, waits out a room jukebox rather than fighting it, and keeps
// going when the phone closes. Nothing is sent to the server - which is also
// why there is no title to show, only the video's own artwork. The stop button
// lives here because until now the only one was on the profile that started
// the song, which could be several taps away.

interface PhoneMusicViewProps
{
    onBack: () => void;
}

// home is the app: a couple of buttons and what is playing. The player and the
// queue are screens you step into from it.
//
// It is this way round because the one screen holding everything could not hold
// everything - a 272px cover, titles, progress, transport, up next, two buttons
// and the source line in a column that does not scroll. Three bugs came out of
// that in a row: the source line clipped, then the buttons overlapped the up
// next card, then the block without flex: none squashed under its own content.
// Splitting the screen ends the arithmetic rather than winning it.
type MusicView = 'home' | 'personal' | 'personalqueue' | 'now' | 'queue';

const formatClock = (seconds: number): string =>
{
    const safe = Math.max(0, Math.floor(seconds));

    return `${ Math.floor(safe / 60) }:${ (safe % 60).toString().padStart(2, '0') }`;
}

export const PhoneMusicView: FC<PhoneMusicViewProps> = props =>
{
    const { onBack = null } = props;
    const { current, queue, present } = useJukeboxState();
    const { roomPaused, volume, muted, songVolume, songMuted } = useJukeboxPrefs();
    // the room's own name, the same place the title card in the corner reads it
    const { navigatorData = null } = useNavigator();
    const roomName = (navigatorData?.enteredGuestRoom?.roomName || '');
    // home, unless somebody outside asked for a particular screen - the room
    // panel's queue chip does. Read once at mount and cleared, so it is not
    // sticky for every later open.
    const [ view, setView ] = useState<MusicView>(() => ((TakeMusicOpenTarget() as MusicView) ?? 'home'));
    const [ slide, setSlide ] = useState<'right' | 'left'>('right');
    const [ requesting, setRequesting ] = useState(false);
    const [ confirmSkip, setConfirmSkip ] = useState(false);
    const [ volumeOpen, setVolumeOpen ] = useState(false);
    const [ canManage, setCanManage ] = useState(false);
    const [ toast, setToast ] = useState<string>(null);
    const [ url, setUrl ] = useState('');
    const [ personalOpen, setPersonalOpen ] = useState(false);
    const [ personalUrl, setPersonalUrl ] = useState('');
    const personal = useSitchSong();
    const personalPlayback = useSitchPlayback();
    const personalPaused = useSitchSongPaused();
    // The same answer the room HUD's speaker gives. A song of your own already
    // silences the room - the audio engine yields to it - so the room is muted
    // for you whether or not you pressed anything, and a speaker on this screen
    // saying otherwise would disagree with the one in the corner about a fact.
    // Your song holds the ears only while it is PLAYING. Paused, the room has
    // them back, and both speakers say so.
    const songHasEars = (!!personal && !personalPaused);
    const roomSilenced = (muted || songHasEars);
    // Which session is the one in your ears. Exactly one can be, which is what
    // makes the moving bars worth having: they are a readout of where your sound
    // is coming from, and neither moving means nothing has it.
    //
    // Mute is deliberately NOT folded in. The speaker already says that, and two
    // indicators for one fact is the redundancy we keep taking back out.
    const roomHasEars = (!!current && !roomPaused && !songHasEars);
    // The hero is whatever you can HEAR, so a song of yours that is PAUSED is
    // not it - the room has your ears back and the cover should say so.
    const hero = (songHasEars ? personal : current);
    const personalQueue = useSitchQueue();
    const personalRepeat = useSitchRepeat();
    const personalProgress = ((personalPlayback.durationSec > 0) ? Math.min(100, (personalPlayback.elapsedSec / personalPlayback.durationSec) * 100) : 0);
    const [ sent, setSent ] = useState(false);
    const [ now, setNow ] = useState(() => Date.now());
    const toastTimer = useRef<number>(0);

    const ownName = (GetSessionDataManager().userName || 'You');

    // one clock for the progress bar; and ask whether we get the staff controls
    useEffect(() =>
    {
        SendMessageComposer(new RpGetTunesAccessComposer());

        const interval = setInterval(() => setNow(Date.now()), 1000);

        return () =>
        {
            clearInterval(interval);
            window.clearTimeout(toastTimer.current);
        }
    }, []);

    useMessageEvent<RpTunesAccessEvent>(RpTunesAccessEvent, event => setCanManage(event.getParser().canManage));

    // a fresh track: the request confirmation is stale, and so is a pending skip
    useEffect(() =>
    {
        setSent(false);
        setConfirmSkip(false);
    }, [ current?.videoId, queue.length ]);

    const elapsed = (current ? Math.min(Math.max(0, (now - current.startedAtMs) / 1000), (current.durationSec || Infinity)) : 0);
    const duration = (current?.durationSec || 0);
    const progress = (duration > 0 ? Math.min(100, (elapsed / duration) * 100) : 0);
    const art = (current ? `https://i.ytimg.com/vi/${ current.videoId }/hqdefault.jpg` : null);
    const byName = (name: string) => ((name === ownName) ? 'you' : name);

    const go = (to: MusicView) =>
    {
        setSlide((to === 'home') ? 'left' : 'right');
        setView(to);
    }

    // The player is a screen about a song. With no song there is nothing for it
    // to be, so a track ending while you are standing in it puts you back home
    // rather than leaving you on a screen with a hole in it.
    useEffect(() =>
    {
        if((view !== 'now') || current) return;

        setView('home');
    }, [ view, current ]);

    useEffect(() =>
    {
        if(((view !== 'personal') && (view !== 'personalqueue')) || personal) return;

        setView('home');
    }, [ view, personal ]);

    const openRequest = () =>
    {
        setSent(false);
        setRequesting(true);
    }

    const showToast = (text: string) =>
    {
        window.clearTimeout(toastTimer.current);
        setToast(text);
        toastTimer.current = window.setTimeout(() => setToast(null), 2200);
    }

    const submit = () =>
    {
        if(!url.trim().length) return;

        SendMessageComposer(new RpJukeboxAddComposer(url.trim()));
        setUrl('');
        setSent(true);
        setTimeout(() => setRequesting(false), 900);
    }

    // skip moves the whole room on, so it goes through the confirm sheet
    const skipNow = () =>
    {
        SendMessageComposer(new RpJukeboxSkipComposer());
        setConfirmSkip(false);

        if(current) showToast(`Skipped ${ current.title }.`);
    }

    // queue positions are the server's indices: the removal is by index
    const removeAt = (index: number) =>
    {
        const entry = queue[index];

        if(!entry) return;

        SendMessageComposer(new RpJukeboxRemoveComposer(index));
        showToast(`Removed ${ entry.title } from the queue.`);
    }

    const canRemove = (entry: { queuedBy: string }) => (canManage || (entry.queuedBy === ownName));

    // Starting one is a stop for the station, which PlaySitchSong does itself -
    // two songs at once is not a feature. A bad link leaves the sheet open with
    // what was typed, rather than clearing it and saying nothing.
    const playPersonal = () =>
    {
        const videoId = ParseVideoId(personalUrl);

        if(!videoId)
        {
            showToast('That does not look like a YouTube link.');

            return;
        }

        // userId 0: this came from a link, not somebody's profile, so no
        // profile card should light up as playing it. Nothing reads the field
        // but that card, which matches on the video id anyway.
        // userId 0: this came from a link, not somebody's profile, so no
        // profile card should light up as playing it.
        const started = EnqueueSitchSong({ videoId, title: '', author: '', userId: 0 });

        setPersonalUrl('');
        setPersonalOpen(false);

        // Straight to it if it started; if it joined the back of the queue,
        // taking the player there would be showing them the wrong song.
        if(started) go('personal');
        else showToast('Added to your queue.');
    }

    const toggleRadio = () =>
    {
        // Your session is NOT cleared here. This used to call StopSitchSong,
        // which threw away the song AND the whole queue - a hangover from when
        // this button meant "tune in" and starting the room instead of your own
        // song was a decision to abandon it. It is a pause now, on both sides:
        // your session waits, paused, until you go back and unpause it.
        //
        // Pressing play is an explicit "I want to hear this", so it lifts a
        // mute rather than playing into one.
        //
        // NOT the override this replaced. That read `phoneOn ? false : muted`
        // in the engine and left the mute set underneath, so the speaker went on
        // showing muted while sound came out, and pausing put the silence back
        // with no way to see why. This CLEARS it: one piece of state, changed
        // out in the open, and both speakers follow.
        if(roomPaused) SetJukeboxMuted(false);

        SetJukeboxRoomPaused(!roomPaused);
    }

    // The request sheet is shared in spirit with the room jukebox panel and
    // deliberately untouched by the restyle: same plate, halo and Add.
    const requestSheet = (
        <>
            <div className="phone-calendar-scrim" onClick={ event => setRequesting(false) } />
            <div className="phone-calendar-sheet phone-music-sheet">
                <div className="phone-calendar-grabber" />
                <div className="phone-music-sheet-title">Request a song in this room</div>
                <div className={ `phone-music-siri${ sent ? ' is-sent' : '' }` }>
                    <div className="phone-music-siri-halo" />
                    <div className="phone-music-siri-plate">
                        { !sent &&
                            <div className="phone-music-siri-row">
                                <SiriWave />
                                <input className="phone-music-siri-input" type="text" spellCheck={ false } placeholder="Paste a YouTube link" autoFocus
                                    value={ url } onChange={ event => setUrl(event.target.value) }
                                    onKeyDown={ event => { if(event.key !== 'Enter') return; event.preventDefault(); event.stopPropagation(); submit(); } } />
                                <button className="phone-music-siri-add" type="button" onClick={ submit }>Add</button>
                            </div> }
                        { sent &&
                            <div className="phone-music-siri-done">
                                <PhoneIcon icon="check" size={ 14 } />
                                Requested
                            </div> }
                    </div>
                </div>
            </div>
        </>
    );

    const eq = <span className="phone-music-eq"><i /><i /><i /><i /></span>;

    const personalSheet = (
        <>
            <div className="phone-calendar-scrim" onClick={ event => setPersonalOpen(false) } />
            <div className="phone-calendar-sheet phone-music-sheet">
                <div className="phone-calendar-grabber" />
                <div className="phone-music-sheet-title">Start your own jam session</div>
                <div className="phone-music-siri">
                    <div className="phone-music-siri-halo" />
                    <div className="phone-music-siri-plate">
                        <div className="phone-music-siri-row">
                            <SiriWave />
                            <input className="phone-music-siri-input" type="text" spellCheck={ false } placeholder="Paste a YouTube link" autoFocus
                                value={ personalUrl } onChange={ event => setPersonalUrl(event.target.value) }
                                onKeyDown={ event => { if(event.key !== 'Enter') return; event.preventDefault(); event.stopPropagation(); playPersonal(); } } />
                            <button className="phone-music-siri-add" type="button" onClick={ playPersonal }>Play</button>
                        </div>
                    </div>
                </div>
            </div>
        </>
    );

    // On the front page, because it is half of what the app is for and the other
    // half - the room's jukebox - is not there at all when no jukebox is. It
    // sits above the source line rather than up by the cover: the pane does not
    // scroll, so it goes where there is give, and the give is at the bottom.
    //
    // NO HEADING, and a shorter pill than the app's others. The Now Playing
    // screen is a fixed column in a 700px phone and was using nearly all of it
    // before this block arrived; a "Just for you" heading over a control that
    // already reads "Start your own jam session" was the one part paying rent
    // without saying anything, and it was pushing the source line off the
    // bottom.
    //
    // This buys about 45px. The accessibility text-size setting scales all of
    // it, so a player on a large size can still run out of room - the real fix
    // is for the middle of this screen to scroll.
    //
    // A song playing only for you is also easy to forget about, and until this
    // the only stop button was on the profile that started it.
    // Only the start. A session you already have is reached by the green button
    // beside this one; the row that used to sit here repeated the hero above it
    // and is gone with it.
    const personalSection = (
        <div className="phone-music-personal">
            <div className="phone-tap phone-music-pill" onClick={ event => { setPersonalUrl(''); setPersonalOpen(true); } }>
                <PhoneIcon icon="music" size={ 15 } />
                Start your own jam session
            </div>
        </div>
    );

    const skipSheet = current && (
        <>
            <div className="phone-calendar-scrim" onClick={ event => setConfirmSkip(false) } />
            <div className="phone-calendar-sheet phone-music-darksheet">
                <div className="phone-calendar-grabber" />
                <div className="phone-music-darksheet-track">
                    <img src={ `https://i.ytimg.com/vi/${ current.videoId }/mqdefault.jpg` } alt="" draggable={ false } />
                    <div className="phone-music-darksheet-tracktext">
                        <div className="phone-music-darksheet-tracktitle">{ current.title }</div>
                        <div className="phone-music-darksheet-tracksub">{ current.author ? `${ current.author } · ` : '' }requested by { byName(current.queuedBy) }{ duration > 0 ? ` · ${ formatClock(duration - elapsed) } left` : '' }</div>
                    </div>
                </div>
                <div className="phone-music-darksheet-title">Skip this song for everyone?</div>
                <div className="phone-music-darksheet-sub">
                    Everyone in this room moves on { queue.length ? <>to <b>{ queue[0].title }</b></> : 'to silence' } right away.
                    { (current.queuedBy !== ownName) && ` ${ current.queuedBy } is told it was skipped by staff.` }
                </div>
                <div className="phone-music-darksheet-actions">
                    <div className="phone-music-darkbtn phone-tap" onClick={ event => setConfirmSkip(false) }>Cancel</div>
                    <div className="phone-music-darkbtn is-primary phone-tap" onClick={ skipNow }>
                        <PhoneIcon icon="forward-step" size={ 15 } />
                        Skip
                    </div>
                </div>
            </div>
        </>
    );

    const topBar = (leftIcon: string, onLeft: () => void, title: string, right: React.ReactNode = null) => (
        <div className="phone-music-top">
            <div className="phone-tap phone-music-topbtn" onClick={ onLeft }>
                <PhoneIcon icon={ leftIcon } size={ 22 } />
            </div>
            <div className="phone-music-toptitle">{ title }</div>
            <div className="phone-music-topbtn">{ right }</div>
        </div>
    );

    // the queue lives top-right for everyone, which frees the transport's right slot
    const queueButton = (
        <div className="phone-tap phone-music-topbtn phone-music-queuebtn" title="Queue" onClick={ event => go('queue') }>
            <PhoneIcon icon="list-music" size={ 22 } />
            { (queue.length > 0) && <span className="phone-music-badge">{ queue.length }</span> }
        </div>
    );

    // Where the sound is coming from for THIS player.
    //
    // Only shown where it answers something. Home shows it for a song of your
    // own - the one whose source nothing else on that screen explains - and
    // never for the room jukebox, which was a line about a session you had not
    // joined, on the screen whose whole job is offering to join it. The room's
    // line belongs on the room's screen.
    // It names what has your EARS, and says nothing when nothing does.
    //
    // It used to ask whether a song of yours EXISTED, so a paused session had it
    // reading "Your session" while you sat listening to the room - the last
    // place still asking the old question after everything else moved to asking
    // whether a thing is playing.
    //
    // Blank when paused or quiet, rather than a line reporting silence: the
    // button is a play again, the cover has stopped and the sound has gone.
    const sourceRow = (songHasEars
        ? (
            <div className="phone-music-source is-on">
                <PhoneIcon icon="mobile-screen" size={ 14 } />
                <span>Your session</span>
            </div>
        )
        : (roomHasEars
            ? (
                <div className="phone-music-source is-on">
                    <PhoneIcon icon="radio" size={ 14 } />
                    <span>Playing on the room jukebox</span>
                </div>
            )
            : null));


    const queueRow = (entry: { videoId: string, title: string, queuedBy: string }, index: number, playing: boolean = false) => (
        <div key={ `${ entry.videoId }-${ index }` } className={ `phone-music-row${ playing ? ' is-playing' : '' }` } style={ { animationDelay: `${ 40 + Math.min(index, 8) * 40 }ms` } }>
            <img className="phone-music-row-art" src={ `https://i.ytimg.com/vi/${ entry.videoId }/mqdefault.jpg` } alt="" draggable={ false } onLoad={ event => event.currentTarget.classList.add('is-loaded') } />
            <div className="phone-music-row-text">
                <PhoneMarquee className="phone-music-row-title" text={ entry.title } />
                <div className="phone-music-row-by">Requested by { byName(entry.queuedBy) }</div>
            </div>
            { playing && eq }
            { playing && canManage &&
                <div className="phone-tap phone-music-rowbtn" title="Skip for everyone" onClick={ event => setConfirmSkip(true) }>
                    <PhoneIcon icon="forward-step" size={ 18 } />
                </div> }
            { !playing && canRemove(entry) &&
                <div className="phone-tap phone-music-rowbtn" title={ canManage ? 'Remove from the queue' : 'Remove your request' } onClick={ event => removeAt(index) }>
                    <PhoneIcon icon="xmark" size={ 17 } />
                </div> }
        </div>
    );

    // HOME. A couple of buttons and whatever is making noise - deliberately
    // sparse, because this is the screen that used to hold everything and could
    // not. The cover is affordable here in a way it was not there: no progress
    // bar, no transport, no up next card competing for the same 700px.
    //
    // The cover shows your own song first and the room's second. Your song is
    // the one nothing else on screen represents; the room's has a whole screen
    // of its own a tap away.
    const homeScreen = (
        <div className="phone-music-pane">
            { topBar('chevron-down', () => (onBack && onBack()), 'SPOTIFY') }
            { /* THE HERO IS WHATEVER YOU CAN HEAR.
                 Your own song takes your ears from the room, so when one is
                 playing it takes the cover too. The room's track was being shown
                 as NOW PLAYING while being, for you, silent - and then the song
                 you could actually hear was repeated underneath it in the same
                 art-and-title shape. That was the duplicate: two songs drawn,
                 one audible. One song here, ever; the room keeps its name on its
                 own button. */ }
            <div className={ `phone-music-coverwrap${ songHasEars ? ' phone-tap' : '' }` } onClick={ event => (songHasEars && go('personal')) }>
                <div className={ `phone-music-cover${ hero ? ' is-playing' : ' is-empty' }` }>
                    { hero
                        ? <img src={ `https://i.ytimg.com/vi/${ hero.videoId }/hqdefault.jpg` } alt="" draggable={ false } onLoad={ event => event.currentTarget.classList.add('is-loaded') } />
                        : <PhoneIcon icon="waveform-lines" size={ 88 } /> }
                </div>
            </div>
            <div className={ `phone-music-titles${ songHasEars ? ' phone-tap' : '' }` } onClick={ event => (songHasEars && go('personal')) }>
                <div className="phone-music-titles-text">
                    { hero &&
                        <PhoneMarquee className="phone-music-nowkicker" text={ songHasEars
                            ? 'JUST FOR YOU'
                            : `NOW PLAYING${ roomName ? ` (IN ${ roomName.toUpperCase() })` : '' }` } /> }
                    <PhoneMarquee className="phone-music-title" text={ songHasEars ? (personal.title || 'Your song') : (current ? current.title : 'No track is playing') } />
                    <div className="phone-music-sub is-wrap">{ songHasEars
                        ? personal.author
                        : (current
                            ? `${ current.author ? `${ current.author } · ` : '' }requested by ${ byName(current.queuedBy) }`
                            : (present ? 'Request one for the room, or play one just for you.' : 'No jukebox here. Play one just for you.')) }</div>
                </div>
            </div>
            { /* A session you already have gets a way back into it; one you do
                 not have gets a way to start one. Either way it is the green
                 button, because playing something of your own is the thing you
                 can always do - the room's half below needs a jukebox. */ }
            { personal
                ? <div className="phone-tap phone-music-pill" onClick={ event => go('personal') }>
                    { songHasEars ? eq : <PhoneIcon icon="music" size={ 16 } /> }
                    Your jam session
                </div>
                : personalSection }
            { /* The room's half. With your song on the cover this button is the
                 only thing naming the room's, so it carries the title. */ }
            { current &&
                <div className="phone-music-pill is-quiet is-stacked phone-tap" onClick={ event => go('now') }>
                    { roomHasEars ? eq : <PhoneIcon icon="radio" size={ 16 } /> }
                    <span className="phone-music-pilltext">
                        Join the room jukebox session
                        <PhoneMarquee className="phone-music-pillsub" text={ current.title } />
                    </span>
                </div> }
            { !current && present &&
                <div className="phone-music-pill is-quiet phone-tap" onClick={ openRequest }>
                    <PhoneIcon icon="plus" size={ 16 } />
                    Request a song in this room
                </div> }
            <div className="phone-music-spacer" />
            { /* No gate: the line already answers for all three states, and its
                 room case is only true when a track is playing, you have not
                 paused it, and no song of yours holds the ears.
                 
                 It was gated here once because it used to announce a session you
                 had not joined, on the screen offering to join it. It reports
                 rather than advertises now. */ }
            { sourceRow }
        </div>
    );

    // Your song's own screen, the mirror of the room's. A back arrow rather than
    // the app's close chevron, because there is somewhere to go back TO now -
    // and nothing here about the room, which is the other screen's business.
    // The same shape as the room's player, because it is the same job: a cover,
    // what it is, where it has got to, and the controls. What differs is what
    // the controls can do - your own song has a stop where the room's has a
    // staff skip, because stopping yours is yours to do.
    const personalScreen = (
        <div className="phone-music-pane">
            { topBar('chevron-left', () => go('home'), 'JUST FOR YOU',
                <div className="phone-tap phone-music-topbtn phone-music-queuebtn" title="Your queue" onClick={ event => go('personalqueue') }>
                    <PhoneIcon icon="list-music" size={ 22 } />
                    { (personalQueue.length > 0) && <span className="phone-music-badge">{ personalQueue.length }</span> }
                </div>) }
            { personal &&
                <div className="phone-music-now" key={ personal.videoId }>
                    <div className="phone-music-coverwrap">
                        <div className={ `phone-music-cover${ personalPaused ? '' : ' is-playing' }` }>
                            <img src={ `https://i.ytimg.com/vi/${ personal.videoId }/hqdefault.jpg` } alt="" draggable={ false } onLoad={ event => event.currentTarget.classList.add('is-loaded') } />
                        </div>
                    </div>
                    <div className="phone-music-titles">
                        <div className="phone-music-titles-text">
                            { /* title and channel come off the running player, so
                                 for a second after pasting there is only the id */ }
                            <PhoneMarquee className="phone-music-title" text={ personal.title || 'Your song' } />
                            <div className="phone-music-sub">{ personal.author }</div>
                        </div>
                    </div>
                    <div className="phone-music-progress">
                        <div className="phone-music-track">
                            <div className="phone-music-fill" style={ { width: `${ personalProgress }%` } } />
                            <div className="phone-music-knob" style={ { left: `${ personalProgress }%` } } />
                        </div>
                        <div className="phone-music-times">
                            <span>{ formatClock(personalPlayback.elapsedSec) }</span>
                            <span>{ (personalPlayback.durationSec > 0) ? formatClock(personalPlayback.durationSec) : 'live' }</span>
                        </div>
                    </div>
                    { /* Repeat, play, skip - the room's three slots with its
                         staff skip replaced by one that is yours to press.
                         Volume leaves the row and its slider simply stays open:
                         with three controls that all do something to the song,
                         a fourth that only opens a drawer was the odd one.

                         SKIP IS ALSO THE STOP. Advancing with nothing queued
                         ends the session, which is what the square stop did, so
                         removing it costs nothing - the last skip stops you. */ }
                    <div className="phone-music-transport">
                        <div className={ `phone-tap phone-music-sidebtn${ personalRepeat ? ' is-on' : '' }` } title={ personalRepeat ? 'Repeat is on' : 'Repeat this song' } onClick={ event => ToggleSitchRepeat() }>
                            <PhoneIcon icon="repeat" size={ 22 } />
                        </div>
                        <div className={ `phone-tap phone-music-play${ personalPaused ? '' : ' is-on' }` } title={ personalPaused ? 'Play' : 'Pause' } onClick={ event => ToggleSitchSongPaused() }>
                            <PhoneIcon icon={ personalPaused ? 'play' : 'pause' } size={ 26 } />
                        </div>
                        <div className="phone-tap phone-music-sidebtn is-skip" title={ personalQueue.length ? 'Next in your queue' : 'Nothing queued - this ends your session' } onClick={ event => AdvanceSitchSong() }>
                            <PhoneIcon icon="forward-step" size={ 22 } />
                        </div>
                    </div>
                    { /* ITS OWN volume and mute, not the room's. Two different
                         sounds that can play at different moments - turning the
                         room down to hear this over it is exactly what one
                         shared slider made impossible.

                         The speaker at the left of the slider is the mute, so
                         the transport stays the three controls that act on the
                         song. */ }
                    <div className="phone-music-volume">
                        <div className={ `phone-tap phone-music-volbtn${ songMuted ? ' is-muted' : '' }` } title={ songMuted ? 'Unmute your song' : 'Mute your song' } onClick={ event => SetSongMuted(!songMuted) }>
                            <PhoneIcon icon={ (songMuted || (songVolume === 0)) ? 'volume-x' : 'volume-low' } size={ 13 } />
                        </div>
                        <input type="range" min={ 0 } max={ 100 } value={ songVolume } style={ { '--fill': `${ songVolume }%` } as React.CSSProperties } onChange={ event => SetSongVolume(parseInt(event.target.value)) } />
                        <PhoneIcon icon="volume-high" size={ 13 } />
                    </div>
                    <div className="phone-music-spacer" />
                </div> }
            { sourceRow }
        </div>
    );

    // Your queue. The room's screen next door reads almost the same and is a
    // different thing underneath: that one is shared and governed - a cooldown,
    // one song each, staff who can remove yours - and this one is yours, so
    // anything in it can go at a tap and nothing is rationed.
    const personalQueueScreen = (
        <div className="phone-music-pane">
            { topBar('chevron-left', () => go('personal'), 'YOUR QUEUE') }
            <div className="phone-music-list">
                { personal &&
                    <>
                        <div className="phone-music-section">Playing now</div>
                        <div className="phone-music-row is-playing">
                            <img className="phone-music-row-art" src={ `https://i.ytimg.com/vi/${ personal.videoId }/mqdefault.jpg` } alt="" draggable={ false } onLoad={ event => event.currentTarget.classList.add('is-loaded') } />
                            <div className="phone-music-row-text">
                                <PhoneMarquee className="phone-music-row-title" text={ personal.title || 'Your song' } />
                                <div className="phone-music-row-by">{ personal.author }</div>
                            </div>
                            { eq }
                        </div>
                    </> }
                <div className="phone-music-section">Next up</div>
                { (personalQueue.length === 0) &&
                    <div className="phone-music-emptyline">Nothing queued. Paste another link and it plays after this one.</div> }
                { personalQueue.map((entry, index) => (
                    <div key={ `${ entry.videoId }-${ index }` } className="phone-music-row" style={ { animationDelay: `${ 40 + Math.min(index, 8) * 40 }ms` } }>
                        <img className="phone-music-row-art" src={ `https://i.ytimg.com/vi/${ entry.videoId }/mqdefault.jpg` } alt="" draggable={ false } onLoad={ event => event.currentTarget.classList.add('is-loaded') } />
                        <div className="phone-music-row-text">
                            <PhoneMarquee className="phone-music-row-title" text={ entry.title || 'Your song' } />
                            <div className="phone-music-row-by">{ entry.author || 'Waiting its turn' }</div>
                        </div>
                        <div className="phone-tap phone-music-rowbtn" title="Take it out" onClick={ event => RemoveSitchSongAt(index) }>
                            <PhoneIcon icon="xmark" size={ 17 } />
                        </div>
                    </div>
                )) }
            </div>
            <div className="phone-tap phone-music-pill" onClick={ event => { setPersonalUrl(''); setPersonalOpen(true); } }>
                <PhoneIcon icon="plus" size={ 16 } />
                Add a song
            </div>
            <div className="phone-music-note">Only you hear any of this, so nothing here is rationed - take anything out at a tap.</div>
        </div>
    );

    const nowScreen = (
        <div className="phone-music-pane">
            { topBar('chevron-left', () => go('home'), 'THIS ROOM', queueButton) }
            { current &&
                <div className="phone-music-now" key={ current.videoId }>
                    <div className="phone-music-coverwrap">
                        <div className={ `phone-music-cover${ roomPaused ? '' : ' is-playing' }` }>
                            <img src={ art } alt="" draggable={ false } onLoad={ event => event.currentTarget.classList.add('is-loaded') } />
                        </div>
                    </div>
                    <div className="phone-music-titles">
                        <div className="phone-music-titles-text">
                            <PhoneMarquee className="phone-music-title" text={ current.title } />
                            <div className="phone-music-sub">{ current.author ? `${ current.author } · ` : '' }requested by { byName(current.queuedBy) }</div>
                        </div>
                        { present &&
                            <div className="phone-tap phone-music-addbtn" title="Request a song" onClick={ openRequest }>
                                <PhoneIcon icon="circle-plus" size={ 26 } />
                            </div> }
                    </div>
                    { /* Gone while you have it paused. The room's track has not
                         stopped - it keeps its own clock and everyone else is
                         still hearing it - so a bar crawling along while your
                         sound is off would be counting something you are not
                         part of. It comes back where the room has got to. */ }
                    { !(roomPaused || songHasEars) &&
                        <div className="phone-music-progress">
                            <div className="phone-music-track">
                                <div className="phone-music-fill" style={ { width: `${ progress }%` } } />
                                <div className="phone-music-knob" style={ { left: `${ progress }%` } } />
                            </div>
                            <div className="phone-music-times">
                                <span>{ formatClock(elapsed) }</span>
                                <span>{ duration > 0 ? formatClock(duration) : 'live' }</span>
                            </div>
                        </div> }
                    { /* the play/pause is this player's own switch: it never
                         touches the stream everyone else hears. Skip is staff
                         only and DOES move everyone on. */ }
                    { /* The speaker is the MUTE, and it is the same mute the room
                         HUD's speaker sets - one piece of state, two controls that
                         agree. The slider is not behind it any more: hiding the
                         only volume control behind the button that now does
                         something else would have traded one for the other. */ }
                    <div className="phone-music-transport">
                        <div className={ `phone-tap phone-music-sidebtn${ roomSilenced ? ' is-muted' : '' }` }
                            title={ songHasEars ? 'Your own song is playing - pause it to hear the room' : (muted ? 'Unmute' : 'Mute') }
                            onClick={ event => (!songHasEars && SetJukeboxMuted(!muted)) }>
                            { /* zero is silence, whatever the mute says */ }
                            <PhoneIcon icon={ (roomSilenced || (volume === 0)) ? 'volume-xmark' : (volume < 50 ? 'volume-low' : 'volume-high') } size={ 22 } />
                        </div>
                        { /* Shown as paused whenever you cannot hear it, whether
                             that is your own pause or your own song holding the
                             ears - which is what makes joining look right before
                             you have pressed anything.

                             Pressing play takes the ears back: your song pauses,
                             and the rule in the audio engine hands the room its
                             sound with nothing else to set. */ }
                        <div className={ `phone-tap phone-music-play${ (roomPaused || songHasEars) ? '' : ' is-on' }` } title={ (roomPaused || songHasEars) ? 'Listen' : 'Pause (just for you)' } onClick={ event => (songHasEars ? SetSitchSongPaused(true) : toggleRadio()) }>
                            <PhoneIcon icon={ (roomPaused || songHasEars) ? 'play' : 'pause' } size={ 26 } />
                        </div>
                        { canManage &&
                            <div className="phone-tap phone-music-sidebtn is-skip" title="Skip for everyone" onClick={ event => setConfirmSkip(true) }>
                                <PhoneIcon icon="forward-step" size={ 24 } />
                            </div> }
                        { !canManage && <div className="phone-music-sidebtn is-blank" /> }
                    </div>
                    { canManage &&
                        <div className="phone-music-staffline">
                            <PhoneIcon icon="shield-halved" size={ 11 } />
                            <span>Staff: skip moves everyone on</span>
                        </div> }
                    { !roomSilenced &&
                        <div className="phone-music-volume">
                            <PhoneIcon icon="volume-low" size={ 13 } />
                            <input type="range" min={ 0 } max={ 100 } value={ volume } style={ { '--fill': `${ volume }%` } as React.CSSProperties } onChange={ event => SetJukeboxVolume(parseInt(event.target.value)) } />
                            <PhoneIcon icon="volume-high" size={ 13 } />
                        </div> }
                    <div className="phone-music-spacer" />
                </div> }
            { sourceRow }
        </div>
    );

    const queueScreen = (
        <div className="phone-music-pane">
            { topBar('chevron-left', () => go(current ? 'now' : 'home'), 'QUEUE') }
            <div className="phone-music-list">
                { current &&
                    <>
                        <div className="phone-music-section">Playing in this room</div>
                        { queueRow(current, 0, true) }
                    </> }
                <div className="phone-music-section">Next in this room</div>
                { (queue.length === 0) &&
                    <div className="phone-music-emptyline">{ present ? 'Nothing queued yet. Add a song and it plays next.' : 'No jukebox in this room.' }</div> }
                { queue.map((entry, index) => queueRow(entry, index)) }
                { (queue.length > 0) &&
                    <div className="phone-music-count">{ queue.length } { (queue.length === 1) ? 'song' : 'songs' } · in the order requested</div> }
            </div>
            { present &&
                <div className="phone-music-pill phone-tap" onClick={ openRequest }>
                    <PhoneIcon icon="plus" size={ 16 } />
                    Add a song to this room
                </div> }
            <div className="phone-music-note">{ present
                ? (canManage ? 'Staff can remove any request. Players can only remove their own.' : 'One request at a time per player. Remove yours to request another.')
                : 'This queue belongs to a jukebox, and there is none in this room.' }</div>
        </div>
    );

    return (
        <div className="phone-screen phone-app-screen phone-music">
            <div key={ view } className={ `phone-music-anim is-${ slide }` }>
                { (view === 'home')
                    ? homeScreen
                    : ((view === 'personal')
                        ? personalScreen
                        : ((view === 'personalqueue')
                            ? personalQueueScreen
                            : ((view === 'now') ? nowScreen : queueScreen))) }
            </div>
            { toast &&
                <div key={ toast } className="phone-music-toast">
                    <PhoneIcon icon="check" size={ 15 } />
                    <span>{ toast }</span>
                </div> }
            { requesting && requestSheet }
            { personalOpen && !requesting && personalSheet }
            { confirmSkip && !requesting && !personalOpen && skipSheet }
        </div>
    );
}
