import { ILinkEventTracker, RpInventoryEvent, RpMoveItemComposer, RpUseItemComposer } from '@nitrots/nitro-renderer';
import { FC, PointerEvent as ReactPointerEvent, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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
    const [ ghost, setGhost ] = useState<{ x: number, y: number }>(null);
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

    const slotUnderPointer = (clientX: number, clientY: number): number =>
    {
        const cell = document.elementFromPoint(clientX, clientY)?.closest('[data-rp-slot]');
        const slot = (cell ? parseInt(cell.getAttribute('data-rp-slot'), 10) : NaN);

        return (Number.isFinite(slot) ? slot : -1);
    }

    // Window-level drag: pointerdown arms listeners on window, so the drop
    // always lands and state always resets no matter where the pointer ends
    // up (the old per-element pointer-capture version could strand the
    // highlight and drop nothing). The drop slot is computed from the
    // pointerup position itself - no state closures involved.
    const onItemDown = (event: ReactPointerEvent<HTMLDivElement>, slot: number) =>
    {
        if(event.button !== 0) return;

        movedRef.current = false;

        const startX = event.clientX;
        const startY = event.clientY;
        let started = false;

        // A drop may land on any unlocked slot, or swap with an occupied
        // lapsed slot (mirrors the server's placement rule).
        const isDropTarget = (over: number) => ((over !== slot) && ((over <= unlockedSlots) || !!items.get(over)));

        const onMove = (moveEvent: globalThis.PointerEvent) =>
        {
            if(!started)
            {
                if((Math.abs(moveEvent.clientX - startX) <= DRAG_THRESHOLD) && (Math.abs(moveEvent.clientY - startY) <= DRAG_THRESHOLD)) return;

                started = true;
                movedRef.current = true;

                setDragFrom(slot);
            }

            setGhost({ x: moveEvent.clientX, y: moveEvent.clientY });

            const over = slotUnderPointer(moveEvent.clientX, moveEvent.clientY);

            setDropTarget(((over >= 0) && isDropTarget(over)) ? over : -1);
        }

        const onUp = (upEvent: globalThis.PointerEvent) =>
        {
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
            window.removeEventListener('pointercancel', onUp);

            if(started && (upEvent.type === 'pointerup'))
            {
                const over = slotUnderPointer(upEvent.clientX, upEvent.clientY);

                if((over >= 0) && isDropTarget(over)) SendMessageComposer(new RpMoveItemComposer(slot, over));
            }

            setDragFrom(-1);
            setDropTarget(-1);
            setGhost(null);
        }

        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
        window.addEventListener('pointercancel', onUp);
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
                                    onPointerDown={ event => onItemDown(event, slot) }>
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
                { (dragFrom >= 0) && ghost && items.get(dragFrom) && ITEMS[items.get(dragFrom).item] &&
                    createPortal(
                        <div className="rp-inventory-drag-ghost" style={ { left: ghost.x, top: ghost.y } }>
                            <div className={ `rp-inventory-item ${ ITEMS[items.get(dragFrom).item].cls }` } />
                        </div>, document.body) }
            </NitroCardContentView>
        </NitroCardView>
    );
}
