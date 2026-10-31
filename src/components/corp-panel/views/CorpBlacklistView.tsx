import { FC, FormEvent, useEffect, useState } from 'react';
import { SendMessageComposer } from '../../../api';
import { CorpBlacklistEntry, CorpPanelAction, CorpPanelResult, CorpRecordAction, RECORD_RESULT_BASE, RpCorpPanelActionComposer, RpCorpPanelBlacklistEvent, RpCorpPanelRecordComposer, RpCorpPanelResultEvent } from '../../../api/rp-corps/RpCorpPanelMessages';
import { useMessageEvent } from '../../../hooks';
import { CorpPanelLinks } from '../CorpPanelView';
import { CorpHead, LongDate } from '../CorpPanelShared';

// The Corporation Panel's Blacklist: players the corporation won't hire. An
// entry covers every character of the player's account, and :hire refuses
// them by itself, so nobody has to remember the list. "Before you hire"
// asks the server, which knows whose characters are whose.

interface CorpBlacklistViewProps
{
    links: CorpPanelLinks;
}

const LENGTHS: [ number, string ][] = [ [ 7, '1 week' ], [ 14, '2 weeks' ], [ 30, '1 month' ], [ 90, '3 months' ], [ 0, 'For good' ] ];

export const CorpBlacklistView: FC<CorpBlacklistViewProps> = props =>
{
    const { links = null } = props;
    const [ entries, setEntries ] = useState<CorpBlacklistEntry[]>(null);
    const [ check, setCheck ] = useState('');
    const [ checked, setChecked ] = useState<CorpPanelResult>(null);
    const [ adding, setAdding ] = useState(false);
    const [ now, setNow ] = useState(Date.now());

    useMessageEvent<RpCorpPanelBlacklistEvent>(RpCorpPanelBlacklistEvent, event => setEntries(event.getParser().entries));

    useMessageEvent<RpCorpPanelResultEvent>(RpCorpPanelResultEvent, event =>
    {
        const result = event.getParser().result;

        if(result.action === (RECORD_RESULT_BASE + CorpRecordAction.BlacklistCheck)) setChecked(result);
    });

    useEffect(() =>
    {
        setNow(Date.now());
        SendMessageComposer(new RpCorpPanelActionComposer(CorpPanelAction.Blacklist, 0));
    }, [ links.refreshKey ]);

    const runCheck = (event: FormEvent) =>
    {
        event.preventDefault();

        if(!check.trim()) return;

        setChecked(null);
        SendMessageComposer(new RpCorpPanelRecordComposer(CorpRecordAction.BlacklistCheck, 0, 0, 0, check.trim()));
    }

    const remove = (entry: CorpBlacklistEntry) => SendMessageComposer(new RpCorpPanelRecordComposer(CorpRecordAction.BlacklistRemove, entry.id));

    const list = (entries ?? []);
    const forGood = list.filter(entry => !entry.expiresAt).length;
    const nowSeconds = (now / 1000);

    return (
        <div className="corp-page">
            <div className="corp-page-head">
                <div className="corp-page-title">
                    <h2>Blacklist</h2>
                    <p>Players your corporation won&apos;t hire. :hire refuses them by itself, on any of their characters.</p>
                </div>
                <button type="button" className="mt-chrome corp-primary" onClick={ () => setAdding(true) }>Add a player</button>
            </div>
            <form className="mt-card corp-check-card" onSubmit={ runCheck }>
                <label className="mt-label" htmlFor="corp-hire-check">Before you hire</label>
                <div className="corp-tools">
                    <input id="corp-hire-check" className="form-control form-control-sm corp-search" placeholder="A player's name" value={ check } onChange={ event =>
                    {
                        setCheck(event.target.value);
                        setChecked(null);
                    } } />
                    <button type="submit" className="mt-ghost" disabled={ !check.trim() }>Check</button>
                    { checked && <span className={ `corp-chip ${ checked.ok ? 'is-met' : 'is-short' } corp-check-result` } role="status">{ checked.message }</span> }
                </div>
            </form>
            <div className="corp-tools">
                <h3 className="corp-section-title">{ list.length } { (list.length === 1) ? 'player' : 'players' }</h3>
                { (forGood > 0) && <span className="corp-chip is-short">{ forGood } for good</span> }
                { (list.length - forGood > 0) && <span className="corp-chip">{ list.length - forGood } with an end date</span> }
            </div>
            { !entries && <div className="mt-empty">Loading…</div> }
            { entries && (list.length === 0) && <section className="mt-card"><div className="mt-empty">Nobody is on the blacklist.</div></section> }
            <div className="corp-cards">
                { list.map(entry =>
                {
                    const left = (entry.expiresAt ? Math.max(0, Math.min(100, Math.round((entry.expiresAt - nowSeconds) / Math.max(1, entry.expiresAt - entry.createdAt) * 100))) : 100);

                    return (
                        <article key={ entry.id } className="mt-card corp-black-card">
                            <div className="corp-row is-plain">
                                <CorpHead look={ entry.look } gender={ entry.gender } />
                                <div className="corp-who">
                                    <b>{ entry.username }</b>
                                    <span>Added { LongDate(entry.createdAt) } by { entry.addedByName }</span>
                                </div>
                            </div>
                            <b className="corp-black-reason">{ entry.reason }</b>
                            <div className="corp-black-foot">
                                <span className={ `corp-chip ${ entry.expiresAt ? '' : 'is-short' }` }>{ entry.expiresAt ? `Until ${ LongDate(entry.expiresAt) }` : 'For good' }</span>
                                <div className="corp-bar"><div className={ `corp-bar-fill ${ entry.expiresAt ? '' : 'is-short' }` } style={ { width: `${ left }%` } } /></div>
                                { entry.canRemove && <button type="button" className="mt-ghost mt-small" onClick={ () => remove(entry) }>Remove</button> }
                            </div>
                        </article>
                    );
                }) }
            </div>
            { adding && <CorpBlacklistDialog onClose={ () => setAdding(false) } /> }
        </div>
    );
}

