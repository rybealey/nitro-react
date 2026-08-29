import { ILinkEventTracker, RpCorpDetailEvent, RpCorpEntry, RpCorpRank, RpCorpsEvent, RpGetCorpDetailComposer, RpGetCorpsComposer } from '@nitrots/nitro-renderer';
import { FC, useEffect, useState } from 'react';
import { AddEventLinkTracker, RemoveLinkEventTracker, SendMessageComposer } from '../../api';
import { LayoutAvatarImageView, LayoutBadgeImageView, NitroCardContentView, NitroCardHeaderView, NitroCardView } from '../../common';
import { useMessageEvent } from '../../hooks';

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
    ranks: RpCorpRank[];
}

export const RpCorporationsView: FC<{}> = props =>
{
    const [ isVisible, setIsVisible ] = useState(false);
    const [ corps, setCorps ] = useState<RpCorpEntry[]>([]);
    const [ selectedId, setSelectedId ] = useState<number>(0);
    const [ detail, setDetail ] = useState<CorpDetail>(null);

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

        setDetail({ id: parser.corpId, name: parser.name, badge: parser.badge, description: parser.description, employeeCount: parser.employeeCount, ranks: parser.ranks });
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
            <NitroCardContentView className="text-black">
                <div className="rp-corps-layout">
                    <div className="rp-corps-rail">
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
                    <div className="rp-corps-detail">
                        { shownDetail &&
                            <>
                                <div className="rp-corps-head">
                                    <div className="rp-corps-title">{ shownDetail.name }</div>
                                    <div className="rp-corps-sub">
                                        { shownDetail.employeeCount } { (shownDetail.employeeCount === 1) ? 'employee' : 'employees' }
                                        { shownDetail.description ? ` - ${ shownDetail.description }` : '' }
                                    </div>
                                </div>
                                <div className="rp-corps-ranks">
                                    { ranks.map(rank => (
                                        <div key={ rank.id } className="rp-corps-rank">
                                            <div className="rp-corps-rank-row">
                                                <span className="rp-corps-rank-name">{ rank.name }</span>
                                                <span className="rp-corps-rank-pay">{ rank.pay }c <small>/ 10 min</small></span>
                                            </div>
                                            { (rank.employees.length > 0) &&
                                                <div className="rp-corps-employees">
                                                    { rank.employees.map(employee => (
                                                        <div key={ employee.username } className="rp-corps-employee" title={ ((rank.tiers > 0) ? `${ rank.name } ${ TIER_NUMERALS[Math.min(Math.max(employee.tier, 1), rank.tiers) - 1] }` : rank.name) }>
                                                            <div className="rp-corps-employee-avatar">
                                                                <LayoutAvatarImageView figure={ employee.figure } headOnly={ true } direction={ 2 } />
                                                            </div>
                                                            <span className="rp-corps-employee-name">{ employee.username }</span>
                                                            { (rank.tiers > 0) &&
                                                                <span className="rp-corps-employee-tier">{ TIER_NUMERALS[Math.min(Math.max(employee.tier, 1), rank.tiers) - 1] }</span> }
                                                            <span className={ `rp-corps-employee-presence${ employee.online ? ' is-online' : '' }${ employee.onDuty ? ' is-onduty' : '' }` } />
                                                        </div>
                                                    )) }
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
