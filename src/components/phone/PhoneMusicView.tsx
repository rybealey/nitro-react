import { RpJukeboxAddComposer, RpJukeboxRemoveComposer, RpJukeboxSkipComposer } from '@nitrots/nitro-renderer';
import React, { FC, useEffect, useRef, useState } from 'react';
import { GetSessionDataManager, SendMessageComposer } from '../../api';
import { RpGetTunesAccessComposer, RpTunesAccessEvent } from '../../api/rp-phone/RpTunesMessages';
import { useMessageEvent } from '../../hooks';
import { SetJukeboxPhoneOn, SetJukeboxVolume, useJukeboxPrefs, useJukeboxState } from '../music-player/JukeboxStore';
import { ParseVideoId, PlaySitchSong, StopSitchSong, useSitchSong } from '../music-player/SitchSongStore';
import { SiriWave } from '../music-player/SiriWave';
import { PhoneIcon } from './PhoneIcon';

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

const formatClock = (seconds: number): string =>
{
    const safe = Math.max(0, Math.floor(seconds));

    return `${ Math.floor(safe / 60) }:${ (safe % 60).toString().padStart(2, '0') }`;
}

export const PhoneMusicView: FC<PhoneMusicViewProps> = props =>
{
    const { onBack = null } = props;
    const { current, queue, present } = useJukeboxState();
    const { phoneOn, volume } = useJukeboxPrefs();
    const [ view, setView ] = useState<'now' | 'queue'>('now');
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

    const go = (to: 'now' | 'queue') =>
    {
        setSlide((to === 'queue') ? 'right' : 'left');
        setView(to);
    }

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
        PlaySitchSong({ videoId, title: '', author: '', userId: 0 });
        setPersonalUrl('');
        setPersonalOpen(false);
    }

    const stopPersonal = () =>
    {
        StopSitchSong();
        showToast('Stopped your song.');
    }

    // Tuning in is the inverse of a Sitch profile song taking over, and it is
    // the one control a listener can always reach: the stop button for a song
    // lives on the profile that started it, which may be several taps away.
    const toggleRadio = () =>
    {
        StopSitchSong();
        SetJukeboxPhoneOn(!phoneOn);
    }

    // The request sheet is shared in spirit with the room jukebox panel and
    // deliberately untouched by the restyle: same plate, halo and Add.
    const requestSheet = (
        <>
            <div className="phone-calendar-scrim" onClick={ event => setRequesting(false) } />
            <div className="phone-calendar-sheet phone-music-sheet">
                <div className="phone-calendar-grabber" />
                <div className="phone-music-sheet-title">Request a song in this room</div>
                <div className="phone-music-sheet-sub">
                    { queue.length ? `Paste a YouTube link. It joins this room's queue behind ${ queue.length } ${ (queue.length === 1) ? 'other' : 'others' }.` : "Paste a YouTube link. This room's queue is empty, so it plays next." }
                </div>
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
                <div className="phone-music-sheet-note">One request at a time per player in this room. The jukebox standing here and this app share the same queue.</div>
            </div>
        </>
    );

    const eq = <span className="phone-music-eq"><i /><i /><i /><i /></span>;

    const personalSheet = (
        <>
            <div className="phone-calendar-scrim" onClick={ event => setPersonalOpen(false) } />
            <div className="phone-calendar-sheet phone-music-sheet">
                <div className="phone-calendar-grabber" />
                <div className="phone-music-sheet-title">Play just for you</div>
                <div className="phone-music-sheet-sub">Paste a YouTube link. It plays in your ears only - nobody else in the room hears it, and it never joins the queue.</div>
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
                <div className="phone-music-sheet-note">The station pauses while this plays. A room jukebox keeps its own time and picks up where the room has got to when your song ends.</div>
            </div>
        </>
    );

    // On the front page, because it is half of what the app is for and the other
    // half - the room's jukebox - is not there at all when no jukebox is. It
    // sits above the source line rather than up by the cover: the pane does not
    // scroll, so it goes where there is give, and the give is at the bottom.
    //
    // A song playing only for you is also easy to forget about, and until this
    // the only stop button was on the profile that started it.
    const personalSection = (
        <div className="phone-music-personal">
            <div className="phone-music-section">Just for you</div>
            { personal &&
                <div className="phone-music-row is-playing">
                    <img className="phone-music-row-art" src={ `https://i.ytimg.com/vi/${ personal.videoId }/mqdefault.jpg` } alt="" draggable={ false } onLoad={ event => event.currentTarget.classList.add('is-loaded') } />
                    <div className="phone-music-row-text">
                        <div className="phone-music-row-title">{ personal.title || 'Your song' }</div>
                        <div className="phone-music-row-by">{ personal.author || 'Playing in your ears only' }</div>
                    </div>
                    { eq }
                    <div className="phone-tap phone-music-rowbtn" title="Stop" onClick={ stopPersonal }>
                        <PhoneIcon icon="stop" size={ 17 } />
                    </div>
                </div> }
            { !personal &&
                <div className="phone-tap phone-music-pill is-quiet" onClick={ event => { setPersonalUrl(''); setPersonalOpen(true); } }>
                    <PhoneIcon icon="play" size={ 15 } />
                    Play a song just for you
                </div> }
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

    // where the sound is coming from for THIS player
    const sourceRow = (personal
        ? (
            <div className="phone-tap phone-music-source is-on" title="Stop your song" onClick={ stopPersonal }>
                <PhoneIcon icon="mobile-screen" size={ 14 } />
                <span>Playing your song &middot; tap to stop</span>
            </div>
        )
        : (
            <div className={ `phone-music-source${ phoneOn ? ' is-on' : '' }` }>
                <PhoneIcon icon={ phoneOn ? 'mobile-screen' : (present ? 'radio' : 'mobile-screen') } size={ 14 } />
                <span>{ phoneOn ? 'Playing on your phone' : (present ? 'Playing on the room jukebox' : 'Paused on your phone') }</span>
            </div>
        ));


    const queueRow = (entry: { videoId: string, title: string, queuedBy: string }, index: number, playing: boolean = false) => (
        <div key={ `${ entry.videoId }-${ index }` } className={ `phone-music-row${ playing ? ' is-playing' : '' }` } style={ { animationDelay: `${ 40 + Math.min(index, 8) * 40 }ms` } }>
            <img className="phone-music-row-art" src={ `https://i.ytimg.com/vi/${ entry.videoId }/mqdefault.jpg` } alt="" draggable={ false } onLoad={ event => event.currentTarget.classList.add('is-loaded') } />
            <div className="phone-music-row-text">
                <div className="phone-music-row-title">{ entry.title }</div>
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

    const nowScreen = (
        <div className="phone-music-pane">
            { topBar('chevron-down', () => (onBack && onBack()), 'SPOTIFY', queueButton) }
            { !current &&
                <>
                    <div className="phone-music-coverwrap">
                        <div className="phone-music-cover is-empty">
                            <PhoneIcon icon="waveform-lines" size={ 88 } />
                        </div>
                    </div>
                    <div className="phone-music-titles">
                        <div className="phone-music-titles-text">
                            <div className="phone-music-title">The station is quiet</div>
                            <div className="phone-music-sub is-wrap">{ present ? 'Nothing is queued in this room. Request a song and it starts right away for everyone here.' : 'No jukebox in this room, so there is nothing to request into. Play a song just for yourself instead.' }</div>
                        </div>
                    </div>
                    { present &&
                        <div className="phone-music-pill phone-tap" onClick={ openRequest }>
                            <PhoneIcon icon="plus" size={ 16 } />
                            Request a song in this room
                        </div> }
                </> }
            { current &&
                <div className="phone-music-now" key={ current.videoId }>
                    <div className="phone-music-coverwrap">
                        <div className={ `phone-music-cover${ phoneOn ? ' is-playing' : '' }` }>
                            <img src={ art } alt="" draggable={ false } onLoad={ event => event.currentTarget.classList.add('is-loaded') } />
                        </div>
                    </div>
                    <div className="phone-music-titles">
                        <div className="phone-music-titles-text">
                            <div className="phone-music-title">{ current.title }</div>
                            <div className="phone-music-sub">{ current.author ? `${ current.author } · ` : '' }requested by { byName(current.queuedBy) }</div>
                        </div>
                        { present &&
                            <div className="phone-tap phone-music-addbtn" title="Request a song" onClick={ openRequest }>
                                <PhoneIcon icon="circle-plus" size={ 26 } />
                            </div> }
                    </div>
                    <div className="phone-music-progress">
                        <div className="phone-music-track">
                            <div className="phone-music-fill" style={ { width: `${ progress }%` } } />
                            <div className="phone-music-knob" style={ { left: `${ progress }%` } } />
                        </div>
                        <div className="phone-music-times">
                            <span>{ formatClock(elapsed) }</span>
                            <span>{ duration > 0 ? formatClock(duration) : 'live' }</span>
                        </div>
                    </div>
                    { /* the play/pause is this player's own switch: it never
                         touches the stream everyone else hears. Skip is staff
                         only and DOES move everyone on. */ }
                    <div className="phone-music-transport">
                        <div className={ `phone-tap phone-music-sidebtn${ volumeOpen ? ' is-on' : '' }` } title="Volume" onClick={ event => setVolumeOpen(!volumeOpen) }>
                            <PhoneIcon icon={ volume === 0 ? 'volume-xmark' : (volume < 50 ? 'volume-low' : 'volume-high') } size={ 22 } />
                        </div>
                        <div className={ `phone-tap phone-music-play${ phoneOn ? ' is-on' : '' }` } title={ phoneOn ? 'Pause (just for you)' : 'Listen' } onClick={ event => toggleRadio() }>
                            <PhoneIcon icon={ phoneOn ? 'pause' : 'play' } size={ 26 } />
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
                    { volumeOpen &&
                        <div className="phone-music-volume">
                            <PhoneIcon icon="volume-low" size={ 13 } />
                            <input type="range" min={ 0 } max={ 100 } value={ volume } style={ { '--fill': `${ volume }%` } as React.CSSProperties } onChange={ event => SetJukeboxVolume(parseInt(event.target.value)) } />
                            <PhoneIcon icon="volume-high" size={ 13 } />
                        </div> }
                    <div className="phone-music-spacer" />
                    { (queue.length > 0) &&
                        <div className="phone-tap phone-music-upnext" onClick={ event => go('queue') }>
                            <img className="phone-music-upnext-art" src={ `https://i.ytimg.com/vi/${ queue[0].videoId }/mqdefault.jpg` } alt="" draggable={ false } />
                            <div className="phone-music-upnext-text">
                                <div className="phone-music-upnext-kicker">UP NEXT</div>
                                <div className="phone-music-upnext-title">{ queue[0].title }</div>
                            </div>
                            <div className="phone-music-upnext-by">{ byName(queue[0].queuedBy) }</div>
                        </div> }
                </div> }
            { personalSection }
            { current && sourceRow }
            { !current && <div className="phone-music-spacer" /> }
            { !current && sourceRow }
        </div>
    );

    const queueScreen = (
        <div className="phone-music-pane">
            { topBar('chevron-left', () => go('now'), 'THIS ROOM') }
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
                { (view === 'now') ? nowScreen : queueScreen }
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
