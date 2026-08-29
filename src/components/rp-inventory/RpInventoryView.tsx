import { ILinkEventTracker, RpInventoryEvent, RpMoveItemComposer, RpUseItemComposer } from '@nitrots/nitro-renderer';
import { FC, PointerEvent, useEffect, useRef, useState } from 'react';
import { LuLock, LuShield, LuSwords } from 'react-icons/lu';
import { AddEventLinkTracker, HasHabboVip, RemoveLinkEventTracker, SendMessageComposer } from '../../api';
import { NitroCardContentView, NitroCardHeaderView, NitroCardView } from '../../common';
import { useMessageEvent } from '../../hooks';

// PixelRP RP inventory ("Backpack"), opened from the side drawer's Inventory
// button (CreateLinkEvent('rp-inventory/toggle')). Two gear slots (Weapon /
// Armor) up top, twelve carry slots below — the last two locked (future
// unlocks). Carry contents are LIVE: RpInventoryEvent fills them (login +
// every change), clicking a consumable uses it (RpUseItemComposer), and
// dragging an item onto another carry slot moves/swaps it
// (RpMoveItemComposer; the server answers with a fresh snapshot).

const DRAG_THRESHOLD: number = 6;
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
    const [ dragFrom, setDragFrom ] = useState<number>(-1);
    const [ dropTarget, setDropTarget ] = useState<number>(-1);
    const startRef = useRef<{ slot: number, x: number, y: number }>(null);
    const movedRef = useRef(false);

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

    // A drop may land on any unlocked slot, or swap with an occupied lapsed
    // slot (mirrors the server's placement rule).
    const isDropTarget = (slot: number) => ((slot !== dragFrom) && ((slot <= unlockedSlots) || !!items.get(slot)));

    const slotUnderPointer = (clientX: number, clientY: number): number =>
    {
        const cell = document.elementFromPoint(clientX, clientY)?.closest('[data-rp-slot]');
        const slot = (cell ? parseInt(cell.getAttribute('data-rp-slot'), 10) : NaN);

        return (Number.isFinite(slot) ? slot : -1);
    }

    const onItemDown = (event: PointerEvent<HTMLDivElement>, slot: number) =>
    {
        try
        {
            event.currentTarget.setPointerCapture(event.pointerId);
        }
        catch(e)
        {}

        movedRef.current = false;
        startRef.current = { slot, x: event.clientX, y: event.clientY };
    }

    const onItemMove = (event: PointerEvent<HTMLDivElement>) =>
    {
        const start = startRef.current;

        if(!start) return;

        if(dragFrom < 0)
        {
            if((Math.abs(event.clientX - start.x) <= DRAG_THRESHOLD) && (Math.abs(event.clientY - start.y) <= DRAG_THRESHOLD)) return;

            movedRef.current = true;

            setDragFrom(start.slot);
        }

        const over = slotUnderPointer(event.clientX, event.clientY);

        setDropTarget(((over >= 0) && isDropTarget(over)) ? over : -1);
    }

    const onItemUp = () =>
    {
        if((dragFrom >= 0) && (dropTarget >= 0)) SendMessageComposer(new RpMoveItemComposer(dragFrom, dropTarget));

        startRef.current = null;

        setDragFrom(-1);
        setDropTarget(-1);
    }

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
                                <div key={ slot } data-rp-slot={ slot }
                                    className={ `rp-inventory-slot has-item${ (dragFrom === slot) ? ' is-drag-source' : '' }${ (dropTarget === slot) ? ' is-drop-target' : '' }` }
                                    title={ meta.name }
                                    onClick={ () =>
                                    {
                                        // a completed drag must not also consume the item
                                        if(movedRef.current)
                                        {
                                            movedRef.current = false;

                                            return;
                                        }

                                        SendMessageComposer(new RpUseItemComposer(slot));
                                    } }
                                    onPointerDown={ event => onItemDown(event, slot) }
                                    onPointerMove={ onItemMove }
                                    onPointerUp={ onItemUp }
                                    onPointerCancel={ onItemUp }>
                                    <div className={ `rp-inventory-item ${ meta.cls }` } />
                                    { (entry.count > 1) &&
                                        <span className="rp-inventory-count">{ entry.count }</span> }
                                </div>);
                        }

                        return (
                            <div key={ slot } data-rp-slot={ slot }
                                className={ `rp-inventory-slot${ (dropTarget === slot) ? ' is-drop-target' : '' }` }>
                                <span className="rp-inventory-slot-label">{ slot }</span>
                            </div>);
                    }) }
                </div>
            </NitroCardContentView>
        </NitroCardView>
    );
}
