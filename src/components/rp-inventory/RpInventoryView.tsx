import { ILinkEventTracker } from '@nitrots/nitro-renderer';
import { FC, useEffect, useState } from 'react';
import { LuLock, LuShield, LuSwords } from 'react-icons/lu';
import { AddEventLinkTracker, RemoveLinkEventTracker } from '../../api';
import { NitroCardContentView, NitroCardHeaderView, NitroCardView } from '../../common';

// PixelRP RP inventory ("Backpack"), opened from the side drawer's Inventory
// button (CreateLinkEvent('rp-inventory/toggle')). Visual shell for now:
// two gear slots (Weapon / Armor) up top, twelve carry slots below — the
// last two locked by default (future unlocks). Item data wiring comes later.
const CARRY_SLOTS: number[] = [ 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12 ];
const UNLOCKED_SLOTS: number = 10;

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
            <NitroCardContentView className="text-black">
                <div className="rp-inventory-gear">
                    <div className="rp-inventory-slot rp-inventory-slot--gear" title="Weapon">
                        <LuSwords className="rp-inventory-slot-icon" />
                    </div>
                    <div className="rp-inventory-slot rp-inventory-slot--gear" title="Armor">
                        <LuShield className="rp-inventory-slot-icon" />
                    </div>
                </div>
                <div className="rp-inventory-grid">
                    { CARRY_SLOTS.map(slot => (
                        (slot <= UNLOCKED_SLOTS)
                            ? <div key={ slot } className="rp-inventory-slot">
                                <span className="rp-inventory-slot-label">{ slot }</span>
                            </div>
                            : <div key={ slot } className="rp-inventory-slot is-locked" title="Locked">
                                <LuLock className="rp-inventory-slot-icon rp-inventory-slot-icon--locked" />
                            </div>
                    )) }
                </div>
            </NitroCardContentView>
        </NitroCardView>
    );
}
