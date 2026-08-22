import { ILinkEventTracker } from '@nitrots/nitro-renderer';
import { FC, useEffect, useState } from 'react';
import { AddEventLinkTracker, RemoveLinkEventTracker } from '../../api';
import { Column, NitroCardContentView, NitroCardHeaderView, NitroCardTabsItemView, NitroCardTabsView, NitroCardView, Text } from '../../common';

// PixelRP settings window, opened from the side drawer's Settings button
// (CreateLinkEvent('rp-settings/toggle')). Multi-tab shell — the tabs and
// their contents are placeholders to be filled out as settings are decided.
const TABS: string[] = [ 'General', 'Chat', 'Audio', 'Notifications' ];

export const RpSettingsView: FC<{}> = props =>
{
    const [ isVisible, setIsVisible ] = useState(false);
    const [ currentTab, setCurrentTab ] = useState<string>(TABS[0]);

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
            eventUrlPrefix: 'rp-settings/'
        };

        AddEventLinkTracker(linkTracker);

        return () => RemoveLinkEventTracker(linkTracker);
    }, []);

    if(!isVisible) return null;

    return (
        <NitroCardView uniqueKey="rp-settings" className="rp-settings-window" theme="primary-slim">
            <NitroCardHeaderView headerText="Settings" onCloseClick={ () => setIsVisible(false) } />
            <NitroCardTabsView>
                { TABS.map(tab => (
                    <NitroCardTabsItemView key={ tab } isActive={ currentTab === tab } onClick={ () => setCurrentTab(tab) }>
                        { tab }
                    </NitroCardTabsItemView>
                )) }
            </NitroCardTabsView>
            <NitroCardContentView className="text-black">
                <Column center fullHeight gap={ 1 } className="rp-settings-placeholder">
                    <Text bold>{ currentTab }</Text>
                    <Text className="text-muted">Nothing here yet.</Text>
                </Column>
            </NitroCardContentView>
        </NitroCardView>
    );
}
