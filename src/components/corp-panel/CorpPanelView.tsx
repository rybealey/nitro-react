import { ILinkEventTracker } from '@nitrots/nitro-renderer';
import { FC, ReactNode, useCallback, useEffect, useState } from 'react';
import { LuCalendarDays, LuLayoutGrid, LuAlertTriangle, LuZap } from 'react-icons/lu';
import { AddEventLinkTracker, RemoveLinkEventTracker, SendMessageComposer } from '../../api';
import { DEFAULT_CORP_BADGE } from '../../api/rp-employment/RpEmploymentRegistry';
import { CorpDisciplineKind, CorpPanelAction, CorpPanelContext, CorpPanelResult, RpCorpPanelActionComposer, RpCorpPanelEvent, RpCorpPanelResultEvent } from '../../api/rp-corps/RpCorpPanelMessages';
import { DraggableWindowPosition, LayoutBadgeImageView, NitroCardContentView, NitroCardHeaderView, NitroCardView } from '../../common';
import { useMessageEvent } from '../../hooks';
import { CorpDashboardView } from './views/CorpDashboardView';
import { CorpDisciplineView } from './views/CorpDisciplineView';
import { CorpEmployeeFileView } from './views/CorpEmployeeFileView';
import { CorpIssueView } from './views/CorpIssueView';
import { CorpShiftsView } from './views/CorpShiftsView';

// PixelRP Corporation Panel - a corporation's own management window, for its
// management ranks (rp_corporation_ranks.panel_access; emulator
// HabboHotel/Corporations/CorpPanel; design: the "Corporation Panel" canvas).
//
// Opened by :cp, which checks the rank and sends 'corp-panel/show'. The
// window then asks for who is looking (RpCorpPanelEvent) and each page asks
// for its own data. Every packet is checked again on the server, which sends
// 'corp-panel/hide' to anyone who has lost access with the window open.
//
// Two layers sit over the pages: an employee's file (a drawer, opened from
// any name) and the issue form for a warning or strike (a dialog).

export type CorpPanelPage = 'dashboard' | 'shifts' | 'warnings' | 'strikes';

export interface CorpIssueRequest
{
    kind: CorpDisciplineKind;
    // 0 = pick someone in the form
    userId: number;
}

// What every page gets to open the layers and hear about changes.
export interface CorpPanelLinks
{
    // bumped after any change the server accepted, so pages fetch again
    refreshKey: number;
    openEmployee: (userId: number) => void;
    openIssue: (request: CorpIssueRequest) => void;
}

interface NavItem
{
    page: CorpPanelPage;
    label: string;
    icon: ReactNode;
}

const SECTIONS: { title: string, items: NavItem[] }[] = [
    {
        title: 'Overview',
        items: [
            { page: 'dashboard', label: 'Dashboard', icon: <LuLayoutGrid /> },
            { page: 'shifts', label: 'Weekly shifts', icon: <LuCalendarDays /> }
        ]
    },
    {
        title: 'HR and records',
        items: [
            { page: 'warnings', label: 'Warnings', icon: <LuAlertTriangle /> },
            { page: 'strikes', label: 'Strikes', icon: <LuZap /> }
        ]
    }
];

// How long a result line stays at the top of the page.
const NOTICE_MS = 6000;

