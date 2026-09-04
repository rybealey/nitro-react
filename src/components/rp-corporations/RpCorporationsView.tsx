import { ILinkEventTracker, RpCorpEntry, RpCorpsEvent, RpGetCorpDetailComposer, RpGetCorpsComposer, RpUserCorpEvent } from '@nitrots/nitro-renderer';
import { FC, useEffect, useState } from 'react';
import { LuSlidersHorizontal } from 'react-icons/lu';
import { AddEventLinkTracker, CreateLinkEvent, RemoveLinkEventTracker, SendMessageComposer } from '../../api';
import { RpCorpDetailEvent, RpCorpRank } from '../../api/rp-corps/RpCorpDetailMessages';
import { FormatLastOnline, FormatShifts } from '../../api/rp-employment/RpEmploymentRegistry';
import { LayoutAvatarImageView, LayoutBadgeImageView, NitroCardContentView, NitroCardHeaderView, NitroCardView } from '../../common';
import { useMessageEvent } from '../../hooks';
import { RpProfileState } from '../rp-profile/RpProfileState';

// PixelRP Corporations window, opened from the side drawer's Corporations
// button (CreateLinkEvent('rp-corporations/toggle')). Viewable by every
// player: corp rail on the left (badge per corp, NPH17 default), then the
// selected corp's identity header (badge plate, name, description, stat
// chips) above its rank ladder (highest rank first) with pay per 10 minutes
// of shift worked and the employees holding each rank (tier I-V).

const DEFAULT_CORP_BADGE: string = 'NPH17';
const TIER_NUMERALS: string[] = [ 'I', 'II', 'III', 'IV', 'V' ];

interface CorpDetail
{
    id: number;
    name: string;
    badge: string;
    description: string;
    employeeCount: number;
    // quantity the corporation holds; 0 everywhere until farming lands
    stock: number;
    ranks: RpCorpRank[];
    // client timestamp this detail packet arrived - an on-duty employee's
    // live shift counters tick forward from here
    receivedAt: number;
}

