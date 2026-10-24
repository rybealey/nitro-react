import { RpInventoryEvent } from '@nitrots/nitro-renderer';
import { DragEvent, FC, useEffect, useState } from 'react';
import { HasHabboVip, SendMessageComposer } from '../../api';
import { DurabilityPercent, ResolveRpItem } from '../../api/rp-inventory/RpItems';
import { RpTradeActionComposer, RpTradeEvent, TradeAction, TradeOfferEntry, TradeState, TradeWorn } from '../../api/rp-trade/RpTradeMessages';
import { DraggableWindowPosition, NitroCardContentView, NitroCardHeaderView, NitroCardView } from '../../common';
import { useMessageEvent } from '../../hooks';

// PixelRP backpack trading (design: the "Trade window" canvas, A - Twist,
// 2026-10-17). Emulator: RpTrades. Opened when a trade request is accepted on
// the offer card.
//
// The two offers side by side, each under a strip that says how that side
// stands (grey Not ready, green Ready or Confirmed), and your backpack as one
// row beneath them. Click an item to offer one, drag it up to offer the stack,
// click an offered item to take one back. Any change un-readies both sides;
// both Ready, then - after a three-second count on the button - both Confirm,
// and the server swaps the items in one go. The server answers every press
// with the whole trade, so this only ever shows it. The window goes the moment
// the trade ends, either way - the room bubble says a trade went through, and
// a cancel is whispered to whoever did not cancel it.

const CARRY_SLOTS = [ 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12 ];
// The backpack's own rule (RpInventoryView): ten open, twelve with VIP.
const CARRY_OPEN = 10;
const WEAPON_SLOT = 101;
const OFFER_SLOTS = 10;
const STACK = 10;
// Weapons and body armour: one to a slot, never a stack (the emulator's RpDurability.NeverStacks).
const WEAPONS = [ 'knife', 'baseball_bat', 'axe', 'stun_gun', 'body_armor' ];
// PoliceUtility.PoliceGear - never tradeable (the server refuses it anyway).
const POLICE_GEAR = [ 'handcuffs', 'stun_gun', 'flashbang', 'pepper_spray', 'cop_medkit' ];
// RpTrades.ConfirmDelaySeconds: Confirm waits this long once both are Ready.
// Counted from when this window saw it, which is never before the server did.
const CONFIRM_DELAY_SECONDS = 3;

interface PackEntry
{
    slot: number;
    item: string;
    count: number;
    wear: number;
    maxWear: number;
}

// An offer shown as slots: stacks of ten, weapons one each - each weapon and
// suit of armour with the wear of the one the swap will hand over.
const toCells = (offer: TradeOfferEntry[], worn: TradeWorn[]) =>
{
    const cells: TradeOfferEntry[] = [];
    const queue = [ ...worn ];

    for(const entry of offer)
    {
        let left = entry.count;
        const size = WEAPONS.includes(entry.item) ? 1 : STACK;

        while(left > 0)
        {
            const index = queue.findIndex(candidate => (candidate.item === entry.item));
            const wear = ((index >= 0) ? queue.splice(index, 1)[0] : null);

            cells.push({ item: entry.item, count: Math.min(size, left), wear: (wear?.wear ?? 0), maxWear: (wear?.maxWear ?? 0) });
            left -= size;
        }
    }

    return cells;
}

// The backpack's durability bar (the emulator's RpDurability); hovering says
// the percentage, as in the backpack (durability()).
const WearBar: FC<{ wear: number, maxWear: number }> = ({ wear, maxWear }) =>
    <span className="trade-wear" aria-hidden="true"><span className="trade-wear-fill" style={ { width: `${ Math.max(0, Math.min(1, ((maxWear - wear) / maxWear))) * 100 }%` } } /></span>;

const Lock: FC<{}> = () =>
    <svg className="trade-lock" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 018 0v3" /></svg>;

const ItemArt: FC<{ item: string }> = ({ item }) =>
{
    const meta = ResolveRpItem(item);

    return <div className={ `trade-item rp-inventory-item ${ meta?.cls ?? '' }` } style={ meta?.iconUrl ? { backgroundImage: `url(${ meta.iconUrl })` } : undefined } />;
}

const itemName = (item: string, count: number) => `${ ResolveRpItem(item)?.name ?? item }${ (count > 1) ? ` ×${ count }` : '' }`;

