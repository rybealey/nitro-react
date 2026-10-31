import { FC, useEffect, useMemo, useState } from 'react';
import { SendMessageComposer } from '../../../api';
import { RpRankTitle } from '../../../api/rp-employment/RpEmploymentRegistry';
import { CorpPanelAction, CorpPanelContext, CorpPanelShiftRow, CorpPanelShifts, RpCorpPanelActionComposer, RpCorpPanelShiftsEvent } from '../../../api/rp-corps/RpCorpPanelMessages';
import { useMessageEvent } from '../../../hooks';
import { CorpHead, CorpPresence, CorpWeekSwitch, DAY_NAMES, ShiftsOf, UkDayIndex, WeekRange } from '../CorpPanelShared';

// The Corporation Panel's Weekly shifts: every employee's 10-minute shifts on
// each UK day of the week, against the corporation's weekly quota
// (rp_corporations.shift_quota). Highest rank first, as the server sends it.

interface CorpShiftsViewProps
{
    context: CorpPanelContext;
    weeksAgo: number;
    onWeekChange: (weeksAgo: number) => void;
}

type Filter = 'all' | 'short' | 'met';

type Standing = 'met' | 'close' | 'short' | 'none';

const REFRESH_MS = 60000;

// Close = at least 70% of the quota: a nudge rather than a problem.
const standingOf = (shifts: number, quota: number): Standing =>
{
    if(quota <= 0) return 'none';
    if(shifts >= quota) return 'met';

    return ((shifts >= Math.ceil(quota * 0.7)) ? 'close' : 'short');
}

const STANDING_LABEL: Record<Standing, string> = { met: 'Met', close: 'Close', short: 'Short', none: '' };

// Heat for a day cell: none, one, two, three or more shifts.
const heatOf = (shifts: number): string => ((shifts <= 0) ? '' : `is-heat-${ Math.min(3, shifts) }`);

