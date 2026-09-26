import { ILinkEventTracker, RpInventoryEvent, RpMoveItemComposer, RpUseItemComposer } from '@nitrots/nitro-renderer';
import { ClothingIconUrl, ClothingShelfName, GetClothingCatalog, IsClothingCatalogLoaded, ParseClothingToken, RpClothingStoreEvent, RpGetClothingStoreComposer } from '../../api/rp-clothing/RpClothingMessages';
import { FC, PointerEvent as ReactPointerEvent, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { LuLock, LuShield, LuSwords } from 'react-icons/lu';
import { AddEventLinkTracker, HasHabboVip, RemoveLinkEventTracker, SendMessageComposer } from '../../api';
import { SendRpDiscardItem } from '../../api/rp-inventory/RpInventoryMessages';
import { DraggableWindowPosition, NitroCardContentView, NitroCardHeaderView, NitroCardView } from '../../common';
import { useLocalStorage, useMessageEvent } from '../../hooks';

// PixelRP RP inventory ("Backpack"), opened from the side drawer's Backpack
// button (CreateLinkEvent('rp-inventory/toggle')). Two gear slots (Weapon /
// Armor) up top, twelve carry slots below — the last two locked (future
// unlocks). Carry contents are LIVE: RpInventoryEvent fills them (login +
// every change), clicking a consumable uses it (RpUseItemComposer), and
// dragging an item onto another carry slot moves/swaps it
// (RpMoveItemComposer; the server answers with a fresh snapshot).

const DRAG_THRESHOLD: number = 6;
const CARRY_SLOTS: number[] = [ 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12 ];
const UNLOCKED_SLOTS: number = 10;
type ItemUseMode = 'single' | 'double';

// item key -> display name + icon class (icons live in assets/images/rp-items)
const ITEMS: Record<string, { name: string, cls: string }> = {
    smoothie: { name: 'Passive Smoothie', cls: 'rp-item-smoothie' },
    snack: { name: 'Snack', cls: 'rp-item-snack' },
    medkit: { name: 'Medkit', cls: 'rp-item-medkit' },
    vip_token_31: { name: 'VIP Token (31 days)', cls: 'rp-item-vip-token-gold' },
    vip_token_14: { name: 'VIP Token (14 days)', cls: 'rp-item-vip-token-silver' },
    // Unlocks :spit for good; the art is the Blue Paint Splat furni's own icon.
    spit_token: { name: 'Spit Token', cls: 'rp-item-spit-token' },
};

interface ItemMeta { name: string; cls: string; iconUrl?: string }

// Clothing Store tokens (clothing:<id>:<edition>) are named from the last
// shelf received and wear the piece's own catalog icon.
const resolveItem = (item: string): ItemMeta =>
{
    if(ITEMS[item]) return ITEMS[item];

    const token = ParseClothingToken(item);

    if(!token) return null;

    const listing = GetClothingCatalog().get(token.clothingId);
    const name = (listing ? ClothingShelfName(listing) : `#${ token.clothingId }`);
    const edition = ((listing && listing.ltdTotal > 0 && token.edition > 0) ? ` (LTD ${ token.edition } of ${ listing.ltdTotal })` : '');

    return { name: `Clothing Token · ${ name }${ edition }`, cls: 'rp-item-clothing-token', iconUrl: ClothingIconUrl(listing) };
}

export const RpInventoryView: FC<{}> = props =>
{
    const [ isVisible, setIsVisible ] = useState(false);
    const [ items, setItems ] = useState<Map<number, { item: string, count: number }>>(new Map());
    const [ dragFrom, setDragFrom ] = useState<number>(-1);
    // The pointer is over the bin that replaces the close button mid-drag.
    const [ overBin, setOverBin ] = useState(false);
    // An item dropped on the bin, waiting for the player to confirm how many.
    const [ discardSlot, setDiscardSlot ] = useState<number>(-1);
    const [ dropTarget, setDropTarget ] = useState<number>(-1);
    const [ ghost, setGhost ] = useState<{ x: number, y: number }>(null);
    const [ itemUseMode, setItemUseMode ] = useLocalStorage<ItemUseMode>('pixelrp.backpack.item-use-mode', 'single');
    const [ isUseModeOpen, setIsUseModeOpen ] = useState(false);
    const movedRef = useRef(false);
    // The slot hover bubble follows the mouse. Only its text is state; its
    // position is written straight to the element, so moving the mouse never
    // re-renders the backpack.
    const [ bubbleText, setBubbleText ] = useState<string>(null);
    const bubbleRef = useRef<HTMLDivElement>(null);
    const pointerRef = useRef({ x: 0, y: 0 });
    const useModeRef = useRef<HTMLDivElement>(null);

    // Live backpack contents — sent at login and after every change, so the
    // map is always a full snapshot.
    useMessageEvent<RpInventoryEvent>(RpInventoryEvent, event =>
    {
        const next = new Map<number, { item: string, count: number }>();

        for(const entry of event.getParser().items) next.set(entry.slot, { item: entry.item, count: entry.count });

        setItems(next);

        // a clothing token needs the shelf to be named; fetch it once
        if(!IsClothingCatalogLoaded() && event.getParser().items.some(entry => !!ParseClothingToken(entry.item))) SendMessageComposer(new RpGetClothingStoreComposer());
    });

    // the shelf arriving names any tokens already on screen
    useMessageEvent<RpClothingStoreEvent>(RpClothingStoreEvent, event => setItems(prevValue => new Map(prevValue)));

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

    useEffect(() =>
    {
        if(isVisible) return;

        setIsUseModeOpen(false);
        setBubbleText(null);
    }, [ isVisible ]);

    useEffect(() =>
    {
        if(!isUseModeOpen) return;

        const onPointerDown = (event: globalThis.PointerEvent) =>
        {
            if(!useModeRef.current?.contains(event.target as Node)) setIsUseModeOpen(false);
        }

        document.addEventListener('pointerdown', onPointerDown);

        return () => document.removeEventListener('pointerdown', onPointerDown);
    }, [ isUseModeOpen ]);

    // 14px right of the pointer, level with it, so it clears the arrow cursor;
    // flipped to the left when it would run off the right of the screen.
    const placeBubble = () =>
    {
        const bubble = bubbleRef.current;

        if(!bubble) return;

        const { x, y } = pointerRef.current;
        let left = (x + 14);

        if((left + bubble.offsetWidth) > (window.innerWidth - 4)) left = (x - 14 - bubble.offsetWidth);

        bubble.style.transform = `translate(${ left }px, ${ Math.round(y - (bubble.offsetHeight / 2)) }px)`;
    }

    const bubbleProps = (text: string) => ({
        onPointerEnter: (event: ReactPointerEvent<HTMLDivElement>) =>
        {
            // No hover on touch screens.
            if(event.pointerType !== 'mouse') return;

            pointerRef.current = { x: event.clientX, y: event.clientY };
            setBubbleText(text);
        },
        onPointerMove: (event: ReactPointerEvent<HTMLDivElement>) =>
        {
            pointerRef.current = { x: event.clientX, y: event.clientY };
            placeBubble();
        },
        onPointerLeave: () => setBubbleText(null)
    });

    // Placed before paint, so a new bubble never flashes at the corner.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useLayoutEffect(() => placeBubble(), [ bubbleText ]);

    // Hidden while an item is dragged, so no bubble fights the drag ghost; a
    // new one needs the pointer to enter a slot again.
    useEffect(() =>
    {
        if(dragFrom >= 0) setBubbleText(null);
    }, [ dragFrom ]);

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

    const binUnderPointer = (clientX: number, clientY: number): boolean => !!document.elementFromPoint(clientX, clientY)?.closest('[data-rp-bin]');

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
            setOverBin(binUnderPointer(moveEvent.clientX, moveEvent.clientY));
        }

        const onUp = (upEvent: globalThis.PointerEvent) =>
        {
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
            window.removeEventListener('pointercancel', onUp);

            if(started && (upEvent.type === 'pointerup'))
            {
                const over = slotUnderPointer(upEvent.clientX, upEvent.clientY);

                // Dropped on the bin: ask first, and how many.
                if(binUnderPointer(upEvent.clientX, upEvent.clientY)) setDiscardSlot(slot);
                else if((over >= 0) && isDropTarget(over)) SendMessageComposer(new RpMoveItemComposer(slot, over));
            }

            setDragFrom(-1);
            setDropTarget(-1);
            setOverBin(false);
            setGhost(null);
        }

        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
        window.addEventListener('pointercancel', onUp);
    }

    const onItemClick = (slot: number) =>
    {
        // A completed drag must not also consume the item.
        if(movedRef.current)
        {
            movedRef.current = false;

            return;
        }

        if(itemUseMode === 'single') SendMessageComposer(new RpUseItemComposer(slot));
    }

    const onItemDoubleClick = (slot: number) =>
    {
        if(movedRef.current)
        {
            movedRef.current = false;

            return;
        }

        if(itemUseMode === 'double') SendMessageComposer(new RpUseItemComposer(slot));
    }

    const chooseItemUseMode = (mode: ItemUseMode) =>
    {
        setItemUseMode(mode);
        setIsUseModeOpen(false);
    }

    const discardEntry = ((discardSlot > 0) ? items.get(discardSlot) : null);

    return (
        <>
            <NitroCardView uniqueKey="rp-inventory" className="rp-inventory-window" theme="primary-slim" windowPosition={ DraggableWindowPosition.SIDE_DRAWER }>
                <NitroCardHeaderView headerText="Backpack" onCloseClick={ () => setIsVisible(false) } />
                { /* While an item is being dragged the close button becomes a bin:
                 drop the item on it to throw the stack away. It sits exactly
                 over the X, so letting go anywhere else changes nothing. */ }
                { (dragFrom >= 0) &&
                <div data-rp-bin className={ 'rp-inventory-bin' + (overBin ? ' is-over' : '') } title="Drop here to throw it away" aria-label="Throw away">
                    <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M2 3.5h10" /><path d="M5.5 3.5V2h3v1.5" /><path d="M3.5 3.5l.6 8.5h5.8l.6-8.5" /><path d="M5.8 6v3.8M8.2 6v3.8" /></svg>
                </div> }
                <div ref={ useModeRef } className="rp-inventory-use-mode">
                    <button type="button" className="rp-inventory-use-mode-toggle" title="Item use mode" aria-label="Item use mode" aria-expanded={ isUseModeOpen } onClick={ () => setIsUseModeOpen(value => !value) }>
                        <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M8 2l2 2-6 6H2V8z" /><path d="M6.8 3.2l2 2" /></svg>
                    </button>
                    { isUseModeOpen &&
                    <div className="rp-inventory-use-mode-menu">
                        <button type="button" className={ (itemUseMode === 'single') ? 'is-active' : '' } onClick={ () => chooseItemUseMode('single') }>Single Click</button>
                        <button type="button" className={ (itemUseMode === 'double') ? 'is-active' : '' } onClick={ () => chooseItemUseMode('double') }>Double Click</button>
                    </div> }
                </div>
                { /* gap 1 (4px): the gear frame sits as far from slots 1 and 2 as
                     the slots sit from each other */ }
                <NitroCardContentView className="text-black" gap={ 1 }>
                    <div className="rp-inventory-gear">
                        <div className="rp-inventory-slot rp-inventory-slot--gear" { ...bubbleProps('Weapon') }>
                            <LuSwords className="rp-inventory-gear-icon" />
                        </div>
                        <div className="rp-inventory-slot rp-inventory-slot--gear" { ...bubbleProps('Armor') }>
                            <LuShield className="rp-inventory-gear-icon" />
                        </div>
                    </div>
                    <div className="rp-inventory-grid">
                        { CARRY_SLOTS.map(slot =>
                        {
                            if((slot > unlockedSlots) && !items.get(slot))
                            {
                                return (
                                    <div key={ slot } className="rp-inventory-slot is-locked" { ...bubbleProps('Locked') }>
                                        <LuLock className="rp-inventory-slot-icon rp-inventory-slot-icon--locked" />
                                    </div>);
                            }

                            const entry = items.get(slot);
                            const meta = (entry ? resolveItem(entry.item) : null);

                            if(entry && meta)
                            {
                                return (
                                    <div key={ slot } data-rp-slot={ slot }
                                        className={ `rp-inventory-slot has-item${ (dragFrom === slot) ? ' is-drag-source' : '' }${ (dropTarget === slot) ? ' is-drop-target' : '' }` }
                                        { ...bubbleProps(meta.name) }
                                        onClick={ () => onItemClick(slot) }
                                        onDoubleClick={ () => onItemDoubleClick(slot) }
                                        onPointerDown={ event => onItemDown(event, slot) }>
                                        <div className={ `rp-inventory-item ${ meta.cls }` } style={ meta.iconUrl ? { backgroundImage: `url(${ meta.iconUrl })` } : undefined } />
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
                    { bubbleText && (dragFrom < 0) &&
                    createPortal(
                        <div ref={ bubbleRef } className="tooltip show rp-inventory-bubble" role="tooltip">
                            <div className="tooltip-inner">{ bubbleText }</div>
                        </div>, document.body) }
                    { (dragFrom >= 0) && ghost && items.get(dragFrom) && ITEMS[items.get(dragFrom).item] &&
                    createPortal(
                        <div className="rp-inventory-drag-ghost" style={ { left: ghost.x, top: ghost.y } }>
                            <div className={ `rp-inventory-item ${ resolveItem(items.get(dragFrom).item)?.cls || '' }` } style={ resolveItem(items.get(dragFrom).item)?.iconUrl ? { backgroundImage: `url(${ resolveItem(items.get(dragFrom).item).iconUrl })` } : undefined } />
                        </div>, document.body) }
                </NitroCardContentView>
            </NitroCardView>
            { discardEntry &&
            <RpDiscardConfirmView key={ discardSlot } itemName={ resolveItem(discardEntry.item)?.name || discardEntry.item }
                iconClass={ resolveItem(discardEntry.item)?.cls || '' } iconUrl={ resolveItem(discardEntry.item)?.iconUrl }
                owned={ discardEntry.count }
                onConfirm={ count =>
                {
                    SendRpDiscardItem(discardSlot, count);
                    setDiscardSlot(-1);
                } }
                onCancel={ () => setDiscardSlot(-1) } /> }
        </>
    );
}

interface RpDiscardConfirmViewProps
{
    itemName: string;
    iconClass: string;
    iconUrl?: string;
    owned: number;
    onConfirm: (count: number) => void;
    onCancel: () => void;
}

// "Are you sure?" for the backpack bin, with how many to throw away when the
// slot holds a stack. Starts at one - the cautious answer - and cannot go past
// what the slot holds. If the slot empties while this is open (the item was
// used, or the stack changed), the parent stops rendering it.
const RpDiscardConfirmView: FC<RpDiscardConfirmViewProps> = props =>
{
    const { itemName, iconClass, iconUrl = null, owned, onConfirm, onCancel } = props;
    const [ count, setCount ] = useState(1);
    const [ typed, setTyped ] = useState('1');

    const clamp = (value: number) => Math.max(1, Math.min(owned, Math.floor(value) || 1));

    const setBoth = (value: number) =>
    {
        const next = clamp(value);

        setCount(next);
        setTyped(String(next));
    }

    // The stack can shrink while the window is open; never offer more than is there.
    useEffect(() =>
    {
        if(count > owned) setBoth(owned);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ owned ]);

    return (
        <NitroCardView uniqueKey="rp-inventory-discard" className="rp-discard-window" theme="primary-slim" windowPosition={ DraggableWindowPosition.CENTER }>
            <NitroCardHeaderView headerText="Throw away?" onCloseClick={ onCancel } />
            <NitroCardContentView className="rp-discard-body">
                <div className="rp-discard-item">
                    <div className="rp-discard-icon">
                        <div className={ `rp-inventory-item ${ iconClass }` } style={ iconUrl ? { backgroundImage: `url(${ iconUrl })` } : undefined } />
                    </div>
                    <div className="rp-discard-text">
                        <div className="rp-discard-name">{ itemName }</div>
                        <div className="rp-discard-owned">You have { owned }.</div>
                    </div>
                </div>
                { (owned > 1) &&
                    <div className="rp-discard-amount">
                        <span>How many?</span>
                        <div className="rp-discard-stepper">
                            <button type="button" aria-label="One fewer" disabled={ count <= 1 } onClick={ () => setBoth(count - 1) }>&minus;</button>
                            <input type="number" min={ 1 } max={ owned } aria-label="How many to throw away" value={ typed }
                                onChange={ event =>
                                {
                                    setTyped(event.target.value);

                                    const parsed = parseInt(event.target.value, 10);

                                    if(Number.isFinite(parsed)) setCount(clamp(parsed));
                                } }
                                onBlur={ () => setTyped(String(count)) } />
                            <button type="button" aria-label="One more" disabled={ count >= owned } onClick={ () => setBoth(count + 1) }>+</button>
                            <button type="button" className="rp-discard-all" disabled={ count >= owned } onClick={ () => setBoth(owned) }>All</button>
                        </div>
                    </div> }
                <div className="rp-discard-warning">This can&apos;t be undone.</div>
                <div className="rp-discard-actions">
                    <button type="button" className="rp-discard-cancel" onClick={ onCancel }>Cancel</button>
                    <button type="button" className="rp-discard-confirm" onClick={ () => onConfirm(count) }>
                        { (owned > 1) ? `Throw away ${ count }` : 'Throw away' }
                    </button>
                </div>
            </NitroCardContentView>
        </NitroCardView>
    );
}
