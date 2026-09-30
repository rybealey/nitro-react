import { ILinkEventTracker } from '@nitrots/nitro-renderer';
import { FC, useEffect, useState } from 'react';
import { AddEventLinkTracker, GetSessionDataManager, RemoveLinkEventTracker, SendMessageComposer } from '../../api';
import { CityCapability, RpCityPanelEvent, RpCityPanelOpenComposer } from '../../api/rp-city/RpCityMessages';
import { DraggableWindowPosition, NitroCardContentView, NitroCardHeaderView, NitroCardTabsItemView, NitroCardTabsView, NitroCardView } from '../../common';
import { useMessageEvent } from '../../hooks';
import { CityPlayersView } from './views/CityPlayersView';
import { CityRoomsView } from './views/CityRoomsView';
import { CityUniformsView } from './views/CityUniformsView';

// PixelRP City Panel - the staff window for managing the city (design: the
// "City Panel" canvas), opened from Mod Tools. Emulator: HabboHotel/CityPanel.
//
// Opened by CreateLinkEvent('city-panel/toggle|show|hide'), or
// 'city-panel/player/<id>' to land on one player's card. What each button may
// do comes from the server on open (capabilities); every packet is checked
// again there, so this only decides what to offer.

const TABS = [ 'Players', 'Rooms & Zones', 'Uniforms' ] as const;
type Tab = typeof TABS[number];

export interface CityPanelContext
{
    capabilities: number;
    items: { key: string, name: string }[];
}

export const CityPanelView: FC<{}> = props =>
{
    const [ isVisible, setIsVisible ] = useState(false);
    const [ tab, setTab ] = useState<Tab>('Players');
    const [ context, setContext ] = useState<CityPanelContext>({ capabilities: 0, items: [] });
    const [ openPlayerId, setOpenPlayerId ] = useState(0);

    useEffect(() =>
    {
        const linkTracker: ILinkEventTracker = {
            linkReceived: (url: string) =>
            {
                // Staff only: the server refuses everything for anyone else,
                // so the window would open empty.
                if(!GetSessionDataManager().isModerator) return;

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
                    case 'player':
                        setTab('Players');
                        setOpenPlayerId(Number(parts[2]) || 0);
                        setIsVisible(true);
                        return;
                }
            },
            eventUrlPrefix: 'city-panel/'
        };

        AddEventLinkTracker(linkTracker);

        return () => RemoveLinkEventTracker(linkTracker);
    }, []);

    useEffect(() =>
    {
        if(isVisible) SendMessageComposer(new RpCityPanelOpenComposer());
    }, [ isVisible ]);

    useMessageEvent<RpCityPanelEvent>(RpCityPanelEvent, event =>
    {
        const parser = event.getParser();

        setContext({ capabilities: parser.capabilities, items: parser.items });
    });

    if(!isVisible) return null;

    return (
        <NitroCardView uniqueKey="city-panel" className="nitro-city-panel" theme="primary-slim" windowPosition={ DraggableWindowPosition.CENTER } resizable>
            <NitroCardHeaderView headerText="City Panel" onCloseClick={ () => setIsVisible(false) } />
            <NitroCardTabsView justifyContent="start">
                { TABS.filter(name => ((name !== 'Uniforms') || ((context.capabilities & CityCapability.Uniforms) !== 0))).map(name =>
                    <NitroCardTabsItemView key={ name } isActive={ (tab === name) } onClick={ () => setTab(name) }>
                        { name }
                    </NitroCardTabsItemView>) }
            </NitroCardTabsView>
            <NitroCardContentView className="mt-page" overflow="hidden">
                { (tab === 'Players') && <CityPlayersView context={ context } openPlayerId={ openPlayerId } onOpened={ () => setOpenPlayerId(0) } /> }
                { (tab === 'Rooms & Zones') && <CityRoomsView /> }
                { (tab === 'Uniforms') && <CityUniformsView /> }
            </NitroCardContentView>
        </NitroCardView>
    );
}
