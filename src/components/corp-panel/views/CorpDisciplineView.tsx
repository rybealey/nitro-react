import { FC, useEffect, useState } from 'react';
import { GetSessionDataManager, SendMessageComposer } from '../../../api';
import { RpRankTitle } from '../../../api/rp-employment/RpEmploymentRegistry';
import { CorpDisciplineAction, CorpDisciplineEntry, CorpDisciplineKind, CorpPanelAction, CorpPanelCapability, CorpPanelContext, CorpPanelDiscipline, RpCorpPanelActionComposer, RpCorpPanelDisciplineComposer, RpCorpPanelDisciplineEvent } from '../../../api/rp-corps/RpCorpPanelMessages';
import { useMessageEvent } from '../../../hooks';
import { CorpPanelLinks } from '../CorpPanelView';
import { CorpHead, CorpName, CorpPips, CorpWeekSwitch, RecordTime, WeekRange } from '../CorpPanelShared';

// The Corporation Panel's Warnings and Strikes pages - one view, two kinds,
// one packet (the week's whole record and everyone's counts). Both roll over
// with the week: three warnings in a week add a strike, three strikes put the
// employee up for a dismissal review. Revoked ones drop off the page and stay
// in the employee's file.

interface CorpDisciplineViewProps
{
    context: CorpPanelContext;
    kind: CorpDisciplineKind;
    weeksAgo: number;
    onWeekChange: (weeksAgo: number) => void;
    links: CorpPanelLinks;
}

