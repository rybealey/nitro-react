import { FC, useEffect, useState } from 'react';
import { SendMessageComposer } from '../../../api';
import { CorpDismissal, CorpDismissalKind, CorpPanelAction, CorpPanelDismissals, RpCorpPanelActionComposer, RpCorpPanelDismissalsEvent } from '../../../api/rp-corps/RpCorpPanelMessages';
import { useMessageEvent } from '../../../hooks';
import { CorpPanelLinks, CorpPanelPage } from '../CorpPanelView';
import { CorpHead, LongDate, RecordTime } from '../CorpPanelShared';

// The Corporation Panel's Dismissals: everyone who has left, logged by
// itself - :fire (with its reason), :quitjob and staff :superfire - with their
// last rank, how long they were here, and whether they can come back, which
// is the blacklist's say. Kept for good.

interface CorpDismissalsViewProps
{
    links: CorpPanelLinks;
    onOpen: (page: CorpPanelPage) => void;
}

type Filter = 'all' | CorpDismissalKind;

const KIND_LABEL: Record<CorpDismissalKind, string> = { fired: 'Fired', quit: 'Quit', staff: 'Removed by staff' };

const PERIODS: [ number, string ][] = [ [ 30, 'Last 30 days' ], [ 90, 'Last 90 days' ], [ 0, 'All time' ] ];

// "3 weeks", "2 months", "6 days"
const servedFor = (row: CorpDismissal): string =>
{
    if(!row.hiredAt) return '';

    const days = Math.max(0, Math.round((row.createdAt - row.hiredAt) / 86400));

    if(days >= 60) return `${ Math.round(days / 30) } months`;
    if(days >= 14) return `${ Math.round(days / 7) } weeks`;

    return `${ days } ${ (days === 1) ? 'day' : 'days' }`;
}

export const CorpDismissalsView: FC<CorpDismissalsViewProps> = props =>
{
    const { links = null, onOpen = null } = props;
    const [ data, setData ] = useState<CorpPanelDismissals>(null);
    const [ period, setPeriod ] = useState(30);
    const [ filter, setFilter ] = useState<Filter>('all');
    const [ search, setSearch ] = useState('');
    const [ now, setNow ] = useState(Date.now());

    useMessageEvent<RpCorpPanelDismissalsEvent>(RpCorpPanelDismissalsEvent, event =>
    {
        const next = event.getParser().dismissals;

        if(next.days === period) setData(next);
    });

    useEffect(() =>
    {
        setNow(Date.now());
        SendMessageComposer(new RpCorpPanelActionComposer(CorpPanelAction.Dismissals, period));
    }, [ period, links.refreshKey ]);

    const shown = ((data && (data.days === period)) ? data : null);
    const rows = (shown?.rows ?? []);
    const query = search.trim().toLowerCase();
    const visible = rows.filter(row => ((filter === 'all') || (row.kind === filter)) && (!query || row.username.toLowerCase().includes(query) || row.reason.toLowerCase().includes(query)));

    return (
        <div className="corp-page">
            <div className="corp-page-head">
                <div className="corp-page-title">
                    <h2>Dismissals</h2>
                    <p>Everyone who has left, logged by itself from :fire, :quitjob and staff. Whether they can come back is up to the blacklist.</p>
                </div>
                <select className="form-select form-select-sm corp-period" value={ period } onChange={ event => setPeriod(Number(event.target.value)) } aria-label="Period">
                    { PERIODS.map(([ days, label ]) => <option key={ days } value={ days }>{ label }</option>) }
                </select>
            </div>
            <div className="corp-tools">
                <input className="form-control form-control-sm corp-search" type="search" placeholder="Search former employees" aria-label="Search former employees" value={ search } onChange={ event => setSearch(event.target.value) } />
                <div className="mt-seg corp-filter-seg" role="group" aria-label="How they left">
                    { ([ [ 'all', 'All' ], [ 'fired', 'Fired' ], [ 'quit', 'Quit' ], [ 'staff', 'Staff' ] ] as [ Filter, string ][]).map(([ key, label ]) =>
                        <button key={ key } type="button" aria-pressed={ (key === filter) } className={ `mt-seg-button ${ (key === filter) ? 'is-on' : '' }` } onClick={ () => setFilter(key) }>
                            { label } <span className="corp-seg-n">{ (key === 'all') ? rows.length : rows.filter(row => (row.kind === key)).length }</span>
                        </button>) }
                </div>
            </div>
            { !shown && <div className="mt-empty">Loading…</div> }
            { shown &&
                <section className="mt-card corp-table-wrap">
                    { (visible.length > 0) &&
                        <table className="corp-table">
                            <thead>
                                <tr><th>Former employee</th><th>How</th><th>Reason</th><th>By</th><th>Left</th><th>Rehire</th></tr>
                            </thead>
                            <tbody>
                                { visible.map(row =>
                                    <tr key={ row.id }>
                                        <td>
                                            <div className="corp-person">
                                                <CorpHead look={ row.look } gender={ row.gender } />
                                                <div className="corp-who">
                                                    <b>{ row.username }</b>
                                                    <span>{ row.rankTitle }{ servedFor(row) ? ` · ${ servedFor(row) }` : '' }</span>
                                                </div>
                                            </div>
                                        </td>
                                        <td><span className={ `corp-chip ${ (row.kind === 'fired') ? 'is-short' : ((row.kind === 'staff') ? 'is-close' : '') }` }>{ KIND_LABEL[row.kind] ?? row.kind }</span></td>
                                        <td className="corp-reason"><b>{ row.reason || ((row.kind === 'quit') ? 'Resigned' : '–') }</b></td>
                                        <td>{ (row.kind === 'quit') ? 'Themselves' : row.actorName }</td>
                                        <td className="corp-time">{ RecordTime(row.createdAt, now) }</td>
                                        <td>
                                            { (row.rehire === 'eligible') && <span className="corp-chip is-met">Eligible</span> }
                                            { (row.rehire === 'until') && <span className="corp-chip is-close">After { LongDate(row.rehireAt) }</span> }
                                            { (row.rehire === 'never') && <span className="corp-chip is-short">Not eligible</span> }
                                        </td>
                                    </tr>) }
                            </tbody>
                        </table> }
                    { (visible.length === 0) && <div className="mt-empty">{ (rows.length > 0) ? 'Nothing matches.' : 'Nobody has left in this period.' }</div> }
                </section> }
            <div className="corp-effect is-quiet">
                Someone who shouldn&apos;t come back goes on the <button type="button" className="corp-inline-link" onClick={ () => onOpen('blacklist') }>Blacklist</button>; :hire refuses them, on any of their characters.
            </div>
        </div>
    );
}