export const RpCorporationsView: FC<{}> = props =>
{
    const [ isVisible, setIsVisible ] = useState(false);
    const [ corps, setCorps ] = useState<RpCorpEntry[]>([]);
    const [ selectedId, setSelectedId ] = useState<number>(0);
    const [ detail, setDetail ] = useState<CorpDetail>(null);
    // The rail's slider button collapses the options column. It is a real
    // column beside the roster rather than an overlay, so it starts open and
    // the roster narrows to make room for it.
    const [ panelOpen, setPanelOpen ] = useState(true);
    const [ showWeekly, setShowWeekly ] = useState(true);
    const [ showTotal, setShowTotal ] = useState(true);
    // off by default: the roster's dots already say who is around right
    // now, so this is for the rarer "who has gone quiet" question
    const [ showLastOnline, setShowLastOnline ] = useState(false);
    const [ search, setSearch ] = useState('');

    useMessageEvent<RpCorpsEvent>(RpCorpsEvent, event =>
    {
        const entries = event.getParser().corps;

        setCorps(entries);
        // auto-open the first corp so the window never sits empty
        setSelectedId(prevValue => (entries.some(entry => (entry.id === prevValue)) ? prevValue : (entries[0]?.id ?? 0)));
    });

    useMessageEvent<RpCorpDetailEvent>(RpCorpDetailEvent, event =>
    {
        const parser = event.getParser();

        setDetail({ id: parser.corpId, name: parser.name, badge: parser.badge, description: parser.description, employeeCount: parser.employeeCount, stock: parser.stock, ranks: parser.ranks, receivedAt: Date.now() });
    });

    // Employment changes (hire/fire/promotion) broadcast hotel-wide; while
    // the window is open, refetch the selected corp so the roster re-renders
    // in real-time. Rare staff actions - no debounce needed.
    useMessageEvent<RpUserCorpEvent>(RpUserCorpEvent, event =>
    {
        if(!isVisible || !selectedId) return;

        SendMessageComposer(new RpGetCorpDetailComposer(selectedId));
    });

    useEffect(() =>
    {
        if(!isVisible) return;

        SendMessageComposer(new RpGetCorpsComposer());
    }, [ isVisible ]);

    useEffect(() =>
    {
        if(!isVisible || !selectedId) return;

        SendMessageComposer(new RpGetCorpDetailComposer(selectedId));
    }, [ isVisible, selectedId ]);

    // A query is about the corp you were looking at, so switching corps (or
    // reopening the window) drops it. Without this you would land on a corp
    // whose roster looks empty for no visible reason.
    useEffect(() => setSearch(''), [ selectedId, isVisible ]);

    // Live counters: only worth a redraw every minute while the window is
    // open, and only when there is something on the screen actually ticking.
    const [ tickNow, setTickNow ] = useState(Date.now());

    useEffect(() =>
    {
        if(!isVisible) return;

        // refresh immediately on open - without this, tickNow (set once at
        // mount) can sit well behind receivedAt for up to 60s, driving
        // liveExtra negative on first open
        setTickNow(Date.now());

        const interval = setInterval(() => setTickNow(Date.now()), 60000);

        return () => clearInterval(interval);
    }, [ isVisible ]);

    useEffect(() =>
    {
        const linkTracker: ILinkEventTracker = {
            linkReceived: (url: string) =>
            {
                const parts = url.split('/');

                if(parts.length < 2) return;

                switch(parts[1])
                {
                    case 'show':
                        setIsVisible(true);
                        return;
                    case 'hide':
                        setIsVisible(false);
                        return;
                    case 'toggle':
                        setIsVisible(prevValue => !prevValue);
                        return;
                }
            },
            eventUrlPrefix: 'rp-corporations/'
        };

        AddEventLinkTracker(linkTracker);

        return () => RemoveLinkEventTracker(linkTracker);
    }, []);

    if(!isVisible) return null;

    const shownDetail = ((detail && (detail.id === selectedId)) ? detail : null);
    // highest rank first, like a real org chart
    const ranks = (shownDetail ? [ ...shownDetail.ranks ].sort((a, b) => (b.order - a.order)) : []);
    // computed client-side: the roster already carries every employee's flag
    const onDutyCount = (shownDetail ? shownDetail.ranks.reduce((total, rank) => (total + rank.employees.filter(employee => employee.onDuty).length), 0) : 0);
    // Note the chips above are deliberately NOT filtered: they describe the
    // corporation, so a search narrows the ladder below and not the headcount.
    const query = search.trim().toLowerCase();
    // Ranks that match nothing drop out entirely rather than showing an empty
    // header: leaving all seven in place would mean scrolling past every one
    // of them to reach the single person you searched for.
    const visibleRanks = (!query ? ranks : ranks
        .map(rank => ({ ...rank, employees: rank.employees.filter(employee => employee.username.toLowerCase().includes(query)) }))
        .filter(rank => (rank.employees.length > 0)));

    return (
        <NitroCardView resizable uniqueKey="rp-corporations" className="rp-corporations-window" theme="primary-slim">
            <NitroCardHeaderView headerText="Corporations" onCloseClick={ () => setIsVisible(false) } />
            <NitroCardContentView overflow="hidden" className="text-black">
                <div className="rp-corps-layout">
                    <div className="rp-corps-rail">
                        { /* opens the display-options drawer; sits above the corp
                             badges with a divider so it reads as a control, not
                             another corporation */ }
                        <div className={ `rp-corps-rail-tool ${ panelOpen ? 'is-active' : '' }` }
                            title={ panelOpen ? 'Hide display options' : 'Show display options' }
                            onClick={ () => setPanelOpen(value => !value) }>
                            <LuSlidersHorizontal />
                        </div>
                        { corps.map(corp => (
                            <div key={ corp.id } title={ corp.name }
                                className={ `rp-corps-rail-item ${ (corp.id === selectedId) ? 'is-active' : '' }` }
                                onClick={ () => setSelectedId(corp.id) }>
                                <LayoutBadgeImageView badgeCode={ corp.badge || DEFAULT_CORP_BADGE } />
                            </div>
                        )) }
                    </div>
                    <div className="rp-corps-main">
                        { shownDetail &&
                            // keyed by corp so switching remounts the block and
                            // replays the fade-in
                            <div key={ shownDetail.id } className="rp-corps-detail">
                                <div className="rp-corps-head">
                                    <div className="rp-corps-badge-plate">
                                        <LayoutBadgeImageView badgeCode={ shownDetail.badge || DEFAULT_CORP_BADGE } />
                                    </div>
                                    <div className="rp-corps-head-info">
                                        <div className="rp-corps-title">{ shownDetail.name }</div>
                                        { shownDetail.description &&
                                            <div className="rp-corps-sub">{ shownDetail.description }</div> }
                                    </div>
                                    <div className="rp-corps-chips">
                                        <div className="rp-corps-chip">
                                            <span className="rp-corps-chip-value">{ shownDetail.employeeCount }</span>
                                            <span className="rp-corps-chip-label">Employees</span>
                                        </div>
                                        <div className="rp-corps-chip">
                                            <span className="rp-corps-chip-value">{ onDutyCount }</span>
                                            <span className="rp-corps-chip-label">On duty</span>
                                        </div>
                                        <div className="rp-corps-chip">
                                            <span className="rp-corps-chip-value">{ shownDetail.stock }</span>
                                            <span className="rp-corps-chip-label">Stock</span>
                                        </div>
                                    </div>
                                </div>
                                <div className="rp-corps-legend">
                                    <span className="rp-corps-legend-item"><i className="rp-corps-dot is-offline" />Offline</span>
                                    <span className="rp-corps-legend-item"><i className="rp-corps-dot is-online" />Online</span>
                                    <span className="rp-corps-legend-item"><i className="rp-corps-dot is-onduty" />On duty</span>
                                </div>
                                <div className={ `rp-corps-body ${ panelOpen ? 'is-panel-open' : '' }` }>
                                    { /* A real column, not an overlay: it sits beside
                                         the roster and the employee grid drops from
                                         three across to two to make room. */ }
                                    <div className={ `rp-corps-panel ${ panelOpen ? 'is-open' : '' }` }>
                                        <div className="rp-corps-panel-title">Find</div>
                                        <div className="rp-corps-search">
                                            { /* No autoFocus: this window opens over a live room and
                                                 stealing the keyboard would swallow chat. */ }
                                            <input type="text" spellCheck={ false } placeholder="Username..."
                                                value={ search } onChange={ event => setSearch(event.target.value) }
                                                onKeyDown={ event => (event.key === 'Escape') && setSearch('') } />
                                            { !!search &&
                                                <span className="rp-corps-search-clear" title="Clear" onClick={ () => setSearch('') }>&times;</span> }
                                        </div>
                                        <div className="rp-corps-panel-title is-spaced">Show on cards</div>
                                        <label className="rp-corps-check">
                                            <input type="checkbox" checked={ showWeekly } onChange={ event => setShowWeekly(event.target.checked) } />
                                            <span>Weekly shifts</span>
                                        </label>
                                        <label className="rp-corps-check">
                                            <input type="checkbox" checked={ showTotal } onChange={ event => setShowTotal(event.target.checked) } />
                                            <span>Total shifts</span>
                                        </label>
                                        <label className="rp-corps-check">
                                            <input type="checkbox" checked={ showLastOnline } onChange={ event => setShowLastOnline(event.target.checked) } />
                                            <span>Last online</span>
                                        </label>
                                    </div>
                                    <div className="rp-corps-ranks">
                                        { !!query && !visibleRanks.length &&
                                            <div className="rp-corps-no-matches">Nobody in { shownDetail.name } matches &ldquo;{ search.trim() }&rdquo;.</div> }
                                        { visibleRanks.map(rank => (
                                            <div key={ rank.id } className="rp-corps-rank">
                                                <div className="rp-corps-rank-row">
                                                    <span className="rp-corps-rank-name">{ rank.name }</span>
                                                    <span className="rp-corps-rank-pay">{ rank.pay }c</span>
                                                </div>
                                                { (rank.employees.length === 0) &&
                                                    <div className="rp-corps-rank-none">No employees</div> }
                                                { (rank.employees.length > 0) &&
                                                    <div className="rp-corps-employees">
                                                        { rank.employees.map(employee =>
                                                        {
                                                            const tierLabel = ((rank.tiers > 0) ? TIER_NUMERALS[Math.min(Math.max(employee.tier, 1), rank.tiers) - 1] : null);
                                                            const rankLabel = (tierLabel ? `${ rank.name } ${ tierLabel }` : rank.name);
                                                            const statusWord = (employee.onDuty ? 'On duty' : (employee.online ? 'Online' : 'Offline'));
                                                            // seconds accrued on the current shift since the detail
                                                            // packet arrived - 0 unless this employee is on duty
                                                            const liveExtra = (employee.onDuty ? Math.max(0, Math.floor((tickNow - shownDetail.receivedAt) / 1000)) : 0);
                                                            // users.last_online is only written on logout, so it is
                                                            // stale for anyone connected - presence wins over it.
                                                            const lastSeenLabel = (employee.online ? 'Now' : FormatLastOnline(employee.lastOnline, tickNow));

                                                            return (
                                                                <div key={ employee.username } className="rp-corps-employee" title={ `${ rankLabel } - ${ statusWord }` }
                                                                    onClick={ () =>
                                                                    {
                                                                        RpProfileState.name = employee.username;
                                                                        RpProfileState.figure = employee.figure;
                                                                        RpProfileState.motto = '';
                                                                        RpProfileState.online = employee.online;
                                                                        // The roster carries no user id, but we are
                                                                        // looking at this player's employment right
                                                                        // now - hand it over rather than look it up.
                                                                        RpProfileState.userId = 0;
                                                                        // the roster carries no rank, so no verified mark
                                                                        RpProfileState.staff = false;
                                                                        RpProfileState.employment = {
                                                                            corpId: shownDetail.id,
                                                                            badge: (corps.find(entry => (entry.id === shownDetail.id))?.badge ?? ''),
                                                                            corpName: shownDetail.name,
                                                                            rankName: rank.name,
                                                                            tier: ((rank.tiers > 0) ? employee.tier : 0),
                                                                            shiftSeconds: employee.shiftSeconds,
                                                                            shiftSecondsWeek: employee.shiftSecondsWeek,
                                                                            onDuty: employee.onDuty,
                                                                            // keep the same baseline the card was
                                                                            // ticking from, not a fresh now() that
                                                                            // would drop the card's liveExtra
                                                                            receivedAt: shownDetail.receivedAt
                                                                        };
                                                                        CreateLinkEvent('rp-profile/show');
                                                                    } }>
                                                                    { /* second presence signal beside the tint, for
                                                                         colorblind legibility */ }
                                                                    <span className={ `rp-corps-dot rp-corps-employee-status ${ employee.onDuty ? 'is-onduty' : (employee.online ? 'is-online' : 'is-offline') }` } />
                                                                    { /* portrait tint doubles as the presence signal:
                                                                         gray offline, green online, blue on duty */ }
                                                                    <div className={ `rp-corps-employee-portrait${ employee.onDuty ? ' is-onduty' : (employee.online ? ' is-online' : '') }` }>
                                                                        <LayoutAvatarImageView figure={ employee.figure } direction={ 2 } />
                                                                    </div>
                                                                    <div className="rp-corps-employee-info">
                                                                        <div className="rp-corps-employee-name-row">
                                                                            <span className="rp-corps-employee-name">{ employee.username }</span>
                                                                            { tierLabel &&
                                                                                <span className="rp-corps-employee-tier">{ tierLabel }</span> }
                                                                        </div>
                                                                        { (showWeekly || showTotal) &&
                                                                            <div className="rp-corps-employee-shifts">
                                                                                { [ showWeekly && `Weekly: ${ FormatShifts(employee.shiftSecondsWeek + liveExtra) }`, showTotal && `Total: ${ FormatShifts(employee.shiftSeconds + liveExtra) }` ].filter(Boolean).join(' · ') }
                                                                            </div> }
                                                                        { showLastOnline &&
                                                                            <div className="rp-corps-employee-seen">Last online: { lastSeenLabel }</div> }
                                                                    </div>
                                                                </div>
                                                            );
                                                        }) }
                                                    </div> }
                                            </div>
                                        )) }
                                    </div>
                                </div>
                            </div> }
                        { !shownDetail && (corps.length > 0) &&
                            <div className="rp-corps-skeleton">
                                <div className="rp-corps-skeleton-bar" />
                                <div className="rp-corps-skeleton-cards">
                                    <div className="rp-corps-skeleton-card" />
                                    <div className="rp-corps-skeleton-card" />
                                    <div className="rp-corps-skeleton-card" />
                                </div>
                            </div> }
                        { !corps.length &&
                            <div className="rp-corps-none">
                                <LayoutBadgeImageView badgeCode={ DEFAULT_CORP_BADGE } />
                                <div className="rp-corps-none-text">No corporations yet.</div>
                            </div> }
                    </div>
                </div>
            </NitroCardContentView>
        </NitroCardView>
    );
}
