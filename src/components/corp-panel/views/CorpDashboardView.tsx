import { FC, useEffect, useState } from 'react';
import { SendMessageComposer } from '../../../api';
import { CorpPanelAction, CorpPanelContext, CorpPanelDashboard, RpCorpPanelActionComposer, RpCorpPanelDashboardEvent } from '../../../api/rp-corps/RpCorpPanelMessages';
import { useMessageEvent } from '../../../hooks';
import { CorpPanelLinks, CorpPanelPage } from '../CorpPanelView';
import { CorpHead, CorpName, CorpPresence, CorpWeekSwitch, DAY_NAMES, ShiftsOf, TimeUntil, UkDayIndex, WeekRange } from '../CorpPanelShared';

// The Corporation Panel's Dashboard: the week at a glance - how far through
// it is, shifts worked and quotas met, headcount, shifts per day, and the
// management team with their own week. Tiles open the page behind them.

interface CorpDashboardViewProps
{
    context: CorpPanelContext;
    weeksAgo: number;
    onWeekChange: (weeksAgo: number) => void;
    onOpen: (page: CorpPanelPage) => void;
    links: CorpPanelLinks;
}

// This week's numbers move while you look; a minute matches the shift flush.
const REFRESH_MS = 60000;

export const CorpDashboardView: FC<CorpDashboardViewProps> = props =>
{
    const { weeksAgo = 0, onWeekChange = null, onOpen = null, links = null } = props;
    const [ dashboard, setDashboard ] = useState<CorpPanelDashboard>(null);
    const [ now, setNow ] = useState(Date.now());

    useMessageEvent<RpCorpPanelDashboardEvent>(RpCorpPanelDashboardEvent, event => setDashboard(event.getParser().dashboard));

    useEffect(() =>
    {
        const request = () =>
        {
            setNow(Date.now());
            SendMessageComposer(new RpCorpPanelActionComposer(CorpPanelAction.Dashboard, weeksAgo));
        }

        request();

        if(weeksAgo !== 0) return;

        const interval = setInterval(request, REFRESH_MS);

        return () => clearInterval(interval);
    }, [ weeksAgo ]);

    // A reply for another week (the switch moved before it arrived) is not shown.
    const shown = ((dashboard && (dashboard.weeksAgo === weeksAgo)) ? dashboard : null);
    const isCurrent = (weeksAgo === 0);
    const today = (shown && isCurrent) ? UkDayIndex(shown.weekStartedAt, now) : 7;
    const progress = (!shown ? 0 : (!isCurrent ? 100 : Math.min(100, Math.max(0, Math.round(((now / 1000) - shown.weekStartedAt) / (shown.weekResetAt - shown.weekStartedAt) * 100)))));
    const maxDay = (shown ? Math.max(1, ...shown.daySeconds.map(ShiftsOf)) : 1);

    return (
        <div className="corp-page">
            <div className="corp-page-head">
                <div className="corp-page-title">
                    <h2>Dashboard</h2>
                    <p>
                        { shown ? WeekRange(shown.weekStartedAt, shown.weekResetAt) : '' }
                        { shown && (isCurrent
                            ? ` · resets Sunday 11:59 PM UK, ${ TimeUntil(shown.weekResetAt, now) }`
                            : ' · closed Sunday 11:59 PM UK') }
                    </p>
                </div>
                <CorpWeekSwitch weeksAgo={ weeksAgo } onChange={ onWeekChange } />
            </div>
            { !shown && <div className="mt-empty">Loading the week…</div> }
            { shown &&
                <>
                    <section className="mt-card corp-week-card">
                        <div className="corp-week-card-head">
                            <span className="mt-label">{ isCurrent ? 'This week' : 'That week' }</span>
                            <span className="corp-chip">{ isCurrent ? `Day ${ Math.min(7, today + 1) } of 7` : 'Closed' }</span>
                        </div>
                        <div className="corp-bar is-tall"><div className="corp-bar-fill is-header" style={ { width: `${ progress }%` } } /></div>
                        <div className="corp-week-figures">
                            <div>
                                <b>{ ShiftsOf(shown.shiftSeconds).toLocaleString('en-US') }</b>
                                <span>Shifts worked</span>
                            </div>
                            <div>
                                <b>{ (shown.shiftQuota > 0) ? `${ shown.quotaMet } of ${ shown.employees }` : '–' }</b>
                                <span>{ (shown.shiftQuota > 0) ? `Met the quota of ${ shown.shiftQuota }` : 'No weekly quota' }</span>
                            </div>
                            <div>
                                <b>{ shown.onDuty }</b>
                                <span>On duty now</span>
                            </div>
                        </div>
                    </section>
                    <div className="corp-dash-grid">
                        <div className="corp-dash-col">
                            <div className="corp-stats">
                                <button type="button" className="corp-stat" onClick={ () => onOpen('shifts') }>
                                    <b>{ shown.employees }</b>
                                    <span>Employees</span>
                                    <small>{ shown.onDuty } on duty now</small>
                                </button>
                                <button type="button" className="corp-stat" onClick={ () => onOpen('shifts') }>
                                    <b>{ (shown.employees > 0) ? (ShiftsOf(shown.shiftSeconds) / shown.employees).toFixed(1) : '0' }</b>
                                    <span>Shifts per employee</span>
                                    <small>{ WeekRange(shown.weekStartedAt, shown.weekResetAt) }</small>
                                </button>
                                <button type="button" className="corp-stat" onClick={ () => onOpen('warnings') }>
                                    <b>{ shown.warnings }</b>
                                    <span>Warnings</span>
                                    <small>{ isCurrent ? 'Clear at the weekly reset' : 'That week' }</small>
                                </button>
                                <button type="button" className={ `corp-stat ${ shown.reviews ? 'is-bad' : '' }` } onClick={ () => onOpen('strikes') }>
                                    <b>{ shown.strikes }</b>
                                    <span>Strikes</span>
                                    <small>{ shown.reviews ? `${ shown.reviews } up for a dismissal review` : 'Nobody up for review' }</small>
                                </button>
                            </div>
                            <section className="mt-card">
                                <div className="corp-card-head">
                                    <h3>Shifts by day</h3>
                                    <span className="mt-hint">10-minute shifts, UK days</span>
                                </div>
                                <div className="corp-day-chart">
                                    { shown.daySeconds.map((seconds, index) =>
                                    {
                                        const shifts = ShiftsOf(seconds);
                                        const future = (index > today);

                                        return (
                                            <div key={ index } className="corp-day">
                                                <span className="corp-day-n">{ future ? '–' : shifts }</span>
                                                <div className={ `corp-day-bar ${ (index === today) ? 'is-today' : '' } ${ future ? 'is-future' : '' }` }
                                                    style={ { height: `${ future ? 4 : Math.max(4, Math.round(shifts / maxDay * 72)) }px` } } />
                                                <span className="mt-hint">{ DAY_NAMES[index] }</span>
                                            </div>
                                        );
                                    }) }
                                </div>
                            </section>
                        </div>
                        <section className="mt-card corp-dash-side">
                            <div className="corp-card-head">
                                <h3>Management</h3>
                                <span className="mt-hint">Shifts this week</span>
                            </div>
                            { (shown.leaders.length === 0) && <div className="mt-empty">Nobody holds a management rank.</div> }
                            { shown.leaders.map(leader =>
                                <div key={ leader.userId } className="corp-row">
                                    <CorpHead look={ leader.look } gender={ leader.gender } />
                                    <div className="corp-who">
                                        <CorpName userId={ leader.userId } name={ leader.username } onOpen={ links.openEmployee } />
                                        <span>{ leader.rankName }</span>
                                    </div>
                                    <CorpPresence onDuty={ leader.onDuty } online={ leader.online } />
                                    <b className="corp-row-n">{ ShiftsOf(leader.weekSeconds) }</b>
                                </div>) }
                        </section>
                    </div>
                </> }
        </div>
    );
}