export const CorpShiftsView: FC<CorpShiftsViewProps> = props =>
{
    const { weeksAgo = 0, onWeekChange = null } = props;
    const [ shifts, setShifts ] = useState<CorpPanelShifts>(null);
    const [ filter, setFilter ] = useState<Filter>('all');
    const [ search, setSearch ] = useState('');
    const [ now, setNow ] = useState(Date.now());

    useMessageEvent<RpCorpPanelShiftsEvent>(RpCorpPanelShiftsEvent, event => setShifts(event.getParser().shifts));

    useEffect(() =>
    {
        const request = () =>
        {
            setNow(Date.now());
            SendMessageComposer(new RpCorpPanelActionComposer(CorpPanelAction.Shifts, weeksAgo));
        }

        request();

        if(weeksAgo !== 0) return;

        const interval = setInterval(request, REFRESH_MS);

        return () => clearInterval(interval);
    }, [ weeksAgo ]);

    const shown = ((shifts && (shifts.weeksAgo === weeksAgo)) ? shifts : null);
    const quota = (shown?.shiftQuota ?? 0);
    const today = ((shown && (weeksAgo === 0)) ? UkDayIndex(shown.weekStartedAt, now) : 7);

    const rows = useMemo(() => (shown?.rows ?? []).map(row => ({ row, total: ShiftsOf(row.weekSeconds), standing: standingOf(ShiftsOf(row.weekSeconds), quota) })), [ shown, quota ]);
    const counts = {
        all: rows.length,
        short: rows.filter(entry => ((entry.standing === 'short') || (entry.standing === 'close'))).length,
        met: rows.filter(entry => (entry.standing === 'met')).length
    };
    const query = search.trim().toLowerCase();
    const visible = rows.filter(entry =>
    {
        if(query && !entry.row.username.toLowerCase().includes(query)) return false;
        if(filter === 'met') return (entry.standing === 'met');
        if(filter === 'short') return ((entry.standing === 'short') || (entry.standing === 'close'));

        return true;
    });
    const totalShifts = rows.reduce((sum, entry) => (sum + entry.total), 0);

    return (
        <div className="corp-page">
            <div className="corp-page-head">
                <div className="corp-page-title">
                    <h2>Weekly shifts</h2>
                    <p>
                        { shown ? WeekRange(shown.weekStartedAt, shown.weekResetAt) : '' }
                        { shown && ((quota > 0) ? ` · the quota is ${ quota } shifts a week` : ' · no weekly quota') }
                    </p>
                </div>
                <CorpWeekSwitch weeksAgo={ weeksAgo } onChange={ onWeekChange } />
            </div>
            { shown &&
                <div className="corp-stats is-4">
                    <div className="corp-stat"><b>{ totalShifts.toLocaleString('en-US') }</b><span>Shifts worked</span></div>
                    <div className="corp-stat"><b>{ rows.length ? (totalShifts / rows.length).toFixed(1) : '0' }</b><span>Average per employee</span></div>
                    <div className="corp-stat"><b>{ (quota > 0) ? `${ counts.met } of ${ rows.length }` : '–' }</b><span>Met the quota</span></div>
                    <div className={ `corp-stat ${ (counts.short > 0) && (quota > 0) ? 'is-warn' : '' }` }><b>{ (quota > 0) ? counts.short : '–' }</b><span>{ (weeksAgo === 0) ? 'Still short' : 'Ended short' }</span></div>
                </div> }
            <div className="corp-tools">
                <input className="form-control form-control-sm corp-search" type="search" placeholder="Search employees" aria-label="Search employees" value={ search } onChange={ event => setSearch(event.target.value) } />
                <div className="mt-seg corp-filter-seg" role="group" aria-label="Show">
                    { ([ [ 'all', 'Everyone' ], [ 'short', 'Short' ], [ 'met', 'Met' ] ] as [ Filter, string ][]).map(([ key, label ]) =>
                        <button key={ key } type="button" aria-pressed={ (key === filter) } className={ `mt-seg-button ${ (key === filter) ? 'is-on' : '' }` } onClick={ () => setFilter(key) } disabled={ (key !== 'all') && (quota <= 0) }>
                            { label } <span className="corp-seg-n">{ counts[key] }</span>
                        </button>) }
                </div>
            </div>
            { !shown && <div className="mt-empty">Loading shifts…</div> }
            { shown &&
                <section className="mt-card corp-table-wrap">
                    <table className="corp-table">
                        <thead>
                            <tr>
                                <th>Employee</th>
                                { DAY_NAMES.map(day => <th key={ day } className="is-center">{ day }</th>) }
                                <th className="corp-quota-col">{ (quota > 0) ? 'Quota' : 'Total' }</th>
                                { (quota > 0) && <th>Status</th> }
                            </tr>
                        </thead>
                        <tbody>
                            { visible.map(({ row, total, standing }) =>
                                <ShiftRow key={ row.userId } row={ row } total={ total } standing={ standing } quota={ quota } today={ today } />) }
                        </tbody>
                    </table>
                    { (visible.length === 0) && <div className="mt-empty">{ rows.length ? 'Nobody matches.' : 'Nobody works here yet.' }</div> }
                </section> }
        </div>
    );
}

const ShiftRow: FC<{ row: CorpPanelShiftRow, total: number, standing: Standing, quota: number, today: number }> = props =>
{
    const { row, total, standing, quota, today } = props;

    return (
        <tr>
            <td>
                <div className="corp-person">
                    <CorpHead look={ row.look } gender={ row.gender } />
                    <div className="corp-who">
                        <b>{ row.username }</b>
                        <span>{ RpRankTitle(row.rankName, row.tier) }</span>
                    </div>
                    <CorpPresence onDuty={ row.onDuty } online={ row.online } />
                </div>
            </td>
            { row.daySeconds.map((seconds, index) =>
            {
                const shifts = ShiftsOf(seconds);

                return (
                    <td key={ index } className="is-center corp-day-cell">
                        <span className={ `corp-heat ${ (index > today) ? 'is-future' : heatOf(shifts) }` }>{ (index > today) ? '' : shifts }</span>
                    </td>
                );
            }) }
            <td>
                { (quota > 0)
                    ? <div className="corp-quota">
                        <div className="corp-bar"><div className={ `corp-bar-fill is-${ standing }` } style={ { width: `${ Math.min(100, Math.round(total / quota * 100)) }%` } } /></div>
                        <b>{ total }/{ quota }</b>
                    </div>
                    : <b>{ total }</b> }
            </td>
            { (quota > 0) && <td><span className={ `corp-chip is-${ standing }` }>{ STANDING_LABEL[standing] }</span></td> }
        </tr>
    );
}