export const CorpPanelView: FC<{}> = props =>
{
    const [ isVisible, setIsVisible ] = useState(false);
    const [ context, setContext ] = useState<CorpPanelContext>(null);
    const [ page, setPage ] = useState<CorpPanelPage>('dashboard');
    // The week switch is the panel's, not a page's: moving from the
    // Dashboard to Weekly shifts keeps the week you were looking at.
    const [ weeksAgo, setWeeksAgo ] = useState(0);
    const [ fileUserId, setFileUserId ] = useState(0);
    const [ issue, setIssue ] = useState<CorpIssueRequest>(null);
    const [ notice, setNotice ] = useState<CorpPanelResult>(null);
    const [ refreshKey, setRefreshKey ] = useState(0);

    useMessageEvent<RpCorpPanelEvent>(RpCorpPanelEvent, event => setContext(event.getParser().context));

    // Every change made in the window answers here. A success refreshes
    // whatever is showing; the issue form shows its own answer, the rest
    // (revokes) show at the top of the page.
    useMessageEvent<RpCorpPanelResultEvent>(RpCorpPanelResultEvent, event =>
    {
        const result = event.getParser().result;

        if(result.ok) setRefreshKey(value => (value + 1));

        setNotice(result);
    });

    useEffect(() =>
    {
        if(!notice) return;

        const timeout = setTimeout(() => setNotice(null), NOTICE_MS);

        return () => clearTimeout(timeout);
    }, [ notice ]);

    useEffect(() =>
    {
        const linkTracker: ILinkEventTracker = {
            linkReceived: (url: string) =>
            {
                const parts = url.split('/');

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
            eventUrlPrefix: 'corp-panel/'
        };

        AddEventLinkTracker(linkTracker);

        return () => RemoveLinkEventTracker(linkTracker);
    }, []);

    useEffect(() =>
    {
        if(isVisible)
        {
            SendMessageComposer(new RpCorpPanelActionComposer(CorpPanelAction.Open));

            return;
        }

        // Closed: the next :cp starts on this week's Dashboard, and a
        // different character never sees the last one's corporation.
        setContext(null);
        setPage('dashboard');
        setWeeksAgo(0);
        setFileUserId(0);
        setIssue(null);
        setNotice(null);
    }, [ isVisible ]);

    const openEmployee = useCallback((userId: number) => setFileUserId(userId), []);
    const openIssue = useCallback((request: CorpIssueRequest) => setIssue(request), []);

    const openPage = (next: CorpPanelPage) =>
    {
        setPage(next);
        setFileUserId(0);
    }

    if(!isVisible) return null;

    const links: CorpPanelLinks = { refreshKey, openEmployee, openIssue };
    // the issue form answers itself; everything else answers up here
    const pageNotice = (!issue ? notice : null);

    return (
        <NitroCardView uniqueKey="corp-panel" className="nitro-corp-panel" theme="primary-slim" windowPosition={ DraggableWindowPosition.CENTER } resizable>
            <NitroCardHeaderView headerText={ context?.corpName || 'Corporation Panel' } onCloseClick={ () => setIsVisible(false) } />
            <NitroCardContentView className="mt-page" overflow="hidden">
                <div className="corp-layout">
                    <aside className="corp-side">
                        <div className="corp-identity">
                            <div className="corp-badge">
                                <LayoutBadgeImageView badgeCode={ context?.badge || DEFAULT_CORP_BADGE } />
                            </div>
                            <div className="corp-identity-text">
                                <b>{ context?.corpName ?? '' }</b>
                                <span>{ context?.rankName ?? '' }</span>
                            </div>
                        </div>
                        <nav className="corp-nav" aria-label="Corporation Panel">
                            { SECTIONS.map(section =>
                                <div key={ section.title } className="corp-nav-section">
                                    <div className="corp-nav-title">{ section.title }</div>
                                    { section.items.map(item =>
                                        <button key={ item.page } type="button" className={ `corp-nav-item ${ (item.page === page) ? 'is-active' : '' }` }
                                            aria-current={ (item.page === page) ? 'page' : undefined } onClick={ () => openPage(item.page) }>
                                            { item.icon }
                                            <span>{ item.label }</span>
                                        </button>) }
                                </div>) }
                        </nav>
                    </aside>
                    <main className="corp-main">
                        { pageNotice &&
                            <div className={ `corp-notice ${ pageNotice.ok ? 'is-ok' : 'is-bad' }` } role="status">{ pageNotice.message }</div> }
                        { !context && <div className="mt-empty">Loading your corporation…</div> }
                        { context && (page === 'dashboard') &&
                            <CorpDashboardView context={ context } weeksAgo={ weeksAgo } onWeekChange={ setWeeksAgo } onOpen={ openPage } links={ links } /> }
                        { context && (page === 'shifts') &&
                            <CorpShiftsView context={ context } weeksAgo={ weeksAgo } onWeekChange={ setWeeksAgo } links={ links } /> }
                        { context && ((page === 'warnings') || (page === 'strikes')) &&
                            <CorpDisciplineView context={ context } kind={ (page === 'warnings') ? 'warning' : 'strike' } weeksAgo={ weeksAgo } onWeekChange={ setWeeksAgo } links={ links } /> }
                    </main>
                    { context && (fileUserId > 0) &&
                        <CorpEmployeeFileView userId={ fileUserId } links={ links } onClose={ () => setFileUserId(0) } /> }
                    { context && issue &&
                        <CorpIssueView request={ issue } onClose={ () => setIssue(null) } /> }
                </div>
            </NitroCardContentView>
        </NitroCardView>
    );
}
