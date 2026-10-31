import { FC, useEffect, useState } from 'react';
import { SendMessageComposer } from '../../../api';
import { CorpPanelAction, CorpPanelRankLog, CorpRankChange, CorpRankDirection, RpCorpPanelActionComposer, RpCorpPanelRankLogEvent } from '../../../api/rp-corps/RpCorpPanelMessages';
import { useMessageEvent } from '../../../hooks';
import { CorpPanelLinks } from '../CorpPanelView';
import { CorpHead, CorpName, CorpWeekSwitch, RecordTime, ShiftsOf, WeekRange } from '../CorpPanelShared';

// The Corporation Panel's Promotions and Demotions logs (Logs). Nobody writes
// to them: every :promote / :demote and every approved request lands here by
// itself, with the employee's week as it stood at the time.

interface CorpRankLogViewProps
{
    direction: CorpRankDirection;
    weeksAgo: number;
    onWeekChange: (weeksAgo: number) => void;
    links: CorpPanelLinks;
}

const sourceOf = (change: CorpRankChange): string =>
    ((change.source === 'request') ? `Approved request from ${ change.requestedByName || 'someone' }` : ((change.direction === 'promotion') ? ':promote' : ':demote'));

export const CorpRankLogView: FC<CorpRankLogViewProps> = props =>
{
    const { direction = 'promotion', weeksAgo = 0, onWeekChange = null, links = null } = props;
    const [ log, setLog ] = useState<CorpPanelRankLog>(null);
    const [ search, setSearch ] = useState('');
    const [ now, setNow ] = useState(Date.now());

    useMessageEvent<RpCorpPanelRankLogEvent>(RpCorpPanelRankLogEvent, event =>
    {
        const next = event.getParser().log;

        if(next.weeksAgo === weeksAgo) setLog(next);
    });

    useEffect(() =>
    {
        setNow(Date.now());
        SendMessageComposer(new RpCorpPanelActionComposer(CorpPanelAction.RankLog, weeksAgo));
    }, [ weeksAgo, links.refreshKey ]);

    useEffect(() => setSearch(''), [ direction ]);

    const shown = ((log && (log.weeksAgo === weeksAgo)) ? log : null);
    const isPromotion = (direction === 'promotion');
    const all = (shown?.changes ?? []).filter(change => (change.direction === direction));
    const query = search.trim().toLowerCase();
    const changes = all.filter(change => !query || change.username.toLowerCase().includes(query) || change.reason.toLowerCase().includes(query));
    const fromRequests = all.filter(change => (change.source === 'request')).length;

    return (
        <div className="corp-page">
            <div className="corp-page-head">
                <div className="corp-page-title">
                    <h2>{ isPromotion ? 'Promotions' : 'Demotions' }</h2>
                    <p>
                        { shown ? WeekRange(shown.weekStartedAt, shown.weekResetAt) : '' }
                        { ' · logged by itself from :' }{ isPromotion ? 'promote' : 'demote' }{ ' and approved requests' }
                    </p>
                </div>
                <CorpWeekSwitch weeksAgo={ weeksAgo } onChange={ onWeekChange } />
            </div>
            { shown &&
                <div className="corp-stats is-3">
                    <div className="corp-stat"><b>{ all.length }</b><span>{ isPromotion ? 'Promotions' : 'Demotions' }</span></div>
                    <div className="corp-stat"><b>{ fromRequests }</b><span>From requests</span></div>
                    <div className="corp-stat"><b>{ all.length - fromRequests }</b><span>{ isPromotion ? 'From :promote' : 'From :demote' }</span></div>
                </div> }
            <div className="corp-tools">
                <input className="form-control form-control-sm corp-search" type="search" placeholder="Search by employee or reason" aria-label="Search the log" value={ search } onChange={ event => setSearch(event.target.value) } />
            </div>
            { !shown && <div className="mt-empty">Loading…</div> }
            { shown &&
                <section className="mt-card corp-table-wrap">
                    { (changes.length > 0) &&
                        <table className="corp-table">
                            <thead>
                                <tr>
                                    <th>Employee</th>
                                    <th>{ isPromotion ? 'Promotion' : 'Demotion' }</th>
                                    <th>Reason</th>
                                    <th>Their week</th>
                                    <th>By</th>
                                    <th>When</th>
                                </tr>
                            </thead>
                            <tbody>
                                { changes.map(change =>
                                    <tr key={ change.id }>
                                        <td>
                                            <div className="corp-person">
                                                <CorpHead look={ change.look } gender={ change.gender } />
                                                <div className="corp-who">
                                                    <CorpName userId={ change.userId } name={ change.username } onOpen={ links.openEmployee } />
                                                </div>
                                            </div>
                                        </td>
                                        <td>
                                            <span className="corp-move">
                                                <span className="corp-rank">{ change.fromTitle }</span>
                                                <span className={ `corp-move-arrow is-${ direction }` } aria-label="to">→</span>
                                                <span className={ `corp-rank is-${ direction }` }>{ change.toTitle }</span>
                                            </span>
                                        </td>
                                        <td className="corp-reason"><b>{ change.reason || '–' }</b></td>
                                        <td>
                                            <span className="corp-facts">
                                                <span className="corp-chip">{ ShiftsOf(change.shiftSecondsWeek) } shifts</span>
                                                { (change.warnings > 0) && <span className="corp-chip is-close">{ change.warnings } { (change.warnings === 1) ? 'warning' : 'warnings' }</span> }
                                                { (change.strikes > 0) && <span className="corp-chip is-short">{ change.strikes } { (change.strikes === 1) ? 'strike' : 'strikes' }</span> }
                                            </span>
                                        </td>
                                        <td className="corp-reason"><b>{ change.actorName }</b><span>{ sourceOf(change) }</span></td>
                                        <td className="corp-time">{ RecordTime(change.createdAt, now) }</td>
                                    </tr>) }
                            </tbody>
                        </table> }
                    { (changes.length === 0) &&
                        <div className="mt-empty">{ query ? 'Nothing matches.' : `No ${ isPromotion ? 'promotions' : 'demotions' } ${ (weeksAgo === 0) ? 'this' : 'that' } week.` }</div> }
                </section> }
        </div>
    );
}
