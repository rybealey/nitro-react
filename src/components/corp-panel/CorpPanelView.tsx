import { ILinkEventTracker } from '@nitrots/nitro-renderer';
import { FC, ReactNode, useEffect, useState } from 'react';
import { LuCalendarDays, LuLayoutGrid } from 'react-icons/lu';
import { AddEventLinkTracker, RemoveLinkEventTracker, SendMessageComposer } from '../../api';
import { DEFAULT_CORP_BADGE } from '../../api/rp-employment/RpEmploymentRegistry';
import { CorpPanelAction, CorpPanelContext, RpCorpPanelActionComposer, RpCorpPanelEvent } from '../../api/rp-corps/RpCorpPanelMessages';
import { DraggableWindowPosition, LayoutBadgeImageView, NitroCardContentView, NitroCardHeaderView, NitroCardView } from '../../common';
import { useMessageEvent } from '../../hooks';
import { CorpDashboardView } from './views/CorpDashboardView';
import { CorpShiftsView } from './views/CorpShiftsView';

// PixelRP Corporation Panel - a corporation's own management window, for its
// management ranks (rp_corporation_ranks.panel_access; emulator
// HabboHotel/Corporations/CorpPanel; design: the "Corporation Panel" canvas).
//
// Opened by :cp, which checks the rank and sends 'corp-panel/show'. The
// window then asks for who is looking (RpCorpPanelEvent) and each page asks
// for its own data. Every packet is checked again on the server, which sends
// 'corp-panel/hide' to anyone who has lost access with the window open.

export type CorpPanelPage = 'dashboard' | 'shifts';

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
    }
];

export const CorpPanelView: FC<{}> = props =>
{
    const [ isVisible, setIsVisible ] = useState(false);
    const [ context, setContext ] = useState<CorpPanelContext>(null);
    const [ page, setPage ] = useState<CorpPanelPage>('dashboard');
    // The week switch is the panel's, not a page's: moving from the
    // Dashboard to Weekly shifts keeps the week you were looking at.
    const [ weeksAgo, setWeeksAgo ] = useState(0);

    useMessageEvent<RpCorpPanelEvent>(RpCorpPanelEvent, event => setContext(event.getParser().context));

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
    }, [ isVisible ]);

    if(!isVisible) return null;

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
                                            aria-current={ (item.page === page) ? 'page' : undefined } onClick={ () => setPage(item.page) }>
                                            { item.icon }
                                            <span>{ item.label }</span>
                                        </button>) }
                                </div>) }
                        </nav>
                    </aside>
                    <main className="corp-main">
                        { !context && <div className="mt-empty">Loading your corporation…</div> }
                        { context && (page === 'dashboard') &&
                            <CorpDashboardView context={ context } weeksAgo={ weeksAgo } onWeekChange={ setWeeksAgo } onOpen={ setPage } /> }
                        { context && (page === 'shifts') &&
                            <CorpShiftsView context={ context } weeksAgo={ weeksAgo } onWeekChange={ setWeeksAgo } /> }
                    </main>
                </div>
            </NitroCardContentView>
        </NitroCardView>
    );
}
