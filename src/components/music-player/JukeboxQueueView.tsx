import { RpJukeboxAddComposer, RpJukeboxRemoveComposer, RpJukeboxSkipComposer } from '@nitrots/nitro-renderer';
import { FC, useState } from 'react';
import { SendMessageComposer } from '../../api';
import { Button, NitroCardContentView, NitroCardHeaderView, NitroCardView } from '../../common';
import { JukeboxCurrent, JukeboxQueueEntry } from './useJukebox';

// Opened from the music player panel's plus-large icon: paste a YouTube
// link to queue it for the room; rights holders (and the person who queued
// a song) can remove; rights holders can skip. All enforcement is
// server-side — these controls just send the packets.
interface JukeboxQueueViewProps
{
    current: JukeboxCurrent;
    queue: JukeboxQueueEntry[];
    onClose: () => void;
}

export const JukeboxQueueView: FC<JukeboxQueueViewProps> = props =>
{
    const { current = null, queue = [], onClose = null } = props;
    const [ url, setUrl ] = useState('');

    const addUrl = () =>
    {
        if(!url.trim().length) return;
        SendMessageComposer(new RpJukeboxAddComposer(url.trim()));
        setUrl('');
    }

    return (
        <NitroCardView uniqueKey="jukebox-queue" className="nitro-jukebox-queue" theme="primary-slim">
            <NitroCardHeaderView headerText="Jukebox" onCloseClick={ event => (onClose && onClose()) } />
            <NitroCardContentView className="text-black">
                <div className="jukebox-queue-now">
                    <b>Now playing:</b> { current ? `${ current.title } — ${ current.author }` : 'Nothing' }
                    { current && <Button variant="secondary" onClick={ event => SendMessageComposer(new RpJukeboxSkipComposer()) }>Skip</Button> }
                </div>
                <div className="jukebox-queue-list">
                    { queue.map((entry, index) => (
                        <div key={ `${ entry.videoId }-${ index }` } className="jukebox-queue-row">
                            <span className="jukebox-queue-title">{ entry.title }</span>
                            <span className="jukebox-queue-by">{ entry.queuedBy }</span>
                            <Button variant="danger" onClick={ event => SendMessageComposer(new RpJukeboxRemoveComposer(index)) }>×</Button>
                        </div>
                    )) }
                    { !queue.length && <div className="jukebox-queue-empty">Queue is empty — add a song below.</div> }
                </div>
                <div className="jukebox-queue-add">
                    <input type="text" className="form-control form-control-sm" spellCheck={ false } placeholder="Paste a YouTube link" value={ url } onChange={ event => setUrl(event.target.value) } onKeyDown={ event => (event.key === 'Enter') && addUrl() } />
                    <Button onClick={ event => addUrl() }>Add</Button>
                </div>
            </NitroCardContentView>
        </NitroCardView>
    );
}
