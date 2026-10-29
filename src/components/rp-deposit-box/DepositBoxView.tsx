import { RpInventoryEvent } from '@nitrots/nitro-renderer';
import { DragEvent, FC, useEffect, useState } from 'react';
import { HasHabboVip, SendMessageComposer } from '../../api';
import { DepositBoxEntry, DepositDirection, RpDepositBoxEvent, RpDepositMoveComposer } from '../../api/rp-bank/RpDepositBoxMessages';
import { ResolveRpItem } from '../../api/rp-inventory/RpItems';
import { DraggableWindowPosition, NitroCardContentView, NitroCardHeaderView, NitroCardView } from '../../common';
import { useMessageEvent } from '../../hooks';

// PixelRP bank deposit box (design: the "Bank Deposit Box" canvas). Opens
// while you stand on deposit_box furni at the bank and closes when you step
// off (emulator DepositBox, which checks every move against that).
//
// Your backpack's carry slots on the left, the box on the right. Click an item
// to move one across; drag it to the other side to move the whole stack. The
// server answers every move with both sides, so this only ever shows them.
//
// The box's first four slots are open to everybody and the rest are bought, one
// at a time and in order (emulator DepositBox.BuySlot): click a lock and the next
// slot in line asks "Buy $350", click again to buy it - Sell back's two clicks
// on the Apartments window.

const CARRY_SLOTS = [ 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12 ];
// Ten carry slots open to everybody, all twelve while VIP - the backpack's own
// rule (RpInventoryView), read the same way.
const CARRY_OPEN = 10;
// Six rows of four, level with the backpack's six rows (emulator DepositBox.MaxSlots).
const BOX_SLOTS = Array.from({ length: 24 }, (_, index) => (index + 1));
// How long "Buy $350" waits for the second click (the Apartments window's own).
const CONFIRM_MS = 5000;

const Money = (value: number) => `$${ Math.max(0, value || 0).toLocaleString('en-US') }`;

type Side = 'pack' | 'box';

interface Dragging
{
    side: Side;
    slot: number;
}

const Lock: FC<{}> = () =>
    <svg className="deposit-lock" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 018 0v3" /></svg>;

