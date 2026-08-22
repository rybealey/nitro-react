import { ILinkEventTracker } from '@nitrots/nitro-renderer';
import { FC, useEffect, useState } from 'react';
import { FaPencilAlt } from 'react-icons/fa';
import { GiBreastplate, GiCrossedSwords } from 'react-icons/gi';
import { AddEventLinkTracker, RemoveLinkEventTracker } from '../../api';
import { NitroCardContentView, NitroCardHeaderView, NitroCardView, Text } from '../../common';

// PixelRP RP inventory ("Backpack"), opened from the side drawer's Inventory
// button (CreateLinkEvent('rp-inventory/toggle')). Visual shell for now:
// two gear slots (Weapon / Armor) in the accent frame, ten numbered
// carry slots below. Item data wiring comes later.
const CARRY_SLOTS: number[] = [ 1, 2, 3, 4, 5, 6, 7, 8, 9, 10 ];

export const RpInventoryView: FC<{}> = props =>
{
    const [ isVisible, setIsVisible ] = useState(false);

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
            eventUrlPrefix: 'rp-inventory/'
        };

        AddEventLinkTracker(linkTracker);

        return () => RemoveLinkEventTracker(linkTracker);
    }, []);

    if(!isVisible) return null;

    return (
        <NitroCardView uniqueKey="rp-inventory" className="rp-inventory-window" theme="primary-slim">
            <NitroCardHeaderView headerText="Backpack" onCloseClick={ () => setIsVisible(false) } />
            { /* placeholder edit control, styled into the header row */ }
            <div className="rp-inventory-edit" title="Edit"><FaPencilAlt /></div>
            <NitroCardContentView className="text-black">
                <div className="rp-inventory-gear">
                    <div className="rp-inventory-slot rp-inventory-slot--gear" title="Weapon">
                        <GiCrossedSwords className="rp-inventory-slot-icon" />
                    </div>
                    <div className="rp-inventory-slot rp-inventory-slot--gear" title="Armor">
                        <GiBreastplate className="rp-inventory-slot-icon" />
                    </div>
                </div>
                <div className="rp-inventory-grid">
                    { CARRY_SLOTS.map(slot => (
                        <div key={ slot } className="rp-inventory-slot">
                            <Text className="rp-inventory-slot-label">{ slot }</Text>
                        </div>
                    )) }
                </div>
            </NitroCardContentView>
        </NitroCardView>
    );
}
