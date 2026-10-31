import { FC, useEffect, useState } from 'react';
import { SendMessageComposer } from '../../../api';
import { RpRankTitle } from '../../../api/rp-employment/RpEmploymentRegistry';
import { CorpPanelAction, CorpPanelEmployee, RpCorpPanelActionComposer, RpCorpPanelEmployeeEvent } from '../../../api/rp-corps/RpCorpPanelMessages';
import { useMessageEvent } from '../../../hooks';
import { CorpPanelLinks } from '../CorpPanelView';
import { LongDate, RecordTime, ShiftsOf } from '../CorpPanelShared';
import { LayoutAvatarImageView } from '../../../common';

// The Corporation Panel's employee file: a drawer over the page, opened from
// any name. Who they are, this week's numbers, their shifts over the last six
// weeks, and their record - warnings and strikes, revoked ones struck through
// - with the buttons to warn or strike them when they're ranked below you.

interface CorpEmployeeFileViewProps
{
    userId: number;
    links: CorpPanelLinks;
    onClose: () => void;
}

const SECONDS_PER_WEEK = 7 * 86400;

export const CorpEmployeeFileView: FC<CorpEmployeeFileViewProps> = props =>
{
    const { userId = 0, links = null, onClose = null } = props;
    const [ employee, setEmployee ] = useState<CorpPanelEmployee>(null);
    const [ missing, setMissing ] = useState(false);
    const [ now, setNow ] = useState(Date.now());

    useMessageEvent<RpCorpPanelEmployeeEvent>(RpCorpPanelEmployeeEvent, event =>
    {
        const next = event.getParser().employee;

        if(next.userId !== userId) return;

        setEmployee(next);
        setMissing(false);
    });

    useEffect(() =>
    {
        setNow(Date.now());
        setMissing(false);
        SendMessageComposer(new RpCorpPanelActionComposer(CorpPanelAction.Employee, userId));

        // The server says nothing about someone who no longer works here.
        const timeout = setTimeout(() => setMissing(true), 4000);

        return () => clearTimeout(timeout);
    }, [ userId, links.refreshKey ]);

    useEffect(() => setEmployee(prev => ((prev?.userId === userId) ? prev : null)), [ userId ]);

    const shown = ((employee?.userId === userId) ? employee : null);
    const weekShifts = (shown ? ShiftsOf(shown.weekSeconds[shown.weekSeconds.length - 1] ?? 0) : 0);
    const maxWeek = (shown ? Math.max(1, shown.shiftQuota, ...shown.weekSeconds.map(ShiftsOf)) : 1);
    const presence = (!shown ? '' : (shown.onDuty ? 'On duty now' : (shown.online ? 'Online now' : (shown.lastOnline ? `Last online ${ RecordTime(shown.lastOnline, now) }` : 'Offline'))));

    return (
        <div className="corp-scrim is-drawer" onMouseDown={ event => ((event.target === event.currentTarget) && onClose()) }>
            <aside className="corp-drawer" role="dialog" aria-modal="true" aria-label={ shown ? `Employee file: ${ shown.username }` : 'Employee file' }>
                { !shown &&
                    <div className="corp-drawer-head">
                        <div className="corp-who"><b>{ missing ? 'Not found' : 'Loading…' }</b>{ missing && <span>They don&apos;t work here any more.</span> }</div>
                        <button type="button" className="corp-icon-button" aria-label="Close file" onClick={ onClose }>×</button>
                    </div> }
                { shown &&
                    <>
                        <div className="corp-drawer-head">
                            <div className="corp-file-figure" aria-hidden="true">
                                <LayoutAvatarImageView figure={ shown.look } gender={ shown.gender } direction={ 2 } />
                            </div>
                            <div className="corp-who">
                                <b className="corp-file-name">{ shown.username }</b>
                                <span>{ RpRankTitle(shown.rankName, shown.tier) }{ shown.hiredAt ? ` · hired ${ LongDate(shown.hiredAt) }` : '' }</span>
                                <span className="corp-presence-line">
                                    <span className={ `corp-dot ${ shown.onDuty ? 'is-duty' : (shown.online ? 'is-online' : '') }` } aria-hidden="true" />
                                    { presence }
                                </span>
                            </div>
                            <button type="button" className="corp-icon-button" aria-label="Close file" onClick={ onClose }>×</button>
                        </div>
                        { shown.canDiscipline &&
                            <div className="corp-drawer-actions">
                                <button type="button" className="mt-chrome mt-small" onClick={ () => links.openIssue({ kind: 'warning', userId: shown.userId }) }>Warn</button>
                                <button type="button" className="mt-ghost mt-small" onClick={ () => links.openIssue({ kind: 'strike', userId: shown.userId }) }>Strike</button>
                            </div> }
                        <div className="corp-drawer-body">
                            { (shown.strikes >= 2) &&
                                <div className="corp-effect is-bad">{ (shown.strikes >= 3) ? 'Up for a dismissal review this week.' : 'One strike from a dismissal review.' }</div> }
                            <section className="mt-card corp-file-week">
                                <div>
                                    <b>{ weekShifts }{ (shown.shiftQuota > 0) && <small>/{ shown.shiftQuota }</small> }</b>
                                    <span>Shifts this week</span>
                                </div>
                                <div>
                                    <b className={ shown.warnings ? 'is-warn' : '' }>{ shown.warnings }</b>
                                    <span>Warnings</span>
                                </div>
                                <div>
                                    <b className={ shown.strikes ? 'is-bad' : '' }>{ shown.strikes }</b>
                                    <span>Strikes</span>
                                </div>
                            </section>
                            <section className="mt-card corp-file-weeks">
                                <div className="corp-card-head">
                                    <h3>Shifts, last { shown.weekSeconds.length } weeks</h3>
                                    { (shown.shiftQuota > 0) && <span className="mt-hint">Quota { shown.shiftQuota }</span> }
                                </div>
                                <div className="corp-file-chart">
                                    { shown.weekSeconds.map((seconds, index) =>
                                    {
                                        const shifts = ShiftsOf(seconds);
                                        const current = (index === (shown.weekSeconds.length - 1));
                                        const tone = (current ? 'is-today' : (((shown.shiftQuota <= 0) || (shifts >= shown.shiftQuota)) ? 'is-met' : 'is-close'));

                                        return (
                                            <div key={ index } className="corp-day">
                                                <span className="corp-day-n">{ shifts }</span>
                                                <div className={ `corp-day-bar ${ tone }` } style={ { height: `${ Math.max(3, Math.round(shifts / maxWeek * 48)) }px` } } />
                                                <span className="mt-hint">{ current ? 'Now' : LongDate(shown.firstWeekStartedAt + 60 + (index * SECONDS_PER_WEEK)).replace(/, \d{4}$/, '') }</span>
                                            </div>
                                        );
                                    }) }
                                </div>
                            </section>
                            <section className="mt-card">
                                <div className="corp-card-head"><h3>Record</h3><span className="mt-hint">Newest first</span></div>
                                { shown.record.map(entry =>
                                    <div key={ entry.id } className={ `corp-history ${ entry.revokedAt ? 'is-revoked' : '' }` }>
                                        <span className={ `corp-pip is-${ (entry.kind === 'strike') ? 'bad' : 'warn' }` } aria-hidden="true" />
                                        <div className="corp-history-text">
                                            <b>{ (entry.kind === 'strike') ? 'Strike' : 'Warning' }: { entry.reason }</b>
                                            <span>
                                                { entry.details ? `${ entry.details } · ` : '' }
                                                { entry.automatic ? 'added automatically' : `by ${ entry.issuedByName }` }
                                                { entry.revokedAt ? ` · revoked by ${ entry.revokedByName }` : '' }
                                            </span>
                                        </div>
                                        <span className="corp-time">{ RecordTime(entry.createdAt, now) }</span>
                                    </div>) }
                                { shown.hiredAt > 0 &&
                                    <div className="corp-history">
                                        <span className="corp-pip is-neutral" aria-hidden="true" />
                                        <div className="corp-history-text">
                                            <b>Hired</b>
                                            <span>Joined the corporation</span>
                                        </div>
                                        <span className="corp-time">{ LongDate(shown.hiredAt) }</span>
                                    </div> }
                                { (shown.record.length === 0) && !shown.hiredAt && <div className="mt-empty">A clean record.</div> }
                            </section>
                        </div>
                    </> }
            </aside>
        </div>
    );
}