export const DepositBoxView: FC<{}> = props =>
{
    const [ isOpen, setIsOpen ] = useState(false);
    const [ pack, setPack ] = useState<Map<number, DepositBoxEntry>>(new Map());
    const [ box, setBox ] = useState<Map<number, DepositBoxEntry>>(new Map());
    const [ boxOpenSlots, setBoxOpenSlots ] = useState(4);
    // What one more slot costs; 0 from an emulator that does not sell them.
    const [ slotPrice, setSlotPrice ] = useState(0);
    // The first click on a lock: the next slot asks to be bought.
    const [ confirmBuy, setConfirmBuy ] = useState(false);
    // A buy is on its way to the server - no second one until it answers.
    const [ buying, setBuying ] = useState(false);
    const [ notice, setNotice ] = useState('');
    // Items that cannot be stored (police equipment), from the server with
    // the box: greyed out on the backpack side, neither clicked nor dragged.
    const [ unstorable, setUnstorable ] = useState<Set<string>>(new Set());
    const [ dragging, setDragging ] = useState<Dragging>(null);
    // The box slot an item from the box is held over - where a rearrange lands.
    const [ dropSlot, setDropSlot ] = useState(0);

    // The backpack, as everywhere else - login and every change.
    useMessageEvent<RpInventoryEvent>(RpInventoryEvent, event =>
    {
        const next = new Map<number, DepositBoxEntry>();

        for(const entry of event.getParser().items) next.set(entry.slot, { slot: entry.slot, item: entry.item, count: entry.count });

        setPack(next);
    });

    useMessageEvent<RpDepositBoxEvent>(RpDepositBoxEvent, event =>
    {
        const parser = event.getParser();

        setConfirmBuy(false);
        setBuying(false);

        if(!parser.open)
        {
            setIsOpen(false);
            setDragging(null);
            setNotice('');

            return;
        }

        const next = new Map<number, DepositBoxEntry>();

        for(const entry of parser.items) next.set(entry.slot, entry);

        setBox(next);
        setBoxOpenSlots(parser.openSlots);
        setSlotPrice(parser.slotPrice);
        setNotice(parser.notice);
        setUnstorable(new Set(parser.unstorable));
        setIsOpen(true);
    });

    // "Buy $350" gives up after a while, as Sell back does.
    useEffect(() =>
    {
        if(!confirmBuy) return;

        const timeout = setTimeout(() => setConfirmBuy(false), CONFIRM_MS);

        return () => clearTimeout(timeout);
    }, [ confirmBuy ]);

    const move = (side: Side, slot: number, all: boolean) =>
        SendMessageComposer(new RpDepositMoveComposer((side === 'pack') ? DepositDirection.Store : DepositDirection.Withdraw, slot, all));

    // Slots are bought in order, so whichever lock was clicked, it is the next
    // one that asks and the next one that opens.
    const canBuy = ((slotPrice > 0) && (boxOpenSlots < BOX_SLOTS.length));
    const buySlot = (boxOpenSlots + 1);

    const buy = () =>
    {
        if(!canBuy || buying) return;

        if(!confirmBuy)
        {
            setConfirmBuy(true);

            return;
        }

        setConfirmBuy(false);
        setBuying(true);
        SendMessageComposer(new RpDepositMoveComposer(DepositDirection.Buy, 0, false));
    }

    const onDragStart = (side: Side, slot: number) => (event: DragEvent<HTMLButtonElement>) =>
    {
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', `${ side }:${ slot }`);
        setDragging({ side, slot });
    }

    // A side is a drop target while something from the OTHER side is held.
    const zone = (side: Side) => ({
        onDragOver: (event: DragEvent<HTMLElement>) =>
        {
            if(dragging && (dragging.side !== side)) event.preventDefault();
        },
        onDrop: (event: DragEvent<HTMLElement>) =>
        {
            event.preventDefault();

            if(dragging && (dragging.side !== side)) move(dragging.side, dragging.slot, true);

            setDragging(null);
            setDropSlot(0);
        }
    });

    // Inside the box: an item held over another open slot moves there - into
    // an empty one, or swapping with what it holds.
    const canRearrangeTo = (slot: number) => (!!dragging && (dragging.side === 'box') && (dragging.slot !== slot) && (slot <= boxOpenSlots));

    const rearrange = (slot: number) => ({
        onDragOver: (event: DragEvent<HTMLButtonElement>) =>
        {
            if(!canRearrangeTo(slot)) return;

            event.preventDefault();
            if(dropSlot !== slot) setDropSlot(slot);
        },
        onDragLeave: () => (dropSlot === slot) && setDropSlot(0),
        onDrop: (event: DragEvent<HTMLButtonElement>) =>
        {
            if(!canRearrangeTo(slot)) return;

            event.preventDefault();
            event.stopPropagation();
            SendMessageComposer(new RpDepositMoveComposer(DepositDirection.Rearrange, dragging.slot, true, slot));
            setDragging(null);
            setDropSlot(0);
        }
    });

    const slotView = (side: Side, slot: number, entry: DepositBoxEntry, locked: boolean) =>
    {
        const meta = (entry ? ResolveRpItem(entry.item) : null);
        const name = (entry ? (meta?.name ?? entry.item) : '');
        // Police equipment in the backpack: shown, greyed out, and going nowhere.
        const blocked = ((side === 'pack') && !!entry && unstorable.has(entry.item));
        const movable = (!!entry && !blocked);
        // A box lock that can be bought, and the slot asking to be.
        const buyable = ((side === 'box') && locked && canBuy);
        const asking = ((side === 'box') && confirmBuy && (slot === buySlot));
        const label = (asking
            ? `Click again to buy this slot for ${ Money(slotPrice) }`
            : entry
                ? `${ name }${ (entry.count > 1) ? ` ×${ entry.count }` : '' }${ blocked ? '' : ` - click to ${ (side === 'pack') ? 'store' : 'take out' } one, drag to ${ (side === 'pack') ? 'store' : 'take out' } all` }`
                : (buyable ? `Locked - click to buy another slot for ${ Money(slotPrice) }` : locked ? ((side === 'pack') ? 'Locked - VIP' : 'Locked') : 'Empty slot'));
        const lifted = (!!dragging && (dragging.side === side) && (dragging.slot === slot));
        const target = ((side === 'box') && (dropSlot === slot));

        return (
            <button key={ slot } type="button" title={ (entry || locked || asking) ? label : undefined } aria-label={ label } aria-disabled={ !movable && !buyable && !asking }
                className={ `deposit-slot${ entry ? ' has-item' : '' }${ blocked ? ' is-blocked' : '' }${ locked ? ' is-locked' : '' }${ buyable ? ' is-buyable' : '' }${ asking ? ' is-asking' : '' }${ lifted ? ' is-lifted' : '' }${ target ? ' is-drop-target' : '' }` }
                draggable={ movable } onDragStart={ movable ? onDragStart(side, slot) : undefined } onDragEnd={ () =>
                {
                    setDragging(null); setDropSlot(0);
                } }
                { ...((side === 'box') ? rearrange(slot) : {}) }
                onClick={ () =>
                {
                    if(asking || buyable) buy();
                    else if(movable) move(side, slot, false);
                } }>
                { entry && <div className={ `deposit-item rp-inventory-item ${ meta?.cls ?? '' }` } style={ meta?.iconUrl ? { backgroundImage: `url(${ meta.iconUrl })` } : undefined } /> }
                { (entry && (entry.count > 1)) && <span className="deposit-count">{ entry.count }</span> }
                { (locked && !asking) && <Lock /> }
                { asking && <span className="deposit-buy"><b>Buy</b>{ Money(slotPrice) }</span> }
            </button>
        );
    }

    if(!isOpen) return null;

    const packOpen = (HasHabboVip() ? CARRY_SLOTS.length : CARRY_OPEN);
    const packUsed = CARRY_SLOTS.filter(slot => pack.has(slot)).length;
    const boxUsed = box.size;
    const packZone = (!!dragging && (dragging.side === 'box'));
    const boxZone = (!!dragging && (dragging.side === 'pack'));

    return (
        <NitroCardView uniqueKey="deposit-box" className="nitro-deposit-box" theme="primary-slim" windowPosition={ DraggableWindowPosition.CENTER }>
            <NitroCardHeaderView headerText="Deposit Box" onCloseClick={ () => setIsOpen(false) } />
            <NitroCardContentView className="deposit-body" overflow="hidden">
                <div className="deposit-sides">
                    <section aria-label="Backpack" className={ `deposit-pack${ packZone ? ' is-drop-zone' : '' }` } { ...zone('pack') }>
                        <div className="deposit-side-head">
                            <span className="deposit-label">Backpack</span>
                            <span className="deposit-count-label">{ packUsed }/{ packOpen }</span>
                        </div>
                        <div className="deposit-grid deposit-grid--pack">
                            { CARRY_SLOTS.map(slot => slotView('pack', slot, pack.get(slot) ?? null, ((slot > packOpen) && !pack.has(slot)))) }
                        </div>
                    </section>
                    <div className="deposit-arrows" aria-hidden="true">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14" /><path d="M13 6l6 6-6 6" /></svg>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5" /><path d="M11 6l-6 6 6 6" /></svg>
                    </div>
                    <section aria-label="Deposit box" className={ `deposit-box${ boxZone ? ' is-drop-zone' : '' }` } { ...zone('box') }>
                        <div className="deposit-side-head">
                            <span className="deposit-count-label deposit-count-label--box">{ boxUsed }/{ boxOpenSlots }</span>
                        </div>
                        <div className="deposit-grid deposit-grid--box">
                            { BOX_SLOTS.map(slot => slotView('box', slot, box.get(slot) ?? null, ((slot > boxOpenSlots) && !box.has(slot)))) }
                        </div>
                        { canBuy && <span className="deposit-box-hint">Click a lock to buy another slot for { Money(slotPrice) }.</span> }
                    </section>
                </div>
                { notice && <div className="deposit-notice" role="status">{ notice }</div> }
            </NitroCardContentView>
        </NitroCardView>
    );
}
