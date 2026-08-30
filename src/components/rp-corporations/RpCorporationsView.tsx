import { ILinkEventTracker, RpCorpDetailEvent, RpCorpEntry, RpCorpRank, RpCorpsEvent, RpGetCorpDetailComposer, RpGetCorpsComposer } from '@nitrots/nitro-renderer';
import { FC, useEffect, useState } from 'react';
import { LuSlidersHorizontal } from 'react-icons/lu';
import { AddEventLinkTracker, CreateLinkEvent, RemoveLinkEventTracker, SendMessageComposer } from '../../api';
import { LayoutAvatarImageView, LayoutBadgeImageView, NitroCardContentView, NitroCardHeaderView, NitroCardView } from '../../common';
import { useMessageEvent } from '../../hooks';
import { RpProfileState } from '../rp-profile/RpProfileState';

// PixelRP Corporations window, opened from the side drawer's Corporations
// button (CreateLinkEvent('rp-corporations/toggle')). Viewable by every
// player: a compact take on the classic business roster - corp rail on the
// left (badge per corp, NPH17 default), the selected corp's rank ladder on
// the right (highest rank first) with pay per 10 minutes of shift worked and
// the employees holding each rank (tier I-V).

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
}

export const RpCorporationsView: FC<{}> = props =>
{
    const [ isVisible, setIsVisible ] = useState(false);
    const [ corps, setCorps ] = useState<RpCorpEntry[]>([]);
    const [ selectedId, setSelectedId ] = useState<number>(0);
    const [ detail, setDetail ] = useState<CorpDetail>(null);
    // The rail's slider button opens a panel of corporation figures and
    // display toggles. While it is open the roster drops to a single column
    // so the cards stay readable in what is left of the width.
    const [ panelOpen, setPanelOpen ] = useState(false);
    const [ showWeekly, setShowWeekly ] = useState(true);
    const [ showTotal, setShowTotal ] = useState(true);

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

        setDetail({ id: parser.corpId, name: parser.name, badge: parser.badge, description: parser.description, employeeCount: parser.employeeCount, stock: parser.stock, ranks: parser.ranks });
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

    return (
        <NitroCardView uniqueKey="rp-corporations" className="rp-corporations-window" theme="primary-slim">
            <NitroCardHeaderView headerText="Corporations" onCloseClick={ () => setIsVisible(false) } />
            <NitroCardContentView overflow="hidden" className="text-black">
                <div className="rp-corps-layout">
                    <div className="rp-corps-rail">
                        { /* opens the figures/display panel; sits above the corp
                             badges with a divider so it reads as a control, not
                             another corporation */ }
                        <div className={ `rp-corps-rail-tool ${ panelOpen ? 'is-active' : '' }` }
                            title="Corporation details"
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
                        { !corps.length &&
                            <div className="rp-corps-empty">No corporations yet.</div> }
                    </div>
                    <div className={ `rp-corps-panel ${ panelOpen ? 'is-open' : '' }` }>
                        <div className="rp-corps-panel-inner">
                            <div className="rp-corps-panel-title">Details</div>
                            <div className="rp-corps-figures">
                                <div className="rp-corps-figure">
                                    <span className="rp-corps-figure-label">Employees</span>
                                    <span className="rp-corps-figure-value">{ shownDetail ? shownDetail.employeeCount : 0 }</span>
                                </div>
                                <div className="rp-corps-figure">
                                    <span className="rp-corps-figure-label">Stock</span>
                                    <span className="rp-corps-figure-value">{ shownDetail ? shownDetail.stock : 0 }</span>
                                </div>
                            </div>
                            <div className="rp-corps-panel-title">Show on cards</div>
                            <label className="rp-corps-check">
                                <input type="checkbox" checked={ showWeekly } onChange={ event => setShowWeekly(event.target.checked) } />
                                <span>Weekly shifts</span>
                            </label>
                            <label className="rp-corps-check">
                                <input type="checkbox" checked={ showTotal } onChange={ event => setShowTotal(event.target.checked) } />
                                <span>Total shifts</span>
                            </label>
                        </div>
                    </div>
                    <div className="rp-corps-detail">
                        { shownDetail &&
                            <>
                                <div className="rp-corps-head">
                                    <div className="rp-corps-title-row">
                                        <div className="rp-corps-title">{ shownDetail.name }</div>
                                        <div className="rp-corps-count">{ shownDetail.employeeCount } { (shownDetail.employeeCount === 1) ? 'employee' : 'employees' }</div>
                                    </div>
                                    { shownDetail.description &&
                                        <div className="rp-corps-sub">{ shownDetail.description }</div> }
                                </div>
                                <div className="rp-corps-ranks">
                                    { ranks.map(rank => (
                                        <div key={ rank.id } className="rp-corps-rank">
                                            <div className="rp-corps-rank-row">
                                                <span className="rp-corps-rank-name">{ rank.name }</span>
                                                <span className="rp-corps-rank-pay">{ rank.pay }c <small>/ 10 min</small></span>
                                            </div>
                                            { (rank.employees.length > 0) &&
                                                <div className={ `rp-corps-employees ${ panelOpen ? 'is-single' : '' }` }>
                                                    { rank.employees.map(employee =>
                                                    {
                                                        const tierLabel = ((rank.tiers > 0) ? TIER_NUMERALS[Math.min(Math.max(employee.tier, 1), rank.tiers) - 1] : null);

                                                        return (
                                                            <div key={ employee.username } className="rp-corps-employee" title={ (tierLabel ? `${ rank.name } ${ tierLabel }` : rank.name) }
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
                                                                        tier: ((rank.tiers > 0) ? employee.tier : 0)
                                                                    };
                                                                    CreateLinkEvent('rp-profile/show');
                                                                } }>
                                                                { /* portrait tint IS the presence signal: gray offline, green online, blue on duty */ }
                                                                <div className={ `rp-corps-employee-portrait${ employee.onDuty ? ' is-onduty' : (employee.online ? ' is-online' : '') }` }>
                                                                    <LayoutAvatarImageView figure={ employee.figure } direction={ 2 } />
                                                                </div>
                                                                <div className="rp-corps-employee-info">
                                                                    <div className="rp-corps-employee-name-row">
                                                                        <span className="rp-corps-employee-name">{ employee.username }</span>
                                                                        { tierLabel &&
                                                                            <span className="rp-corps-employee-tier">{ tierLabel }</span> }
                                                                    </div>
                                                                    { /* hardcoded zeros until the server sends shift stats */ }
                                                                    { (showWeekly || showTotal) &&
                                                                        <div className="rp-corps-employee-shifts">
                                                                            { [ showWeekly && 'Wk 0', showTotal && 'Total 0' ].filter(Boolean).join(' / ') }
                                                                        </div> }
                                                                </div>
                                                            </div>
                                                        );
                                                    }) }
                                                </div> }
                                        </div>
                                    )) }
                                </div>
                            </> }
                        { !shownDetail && (corps.length > 0) &&
                            <div className="rp-corps-empty">Loading...</div> }
                    </div>
                </div>
            </NitroCardContentView>
        </NitroCardView>
    );
}