const CorpBlacklistDialog: FC<{ onClose: () => void }> = props =>
{
    const { onClose } = props;
    const [ username, setUsername ] = useState('');
    const [ reason, setReason ] = useState('');
    const [ days, setDays ] = useState(30);
    const [ sending, setSending ] = useState(false);
    const [ error, setError ] = useState('');

    useMessageEvent<RpCorpPanelResultEvent>(RpCorpPanelResultEvent, event =>
    {
        const result = event.getParser().result;

        if(!sending || (result.action !== (RECORD_RESULT_BASE + CorpRecordAction.BlacklistAdd))) return;

        setSending(false);

        if(result.ok) onClose();
        else setError(result.message);
    });

    const submit = (event: FormEvent) =>
    {
        event.preventDefault();

        if(!username.trim() || !reason.trim() || sending) return;

        setSending(true);
        setError('');
        SendMessageComposer(new RpCorpPanelRecordComposer(CorpRecordAction.BlacklistAdd, 0, days, 0, username.trim(), reason.trim().slice(0, 128)));
    }

    return (
        <div className="corp-scrim" onMouseDown={ event => ((event.target === event.currentTarget) && onClose()) }>
            <form className="corp-dialog" role="dialog" aria-modal="true" aria-labelledby="corp-black-title" onSubmit={ submit }>
                <div className="corp-dialog-head">
                    <h3 id="corp-black-title">Add to the blacklist</h3>
                    <button type="button" className="corp-icon-button" aria-label="Close" onClick={ onClose }>×</button>
                </div>
                <div className="corp-dialog-body">
                    <label className="corp-field">
                        <span className="mt-label">Player</span>
                        <input className="form-control form-control-sm" placeholder="Their name" value={ username } onChange={ event => setUsername(event.target.value) } autoFocus />
                    </label>
                    <label className="corp-field">
                        <span className="mt-label">Why</span>
                        <input className="form-control form-control-sm" maxLength={ 128 } placeholder="Stole from the till, harassed staff…" value={ reason } onChange={ event => setReason(event.target.value) } />
                    </label>
                    <div className="corp-field">
                        <span className="mt-label" id="corp-black-length">How long</span>
                        <div className="corp-reasons" role="group" aria-labelledby="corp-black-length">
                            { LENGTHS.map(([ value, label ]) =>
                                <button key={ value } type="button" aria-pressed={ (value === days) } className={ `mt-seg-button ${ (value === days) ? 'is-on' : '' }` } onClick={ () => setDays(value) }>{ label }</button>) }
                        </div>
                    </div>
                    <div className="corp-effect is-quiet">Covers all of their characters. They aren&apos;t fired by this: use :fire if they still work here.</div>
                    { error && <div className="corp-effect is-bad" role="alert">{ error }</div> }
                </div>
                <div className="corp-dialog-foot">
                    <button type="button" className="mt-ghost" onClick={ onClose }>Cancel</button>
                    <button type="submit" className="mt-danger" disabled={ !username.trim() || !reason.trim() || sending }>{ sending ? 'Adding…' : 'Add to blacklist' }</button>
                </div>
            </form>
        </div>
    );
}
