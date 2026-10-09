import { RpInventoryEvent } from '@nitrots/nitro-renderer';
import { DragEvent, FC, useState } from 'react';
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

const CARRY_SLOTS = [ 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12 ];
// Ten carry slots open to everybody, all twelve while VIP - the backpack's own
// rule (RpInventoryView), read the same way.
const CARRY_OPEN = 10;
const BOX_SLOTS = Array.from({ length: 20 }, (_, index) => (index + 1));

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
    const [ boxOpenSlots, setBoxOpenSlots ] = useState(16);
    const [ notice, setNotice ] = useState('');
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
        setNotice(parser.notice);
        setIsOpen(true);
    });

    const move = (side: Side, slot: number, all: boolean) =>
        SendMessageComposer(new RpDepositMoveComposer((side === 'pack') ? DepositDirection.Store : DepositDirection.Withdraw, slot, all));

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
        const label = (entry
            ? `${ name }${ (entry.count > 1) ? ` ×${ entry.count }` : '' } - click to ${ (side === 'pack') ? 'store' : 'take out' } one, drag to ${ (side === 'pack') ? 'store' : 'take out' } all`
            : (locked ? 'Locked - VIP' : 'Empty slot'));
        const lifted = (!!dragging && (dragging.side === side) && (dragging.slot === slot));
        const target = ((side === 'box') && (dropSlot === slot));

        return (
            <button key={ slot } type="button" title={ label } aria-label={ label } aria-disabled={ !entry }
                className={ `deposit-slot${ entry ? ' has-item' : '' }${ locked ? ' is-locked' : '' }${ lifted ? ' is-lifted' : '' }${ target ? ' is-drop-target' : '' }` }
                draggable={ !!entry } onDragStart={ entry ? onDragStart(side, slot) : undefined } onDragEnd={ () => 
                {
                    setDragging(null); setDropSlot(0); 
                } }
                { ...((side === 'box') ? rearrange(slot) : {}) }
                onClick={ () => entry && move(side, slot, false) }>
                { entry && <div className={ `deposit-item rp-inventory-item ${ meta?.cls ?? '' }` } style={ meta?.iconUrl ? { backgroundImage: `url(${ meta.iconUrl })` } : undefined } /> }
                { (entry && (entry.count > 1)) && <span className="deposit-count">{ entry.count }</span> }
                { locked && <Lock /> }
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
                            <span className="deposit-label deposit-label--box">
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 018 0v3" /><path d="M12 14v3" /></svg>
                                Deposit box
                            </span>
                            <span className="deposit-count-label deposit-count-label--box">{ boxUsed }/{ boxOpenSlots }</span>
                        </div>
                        <div className="deposit-grid deposit-grid--box">
                            { BOX_SLOTS.map(slot => slotView('box', slot, box.get(slot) ?? null, ((slot > boxOpenSlots) && !box.has(slot)))) }
                        </div>
                        { (boxOpenSlots < BOX_SLOTS.length) && <span className="deposit-box-hint">The last row opens with VIP.</span> }
                    </section>
                </div>
                { notice && <div className="deposit-notice" role="status">{ notice }</div> }
                <div className="deposit-help">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 21h18" /><path d="M4 21V10l8-6 8 6v11" /><path d="M9 21v-6h6v6" /></svg>
                    <span><b>Click</b> to move one. <b>Drag</b> across to move the whole stack, or within the box to rearrange it. What you store stays here until you come back to the bank for it.</span>
                </div>
            </NitroCardContentView>
        </NitroCardView>
    );
}