// " · Durability 79%" for a weapon or suit of armour, as the backpack's hover says it.
const durability = (wear: number, maxWear: number) => ((maxWear > 0) ? ` · Durability ${ DurabilityPercent(wear, maxWear) }%` : '');

const Tick: FC<{}> = () =>
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>;

const Chevron: FC<{}> = () =>
    <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 5l7 7-7 7" /></svg>;

// How a side stands, for its strip.
const sideClass = (side: { ready: boolean, confirmed: boolean }) => (side.confirmed ? 'is-confirmed' : (side.ready ? 'is-ready' : 'is-waiting'));

const SideState: FC<{ side: { ready: boolean, confirmed: boolean } }> = ({ side }) =>
    <span className="trade-offer-state">
        { (side.ready || side.confirmed) && <Tick /> }
        { side.confirmed ? 'Confirmed' : (side.ready ? 'Ready' : 'Not ready') }
    </span>;

export const TradeView: FC<{}> = props =>
{
    const [ pack, setPack ] = useState<PackEntry[]>([]);
    const [ trade, setTrade ] = useState<TradeState>(null);
    const [ notice, setNotice ] = useState('');
    const [ dragging, setDragging ] = useState(0);
    // When this window last saw both sides Ready (0: they are not), for the
    // Confirm countdown, and a re-render each beat while it runs.
    const [ bothReadyAt, setBothReadyAt ] = useState(0);
    const [ , setBeat ] = useState(0);
    const bothReadyNow = (!!trade && trade.mine.ready && trade.theirs.ready);

    useEffect(() =>
    {
        setBothReadyAt(bothReadyNow ? Date.now() : 0);
    }, [ bothReadyNow ]);

    useEffect(() =>
    {
        if(!bothReadyAt) return;

        const interval = setInterval(() =>
        {
            setBeat(prev => (prev + 1));

            if((Date.now() - bothReadyAt) >= (CONFIRM_DELAY_SECONDS * 1000)) clearInterval(interval);
        }, 200);

        return () => clearInterval(interval);
    }, [ bothReadyAt ]);

    useMessageEvent<RpInventoryEvent>(RpInventoryEvent, event =>
    {
        setPack(event.getParser().items.map(entry => ({ slot: entry.slot, item: entry.item, count: entry.count, wear: (entry.wear ?? 0), maxWear: (entry.maxWear ?? 0) })));
    });

    useMessageEvent<RpTradeEvent>(RpTradeEvent, event =>
    {
        const parser = event.getParser();

        if(!parser.open)
        {
            setTrade(null);
            setDragging(0);
            setNotice('');

            return;
        }

        setTrade(parser.state);
        setNotice(parser.notice);
    });

    if(!trade) return null;

    const send = (action: number, slot: number = 0, all: boolean = false, item: string = '') =>
        SendMessageComposer(new RpTradeActionComposer(action, slot, all, item));

    const partner = trade.partnerName;

    const header = <NitroCardHeaderView headerText={ `Trading with ${ partner }` } onCloseClick={ () =>
    {
        send(TradeAction.Cancel);
        setTrade(null);
    } } />;
    const packOpen = (HasHabboVip() ? CARRY_SLOTS.length : CARRY_OPEN);

    // What is still in the backpack once your offer is taken out of it - from
    // the highest slots first, as the server will take it.
    const remaining = new Map<number, PackEntry>();
    const offered = new Map<string, number>(trade.mine.offer.map(entry => [ entry.item, entry.count ]));

    for(const entry of [ ...pack ].filter(row => (row.slot >= 1) && (row.slot <= CARRY_SLOTS.length)).sort((a, b) => (b.slot - a.slot)))
    {
        const take = Math.min(entry.count, (offered.get(entry.item) ?? 0));

        offered.set(entry.item, (offered.get(entry.item) ?? 0) - take);

        if(entry.count - take > 0) remaining.set(entry.slot, { ...entry, count: (entry.count - take) });
    }

    const equipped = pack.find(row => (row.slot === WEAPON_SLOT)) ?? null;
    const mineCells = toCells(trade.mine.offer, trade.mine.worn);
    const theirCells = toCells(trade.theirs.offer, trade.theirs.worn);
    const bothReady = (trade.mine.ready && trade.theirs.ready);
    const nothing = (!trade.mine.offer.length && !trade.theirs.offer.length);
    const fits = (trade.mineFits && trade.theirsFits);

    let primaryLabel = 'Ready';
    let primaryClass = 'is-ready';
    let primaryAction: number = TradeAction.Ready;
    let primaryDisabled = (nothing || !fits);

    // Seconds still to wait before Confirm counts; the whole wait until the
    // effect has stamped the moment, so the button is never live early.
    const confirmLeft = (bothReady
        ? (bothReadyAt ? Math.max(0, Math.ceil(((bothReadyAt + (CONFIRM_DELAY_SECONDS * 1000)) - Date.now()) / 1000)) : CONFIRM_DELAY_SECONDS)
        : 0);

    if(bothReady && !trade.mine.confirmed)
    {
        primaryLabel = (confirmLeft > 0) ? `Confirm trade in ${ confirmLeft }…` : 'Confirm trade';
        primaryClass = 'is-confirm';
        primaryAction = TradeAction.Confirm;
        primaryDisabled = (confirmLeft > 0);
    }
    else if(trade.mine.confirmed)
    {
        primaryLabel = `Waiting for ${ partner } to confirm…`;
        primaryClass = 'is-waiting';
        primaryDisabled = true;
    }
    else if(trade.mine.ready)
    {
        primaryLabel = `Waiting for ${ partner }…`;
        primaryClass = 'is-waiting';
        primaryDisabled = true;
    }

    const step = (active: boolean, done: boolean) => (done ? 'is-done' : (active ? 'is-active' : ''));
    const complete = trade.mine.confirmed && trade.theirs.confirmed;

    const onDragStart = (slot: number) => (event: DragEvent<HTMLButtonElement>) =>
    {
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', String(slot));
        setDragging(slot);
    }

    const dropZone = {
        onDragOver: (event: DragEvent<HTMLElement>) => dragging && event.preventDefault(),
        onDrop: (event: DragEvent<HTMLElement>) =>
        {
            event.preventDefault();

            if(dragging) send(TradeAction.Offer, dragging, true);

            setDragging(0);
        }
    };

    const offerGrid = (cells: TradeOfferEntry[], own: boolean) =>
        <div className="trade-offer-grid">
            { Array.from({ length: OFFER_SLOTS }, (_, index) =>
            {
                const cell = cells[index];

                if(!cell) return <div key={ index } className="trade-offer-slot is-empty" />;

                const worn = (cell.maxWear > 0);
                const label = `${ itemName(cell.item, cell.count) }${ durability(cell.wear, cell.maxWear) }${ own ? ' - click to take one back' : '' }`;

                return own
                    ? <button key={ index } type="button" className={ `trade-offer-slot has-item${ worn ? ' has-wear' : '' }` } title={ label } aria-label={ label } onClick={ () => send(TradeAction.TakeBack, 0, false, cell.item) }>
                        <ItemArt item={ cell.item } />
                        { (cell.count > 1) && <span className="trade-count">{ cell.count }</span> }
                        { worn && <WearBar wear={ cell.wear } maxWear={ cell.maxWear } /> }
                    </button>
                    : <div key={ index } className={ `trade-offer-slot has-item${ worn ? ' has-wear' : '' }` } title={ label }>
                        <ItemArt item={ cell.item } />
                        { (cell.count > 1) && <span className="trade-count">{ cell.count }</span> }
                        { worn && <WearBar wear={ cell.wear } maxWear={ cell.maxWear } /> }
                    </div>;
            }) }
        </div>;

    return (
        <NitroCardView uniqueKey="rp-trade" className="nitro-trade" theme="primary-slim" windowPosition={ DraggableWindowPosition.CENTER }>
            { header }
            <NitroCardContentView className="trade-body" overflow="hidden">
                <div className="trade-sides">
                    <section className={ `trade-offer ${ sideClass(trade.mine) }${ dragging ? ' is-drop-zone' : '' }` } aria-label="You are offering" { ...dropZone }>
                        <div className="trade-offer-strip">
                            <span className="trade-offer-title">You are offering</span>
                            <SideState side={ trade.mine } />
                        </div>
                        { offerGrid(mineCells, true) }
                        <span className={ `trade-hint${ trade.mineFits ? '' : ' is-warning' }` }>
                            { trade.mineFits ? `${ mineCells.length } of ${ OFFER_SLOTS } slots${ mineCells.length ? ' · click on the item to take it back' : '' }` : `${ partner }'s backpack cannot hold all of that - take some back.` }
                        </span>
                    </section>
                    <div className="trade-swap" aria-hidden="true">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M4 8h14l-4-4" /><path d="M20 16H6l4 4" /></svg>
                    </div>
                    <section className={ `trade-offer ${ sideClass(trade.theirs) }` } aria-label={ `${ partner } is offering` }>
                        <div className="trade-offer-strip">
                            <span className="trade-offer-title">{ partner } is offering</span>
                            <SideState side={ trade.theirs } />
                        </div>
                        { offerGrid(theirCells, false) }
                        <span className={ `trade-hint${ trade.theirsFits ? '' : ' is-warning' }` }>
                            { trade.theirsFits ? `${ theirCells.length } of ${ OFFER_SLOTS } slots` : 'Your backpack cannot hold all of that.' }
                        </span>
                    </section>
                </div>
                <section className="trade-pack" aria-label="Your backpack">
                    <div className="trade-pack-head">
                        <b>Your backpack</b>
                        <span className="trade-count-label">{ CARRY_SLOTS.filter(slot => remaining.has(slot)).length }/{ packOpen }</span>
                        { equipped &&
                            <span className="trade-equipped" title={ `${ itemName(equipped.item, 1) } - equipped. Put it away to trade it.` }>
                                <span className="trade-equipped-art"><ItemArt item={ equipped.item } /></span>
                                { itemName(equipped.item, 1) } equipped - put it away to trade it
                            </span> }
                    </div>
                    <div className="trade-pack-grid">
                        { CARRY_SLOTS.map(slot =>
                        {
                            const entry = remaining.get(slot) ?? null;
                            const locked = ((slot > packOpen) && !entry);
                            const gear = (!!entry && POLICE_GEAR.includes(entry.item));
                            const label = (entry
                                ? (gear ? `${ itemName(entry.item, entry.count) } - police equipment, cannot be traded` : `${ itemName(entry.item, entry.count) }${ durability(entry.wear, entry.maxWear) } - click to offer one, drag to offer all`)
                                : (locked ? 'Locked - VIP' : 'Empty slot'));

                            return (
                                <button key={ slot } type="button" title={ label } aria-label={ label } aria-disabled={ !entry || gear }
                                    className={ `trade-slot${ entry ? ' has-item' : '' }${ (entry?.maxWear > 0) ? ' has-wear' : '' }${ gear ? ' is-gear' : '' }${ locked ? ' is-locked' : '' }${ (dragging === slot) ? ' is-lifted' : '' }` }
                                    draggable={ !!entry && !gear } onDragStart={ (entry && !gear) ? onDragStart(slot) : undefined } onDragEnd={ () => setDragging(0) }
                                    onClick={ () => entry && !gear && send(TradeAction.Offer, slot, false) }>
                                    { entry && <ItemArt item={ entry.item } /> }
                                    { (entry && (entry.count > 1)) && <span className="trade-count">{ entry.count }</span> }
                                    { (entry?.maxWear > 0) && <WearBar wear={ entry.wear } maxWear={ entry.maxWear } /> }
                                    { gear && <span className="trade-gear"><Lock /></span> }
                                    { locked && <Lock /> }
                                </button>
                            );
                        }) }
                    </div>
                </section>
                { notice && <div className="trade-notice" role="status">{ notice }</div> }
                <div className="trade-actions">
                    <button type="button" className="trade-button is-plain trade-cancel" onClick={ () => send(TradeAction.Cancel) }>Cancel</button>
                    <div className="trade-steps">
                        <span className={ step(!bothReady, bothReady) }>1 Offer</span>
                        <Chevron />
                        <span className={ step((trade.mine.ready || trade.theirs.ready) && !bothReady, bothReady) }>2 Ready</span>
                        <Chevron />
                        <span className={ step(bothReady, complete) }>3 Confirm</span>
                    </div>
                    <button type="button" className={ `trade-button trade-primary ${ primaryClass }` } disabled={ primaryDisabled } onClick={ () => send(primaryAction) }>{ primaryLabel }</button>
                </div>
            </NitroCardContentView>
        </NitroCardView>
    );
}
