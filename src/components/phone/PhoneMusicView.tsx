import { RpJukeboxAddComposer } from '@nitrots/nitro-renderer';
import React, { FC, useEffect, useState } from 'react';
import { GetSessionDataManager, SendMessageComposer } from '../../api';
import { SetJukeboxPhoneOn, SetJukeboxVolume, useJukeboxPrefs, useJukeboxState } from '../music-player/JukeboxStore';
import { SiriWave } from '../music-player/SiriWave';
import { PhoneIcon } from './PhoneIcon';

// Music app: the hotel station on your phone. Now Playing shows the track the
// whole hotel hears (state is server-authoritative and pushed to everyone);
// play/pause is YOUR on/off switch - it never touches the stream - and the
// sound comes from the one JukeboxAudioEngine at the app root, so it keeps
// going when the phone is closed and never doubles up in a jukebox room.
// The + requests a song through the same queue the room jukebox uses.

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
    const { current, queue } = useJukeboxState();
    const { phoneOn, volume } = useJukeboxPrefs();
    const [ view, setView ] = useState<'now' | 'queue'>('now');
    const [ requesting, setRequesting ] = useState(false);
    const [ url, setUrl ] = useState('');
    const [ sent, setSent ] = useState(false);
    const [ now, setNow ] = useState(() => Date.now());

    const ownName = (GetSessionDataManager().userName || 'You');

    // one clock for the progress bar
    useEffect(() =>
    {
        const interval = setInterval(() => setNow(Date.now()), 1000);

        return () => clearInterval(interval);
    }, []);

    // a fresh track: the request confirmation is stale
    useEffect(() =>
    {
        setSent(false);
    }, [ current?.videoId, queue.length ]);

    const elapsed = (current ? Math.min(Math.max(0, (now - current.startedAtMs) / 1000), (current.durationSec || Infinity)) : 0);
    const duration = (current?.durationSec || 0);
    const progress = (duration > 0 ? Math.min(100, (elapsed / duration) * 100) : 0);
    const art = (current ? `https://i.ytimg.com/vi/${ current.videoId }/hqdefault.jpg` : null);

    const submit = () =>
    {
        if(!url.trim().length) return;

        SendMessageComposer(new RpJukeboxAddComposer(url.trim()));
        setUrl('');
        setSent(true);
        setTimeout(() => setRequesting(false), 900);
    }

    const requestSheet = (
        <>
            <div className="phone-calendar-scrim" onClick={ event => setRequesting(false) } />
            <div className="phone-calendar-sheet phone-music-sheet">
                <div className="phone-calendar-grabber" />
                <div className="phone-music-sheet-title">Request a song</div>
                <div className="phone-music-sheet-sub">
                    { queue.length ? `Paste a YouTube link. It joins the hotel queue behind ${ queue.length } ${ (queue.length === 1) ? 'other' : 'others' }.` : 'Paste a YouTube link. The hotel queue is empty, so it plays next.' }
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
                <div className="phone-music-sheet-note">One request at a time per player. The room jukebox and this app share the same queue.</div>
            </div>
        </>
    );

    const header = (title: string, back: () => void) => (
        <div className="phone-app-header">
            <div className="phone-app-header-lead">
                <div className="phone-tap phone-thread-back phone-music-back" onClick={ event => back() }>
                    <PhoneIcon icon="chevron-left" size={ 24 } />
                </div>
                <div>
                    <div className="phone-app-kicker phone-music-kicker">PIXELRP RADIO</div>
                    <div className="phone-app-title">{ title }</div>
                </div>
            </div>
            <div className="phone-tap phone-music-add" title="Request a song" onClick={ event => { setSent(false); setRequesting(true); } }>
                <PhoneIcon icon="plus" size={ 16 } />
            </div>
        </div>
    );

    if(view === 'queue')
    {
        return (
            <div className="phone-screen phone-app-screen phone-music">
                <div className="phone-app-scroll">
                    { header('Up Next', () => setView('now')) }
                    { current &&
                        <div className="phone-music-nowchip">
                            <img className="phone-music-nowchip-art" src={ art } alt="" draggable={ false } />
                            <div className="phone-music-nowchip-text">
                                <div className="phone-music-nowchip-kicker">NOW PLAYING</div>
                                <div className="phone-music-nowchip-title">{ current.title }</div>
                            </div>
                            <span className="phone-music-eq"><i /><i /><i /><i /></span>
                        </div> }
                    <div className="phone-music-queue">
                        { (queue.length === 0) &&
                            <div className="phone-music-empty-line">Nothing queued yet.</div> }
                        { queue.map((entry, index) => (
                            <div key={ `${ entry.videoId }-${ index }` } className="phone-music-queue-row" style={ { animationDelay: `${ 60 + (index * 40) }ms` } }>
                                <img className="phone-music-queue-art" src={ `https://i.ytimg.com/vi/${ entry.videoId }/mqdefault.jpg` } alt="" draggable={ false } />
                                <div className="phone-music-queue-text">
                                    <div className="phone-music-queue-title">{ entry.title }</div>
                                    <div className="phone-music-queue-by">Requested by { (entry.queuedBy === ownName) ? 'you' : entry.queuedBy }</div>
                                </div>
                            </div>
                        )) }
                    </div>
                    <div className="phone-settings-footnote">Songs play in the order they were requested.</div>
                    <div className="phone-scroll-spacer" />
                </div>
                { requesting && requestSheet }
            </div>
        );
    }

    return (
        <div className="phone-screen phone-app-screen phone-music">
            <div className="phone-app-scroll">
                { header('Now Playing', () => (onBack && onBack())) }
                { !current &&
                    <div className="phone-music-idle">
                        <div className="phone-music-idle-art">
                            <PhoneIcon icon="music" size={ 56 } />
                        </div>
                        <div className="phone-music-idle-title">The station is quiet</div>
                        <div className="phone-music-idle-sub">Nothing is queued anywhere in the hotel. Request a song and it starts right away.</div>
                        <div className="phone-tap phone-music-primary" onClick={ event => { setSent(false); setRequesting(true); } }>
                            <PhoneIcon icon="plus" size={ 16 } />
                            Request a song
                        </div>
                    </div> }
                { current &&
                    <div className="phone-music-now" key={ current.videoId }>
                        <div className={ `phone-music-art${ phoneOn ? ' is-playing' : '' }` }>
                            <img src={ art } alt="" draggable={ false } />
                        </div>
                        <div className="phone-music-meta">
                            <div className="phone-music-meta-text">
                                <div className="phone-music-title">{ current.title }</div>
                                { current.author &&
                                    <div className="phone-music-artist">{ current.author }</div> }
                            </div>
                            <div className="phone-music-live">
                                <span className="phone-music-eq"><i /><i /><i /><i /></span>
                                LIVE
                            </div>
                        </div>
                        <div className="phone-music-by">Requested by { (current.queuedBy === ownName) ? 'you' : current.queuedBy } · playing hotel-wide</div>
                        <div className="phone-music-progress">
                            <div className="phone-music-progress-track"><div className="phone-music-progress-fill" style={ { width: `${ progress }%` } } /></div>
                            <div className="phone-music-progress-times">
                                <span>{ formatClock(elapsed) }</span>
                                <span>{ duration > 0 ? `-${ formatClock(duration - elapsed) }` : 'live' }</span>
                            </div>
                        </div>
                        { /* the play/pause is this player's own switch: it never
                             touches the stream everyone else hears */ }
                        <div className="phone-music-transport">
                            <div className={ `phone-tap phone-music-playpause${ phoneOn ? ' is-on' : '' }` } title={ phoneOn ? 'Pause (just for you)' : 'Listen' } onClick={ event => SetJukeboxPhoneOn(!phoneOn) }>
                                <PhoneIcon icon={ phoneOn ? 'pause' : 'play' } size={ 26 } />
                            </div>
                        </div>
                        <div className="phone-music-volume">
                            <PhoneIcon icon="volume-low" size={ 14 } />
                            <input type="range" min={ 0 } max={ 100 } value={ volume } style={ { '--fill': `${ volume }%` } as React.CSSProperties } onChange={ event => SetJukeboxVolume(parseInt(event.target.value)) } />
                            <PhoneIcon icon="volume-high" size={ 14 } />
                        </div>
                        <div className="phone-music-upnext">
                            <div className="phone-music-upnext-head">
                                <span className="phone-music-upnext-label">Up next</span>
                                { (queue.length > 0) &&
                                    <span className="phone-tap phone-music-seeall" onClick={ event => setView('queue') }>See all · { queue.length }</span> }
                            </div>
                            { (queue.length === 0) &&
                                <div className="phone-music-empty-line">Nothing queued yet - request the next one.</div> }
                            { queue.slice(0, 2).map((entry, index) => (
                                <div key={ `${ entry.videoId }-${ index }` } className="phone-music-queue-row" style={ { animationDelay: `${ 120 + (index * 40) }ms` } }>
                                    <img className="phone-music-queue-art" src={ `https://i.ytimg.com/vi/${ entry.videoId }/mqdefault.jpg` } alt="" draggable={ false } />
                                    <div className="phone-music-queue-text">
                                        <div className="phone-music-queue-title">{ entry.title }</div>
                                        <div className="phone-music-queue-by">Requested by { (entry.queuedBy === ownName) ? 'you' : entry.queuedBy }</div>
                                    </div>
                                </div>
                            )) }
                        </div>
                    </div> }
                <div className="phone-scroll-spacer" />
            </div>
            { requesting && requestSheet }
        </div>
    );
}
