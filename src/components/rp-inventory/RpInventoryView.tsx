import { ILinkEventTracker, RpInventoryEvent, RpUseItemComposer } from '@nitrots/nitro-renderer';
import { FC, useEffect, useState } from 'react';
import { LuLock, LuShield, LuSwords } from 'react-icons/lu';
import { AddEventLinkTracker, HasHabboVip, RemoveLinkEventTracker, SendMessageComposer } from '../../api';
import { NitroCardContentView, NitroCardHeaderView, NitroCardView } from '../../common';
import { useMessageEvent } from '../../hooks';

// PixelRP RP inventory ("Backpack"), opened from the side drawer's Inventory
// button (CreateLinkEvent('rp-inventory/toggle')). Two gear slots (Weapon /
// Armor) up top, twelve carry slots below — the last two locked (future
// unlocks). Carry contents are LIVE: RpInventoryEvent fills them (login +
// every change) and clicking a consumable uses it (RpUseItemComposer).
const CARRY_SLOTS: number[] = [ 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12 ];
const UNLOCKED_SLOTS: number = 10;

// item key -> display name + icon class (icons live in assets/images/rp-items)
const ITEMS: Record<string, { name: string, cls: string }> = {
    smoothie: { name: 'Passive Smoothie', cls: 'rp-item-smoothie' },
    vip_token_31: { name: 'VIP Token (31 days)', cls: 'rp-item-vip-token-gold' },
    vip_token_14: { name: 'VIP Token (14 days)', cls: 'rp-item-vip-token-silver' },
};

export const RpInventoryView: FC<{}> = props =>
{
    const [ isVisible, setIsVisible ] = useState(false);
    const [ items, setItems ] = useState<Map<number, { item: string, count: number }>>(new Map());

    // Live backpack contents — sent at login and after every change, so the
    // map is always a full snapshot.
    useMessageEvent<RpInventoryEvent>(RpInventoryEvent, event =>
    {
        const next = new Map<number, { item: string, count: number }>();

        for(const entry of event.getParser().items) next.set(entry.slot, { item: entry.item, count: entry.count });

        setItems(next);
    });

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

    // VIP unlocks carry slots 11-12. Soft lapse: a slot past the unlock that
    // still holds an item stays usable (consume/inspect) - it just won't accept
    // anything new (the server enforces placement).
    const unlockedSlots = (HasHabboVip() ? CARRY_SLOTS.length : UNLOCKED_SLOTS);

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
                    { CARRY_SLOTS.map(slot =>
                    {
                        if((slot > unlockedSlots) && !items.get(slot))
                        {
                            return (
                                <div key={ slot } className="rp-inventory-slot is-locked" title="Locked">
                                    <LuLock className="rp-inventory-slot-icon rp-inventory-slot-icon--locked" />
                                </div>);
                        }

                        const entry = items.get(slot);
                        const meta = (entry ? ITEMS[entry.item] : null);

                        if(entry && meta)
                        {
                            return (
                                <div key={ slot } className="rp-inventory-slot has-item" title={ meta.name }
                                    onClick={ () => SendMessageComposer(new RpUseItemComposer(slot)) }>
                                    <div className={ `rp-inventory-item ${ meta.cls }` } />
                                    { (entry.count > 1) &&
                                        <span className="rp-inventory-count">{ entry.count }</span> }
                                </div>);
                        }

                        return (
                            <div key={ slot } className="rp-inventory-slot">
                                <span className="rp-inventory-slot-label">{ slot }</span>
                            </div>);
                    }) }
                </div>
            </NitroCardContentView>
        </NitroCardView>
    );
}