export const CorpDisciplineView: FC<CorpDisciplineViewProps> = props =>
{
    const { context = null, kind = 'warning', weeksAgo = 0, onWeekChange = null, links = null } = props;
    const [ discipline, setDiscipline ] = useState<CorpPanelDiscipline>(null);
    const [ search, setSearch ] = useState('');
    const [ now, setNow ] = useState(Date.now());

    // The issue form asks for this week too; a reply for another week than
    // the one on screen is not this page's.
    useMessageEvent<RpCorpPanelDisciplineEvent>(RpCorpPanelDisciplineEvent, event =>
    {
        const next = event.getParser().discipline;

        if(next.weeksAgo === weeksAgo) setDiscipline(next);
    });

    useEffect(() =>
    {
        setNow(Date.now());
        SendMessageComposer(new RpCorpPanelActionComposer(CorpPanelAction.Discipline, weeksAgo));
    }, [ weeksAgo, links.refreshKey ]);

    useEffect(() => setSearch(''), [ kind ]);

    const shown = ((discipline && (discipline.weeksAgo === weeksAgo)) ? discipline : null);
    const isWarnings = (kind === 'warning');
    const isCurrent = (weeksAgo === 0);
    const myId = GetSessionDataManager().userId;
    const canApprove = ((context.capabilities & CorpPanelCapability.Approve) !== 0);
    const perStrike = (shown?.warningsPerStrike ?? 3);
    const forReview = (shown?.strikesForReview ?? 3);
    const counts = new Map((shown?.people ?? []).map(person => [ person.userId, person ]));
    const canIssue = (isCurrent && (shown?.people ?? []).some(person => person.canDiscipline));
    const query = search.trim().toLowerCase();
    const entries = (shown?.entries ?? []).filter(entry => (entry.kind === kind) &&
        (!query || entry.username.toLowerCase().includes(query) || entry.reason.toLowerCase().includes(query)));
    const all = (shown?.entries ?? []).filter(entry => (entry.kind === kind));
    const closeToStrike = (shown?.people ?? []).filter(person => (person.warnings > 0) && ((person.warnings % perStrike) !== 0)).sort((a, b) => (b.warnings - a.warnings));
    const inReview = (shown?.people ?? []).filter(person => (person.strikes >= forReview));

    const revoke = (entry: CorpDisciplineEntry) => SendMessageComposer(new RpCorpPanelDisciplineComposer(CorpDisciplineAction.Revoke, entry.id));
    const mayRevoke = (entry: CorpDisciplineEntry) => (isCurrent && ((entry.issuedBy === myId) || canApprove));

    return (
        <div className="corp-page">
            <div className="corp-page-head">
                <div className="corp-page-title">
                    <h2>{ isWarnings ? 'Warnings' : 'Strikes' }</h2>
                    <p>
                        { shown ? WeekRange(shown.weekStartedAt, shown.weekResetAt) : '' }
                        { isWarnings
                            ? ' · they clear at the weekly reset; each one stays in the employee\'s file'
                            : ' · serious or repeated problems; they clear at the weekly reset too' }
                    </p>
                </div>
                <CorpWeekSwitch weeksAgo={ weeksAgo } onChange={ onWeekChange } />
                { canIssue &&
                    <button type="button" className="mt-chrome corp-primary" onClick={ () => links.openIssue({ kind, userId: 0 }) }>
                        { isWarnings ? 'Issue warning' : 'Issue strike' }
                    </button> }
            </div>
            <section className="mt-card corp-rules">
                <span className="mt-label">How it adds up</span>
                <span className="corp-rule"><CorpPips count={ 1 } of={ 1 } tone="warn" />Warning</span>
                <span className="corp-rule-arrow" aria-hidden="true">→</span>
                <span className="corp-rule"><CorpPips count={ perStrike } of={ perStrike } tone="warn" />{ perStrike } in a week add a strike</span>
                <span className="corp-rule-arrow" aria-hidden="true">→</span>
                <span className="corp-rule"><CorpPips count={ forReview } of={ forReview } tone="bad" />{ forReview } strikes open a dismissal review</span>
            </section>
            <div className="corp-tools">
                <input className="form-control form-control-sm corp-search" type="search" placeholder="Search by employee or reason" aria-label={ isWarnings ? 'Search warnings' : 'Search strikes' } value={ search } onChange={ event => setSearch(event.target.value) } />
                <span className="mt-hint corp-tools-end">{ all.length } { isWarnings ? ((all.length === 1) ? 'warning' : 'warnings') : ((all.length === 1) ? 'strike' : 'strikes') }</span>
            </div>
            { !shown && <div className="mt-empty">Loading…</div> }
            { shown &&
                <div className={ isWarnings ? '' : 'corp-dash-grid' }>
                    <section className="mt-card corp-table-wrap">
                        { (entries.length > 0) &&
                            <table className="corp-table">
                                <thead>
                                    <tr>
                                        <th>Employee</th>
                                        <th>Reason</th>
                                        <th>Issued by</th>
                                        <th>When</th>
                                        <th>{ isCurrent ? 'This week' : 'That week' }</th>
                                        { isCurrent && <th><span className="visually-hidden">Actions</span></th> }
                                    </tr>
                                </thead>
                                <tbody>
                                    { entries.map(entry =>
                                    {
                                        const person = counts.get(entry.userId);
                                        const count = (isWarnings ? (person?.warnings ?? 0) : (person?.strikes ?? 0));

                                        return (
                                            <tr key={ entry.id }>
                                                <td>
                                                    <div className="corp-person">
                                                        <CorpHead look={ entry.look } gender={ entry.gender } />
                                                        <div className="corp-who">
                                                            <CorpName userId={ entry.userId } name={ entry.username } onOpen={ links.openEmployee } />
                                                            <span>{ person ? RpRankTitle(person.rankName, person.tier) : (entry.rankName || 'No longer here') }</span>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="corp-reason">
                                                    <b>{ entry.reason }</b>
                                                    { entry.details && <span>{ entry.details }</span> }
                                                    { entry.automatic && <span className="corp-chip">Automatic</span> }
                                                </td>
                                                <td>{ entry.issuedByName }</td>
                                                <td className="corp-time">{ RecordTime(entry.createdAt, now) }</td>
                                                <td>
                                                    <span className="corp-count">
                                                        <CorpPips count={ count } of={ isWarnings ? perStrike : forReview } tone={ isWarnings ? 'warn' : 'bad' } />
                                                        <span className="mt-hint">{ count } of { isWarnings ? perStrike : forReview }</span>
                                                    </span>
                                                </td>
                                                { isCurrent &&
                                                    <td className="corp-row-actions">
                                                        { mayRevoke(entry) && <button type="button" className="mt-ghost mt-small" onClick={ () => revoke(entry) }>Revoke</button> }
                                                    </td> }
                                            </tr>
                                        );
                                    }) }
                                </tbody>
                            </table> }
                        { (entries.length === 0) &&
                            <div className="mt-empty">
                                { query
                                    ? 'Nothing matches.'
                                    : (isWarnings
                                        ? (isCurrent ? 'No warnings this week.' : 'No warnings that week.')
                                        : (isCurrent ? 'No strikes this week.' : 'No strikes that week.')) }
                            </div> }
                    </section>
                    { !isWarnings &&
                        <div className="corp-dash-col">
                            <section className="mt-card">
                                <div className="corp-card-head"><h3>Close to a strike</h3></div>
                                { (closeToStrike.length === 0) && <div className="mt-empty">Nobody.</div> }
                                { closeToStrike.map(person =>
                                    <div key={ person.userId } className="corp-row">
                                        <CorpHead look={ person.look } gender={ person.gender } size="sm" />
                                        <div className="corp-who">
                                            <CorpName userId={ person.userId } name={ person.username } onOpen={ links.openEmployee } />
                                            <span>{ person.warnings % perStrike } of { perStrike } warnings</span>
                                        </div>
                                        <CorpPips count={ person.warnings % perStrike } of={ perStrike } tone="warn" />
                                    </div>) }
                            </section>
                            <section className="mt-card">
                                <div className="corp-card-head"><h3>Dismissal review</h3></div>
                                { (inReview.length === 0) &&
                                    <div className="corp-card-note">
                                        Nobody { isCurrent ? 'this' : 'that' } week. A { forReview === 3 ? 'third' : `${ forReview }th` } strike in one week puts the employee here for management to decide on. They stay employed until someone does.
                                    </div> }
                                { inReview.map(person =>
                                    <div key={ person.userId } className="corp-row">
                                        <CorpHead look={ person.look } gender={ person.gender } size="sm" />
                                        <div className="corp-who">
                                            <CorpName userId={ person.userId } name={ person.username } onOpen={ links.openEmployee } />
                                            <span>{ person.strikes } strikes { isCurrent ? 'this' : 'that' } week</span>
                                        </div>
                                        <CorpPips count={ person.strikes } of={ forReview } tone="bad" />
                                    </div>) }
                            </section>
                        </div> }
                </div> }
        </div>
    );
}
