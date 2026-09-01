import { ILinkEventTracker } from '@nitrots/nitro-renderer';
import { FC, useEffect, useState } from 'react';
import { AddEventLinkTracker, RemoveLinkEventTracker } from '../../api';
import { NitroCardContentView, NitroCardHeaderView, NitroCardView } from '../../common';

// PixelRP Wanted List, opened from the side drawer's Wanted button
// (CreateLinkEvent('rp-wanted/toggle')). Players land here when they are
// charged with a crime and drop off when their sentence expires.
//
// BASE ONLY - there is no wanted system on the server yet. The HUD's wanted
// stars are still derived from a username hash (mockStatsFor in
// PlayerHudWidgetView), and the emulator has no crime table, charge logic or
// packet for any of this. So the list is always empty for now and the window
// renders its empty state; WantedEntry below is the seam the real feed plugs
// into once that system exists.

export interface WantedEntry
{
    username: string;
    figure: string;
    // 1-5, same scale as the HUD's wanted stars
    wanted: number;
    // epoch ms the charge lapses at - drives the countdown column
    expiresAt: number;
}

export const RpWantedView: FC<{}> = props =>
{
    const [ isVisible, setIsVisible ] = useState(false);
    // Stays empty until the server can report charges; no mock feed.
    const [ entries ] = useState<WantedEntry[]>([]);

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
            eventUrlPrefix: 'rp-wanted/'
        };

        AddEventLinkTracker(linkTracker);

        return () => RemoveLinkEventTracker(linkTracker);
    }, []);

    if(!isVisible) return null;

    return (
        <NitroCardView resizable uniqueKey="rp-wanted" className="rp-wanted-window" theme="primary-slim">
            <NitroCardHeaderView headerText="Wanted List" onCloseClick={ () => setIsVisible(false) } />
            <NitroCardContentView className="text-black">
                <div className="rp-wanted-list">
                    { !entries.length &&
                        <div className="rp-wanted-none">
                            <div className="rp-wanted-none-text">Nobody is wanted right now.</div>
                        </div> }
                </div>
            </NitroCardContentView>
        </NitroCardView>
    );
}
