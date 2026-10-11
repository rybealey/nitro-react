import { RpInventoryEvent } from '@nitrots/nitro-renderer';
import { DragEvent, FC, useState } from 'react';
import { HasHabboVip, SendMessageComposer } from '../../api';
import { ResolveRpItem } from '../../api/rp-inventory/RpItems';
import { RpTradeActionComposer, RpTradeEvent, TradeAction, TradeOfferEntry, TradeState } from '../../api/rp-trade/RpTradeMessages';
import { DraggableWindowPosition, NitroCardContentView, NitroCardHeaderView, NitroCardView } from '../../common';
import { useMessageEvent } from '../../hooks';

// PixelRP backpack trading (design: the "Trade Backpack" canvas). Emulator:
// RpTrades. Opened when a trade request is accepted on the offer card.
//
// Your backpack on the left, the two offers beside it. Click an item to offer
// one, drag it across to offer the stack, click an offered item to take one
// back. Any change un-readies both sides; both Ready, then both Confirm, and
// the server swaps the items in one go. The server answers every press with
// the whole trade, so this only ever shows it. The window goes the moment the
// trade ends, either way - the room bubble says a trade went through, and a
// cancel is whispered to whoever did not cancel it.

const CARRY_SLOTS = [ 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12 ];
// The backpack's own rule (RpInventoryView): ten open, twelve with VIP.
const CARRY_OPEN = 10;
const WEAPON_SLOT = 101;
const OFFER_SLOTS = 10;
const STACK = 10;
const WEAPONS = [ 'knife', 'baseball_bat', 'axe', 'stun_gun' ];
// PoliceUtility.PoliceGear - never tradeable (the server refuses it anyway).
const POLICE_GEAR = [ 'handcuffs', 'stun_gun', 'flashbang', 'pepper_spray', 'cop_medkit' ];

interface PackEntry
{
    slot: number;
    item: string;
    count: number;
}

// An offer shown as slots: stacks of ten, weapons one each.
const toCells = (offer: TradeOfferEntry[]) =>
{
    const cells: TradeOfferEntry[] = [];

    for(const entry of offer)
    {
        let left = entry.count;
        const size = WEAPONS.includes(entry.item) ? 1 : STACK;

        while(left > 0)
        {
            cells.push({ item: entry.item, count: Math.min(size, left) });
            left -= size;
        }
    }

    return cells;
}

const Lock: FC<{}> = () =>
    <svg className="trade-lock" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 018 0v3" /></svg>;

const ItemArt: FC<{ item: string }> = ({ item }) =>
{
    const meta = ResolveRpItem(item);

    return <div className={ `trade-item rp-inventory-item ${ meta?.cls ?? '' }` } style={ meta?.iconUrl ? { backgroundImage: `url(${ meta.iconUrl })` } : undefined } />;
}

const itemName = (item: string, count: number) => `${ ResolveRpItem(item)?.name ?? item }${ (count > 1) ? ` ×${ count }` : '' }`;

export const TradeView: FC<{}> = props =>
{
    const [ pack, setPack ] = useState<PackEntry[]>([]);
    const [ trade, setTrade ] = useState<TradeState>(null);
    const [ notice, setNotice ] = useState('');
    const [ dragging, setDragging ] = useState(0);

    useMessageEvent<RpInventoryEvent>(RpInventoryEvent, event =>
    {
        setPack(event.getParser().items.map(entry => ({ slot: entry.slot, item: entry.item, count: entry.count })));
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

    const header = <NitroCardHeaderView headerText="Trade" onCloseClick={ () =>
    {
        send(TradeAction.Cancel);
        setTrade(null);
    } } />;

    const partner = trade.partnerName;
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
    const mineCells = toCells(trade.mine.offer);
    const theirCells = toCells(trade.theirs.offer);
    const bothReady = (trade.mine.ready && trade.theirs.ready);
    const nothing = (!trade.mine.offer.length && !trade.theirs.offer.length);
    const fits = (trade.mineFits && trade.theirsFits);

    let primaryLabel = 'Ready';
    let primaryClass = 'is-ready';
    let primaryAction: number = TradeAction.Ready;
    let primaryDisabled = (nothing || !fits);

    if(bothReady && !trade.mine.confirmed)
    {
        primaryLabel = 'Confirm trade';
        primaryClass = 'is-confirm';
        primaryAction = TradeAction.Confirm;
        primaryDisabled = false;
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

                const label = `${ itemName(cell.item, cell.count) }${ own ? ' - click to take one back' : '' }`;

                return own
                    ? <button key={ index } type="button" className="trade-offer-slot has-item" title={ label } aria-label={ label } onClick={ () => send(TradeAction.TakeBack, 0, false, cell.item) }>
                        <ItemArt item={ cell.item } />
                        { (cell.count > 1) && <span className="trade-count">{ cell.count }</span> }
                    </button>
                    : <div key={ index } className="trade-offer-slot has-item" title={ label }>
                        <ItemArt item={ cell.item } />
                        { (cell.count > 1) && <span className="trade-count">{ cell.count }</span> }
                    </div>;
            }) }
        </div>;

    return (
        <NitroCardView uniqueKey="rp-trade" className="nitro-trade" theme="primary-slim" windowPosition={ DraggableWindowPosition.CENTER }>
            { header }
            <NitroCardContentView className="trade-body" overflow="hidden">
                <div className="trade-strip">
                    <span>Trading with <b>{ partner }</b></span>
                    <div className="trade-steps">
                        <span className={ step(!bothReady, bothReady) }>1 Offer</span>
                        <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 5l7 7-7 7" /></svg>
                        <span className={ step((trade.mine.ready || trade.theirs.ready) && !bothReady, bothReady) }>2 Ready</span>
                        <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 5l7 7-7 7" /></svg>
                        <span className={ step(bothReady, complete) }>3 Confirm</span>
                    </div>
                </div>
                <div className="trade-sides">
                    <section className="trade-pack" aria-label="Your backpack">
                        <div className="trade-side-head">
                            <span className="trade-label">Backpack</span>
                            <span className="trade-count-label">{ CARRY_SLOTS.filter(slot => remaining.has(slot)).length }/{ packOpen }</span>
                        </div>
                        { equipped &&
                            <div className="trade-equipped" title={ `${ itemName(equipped.item, 1) } - equipped. Put it away to trade it.` }>
                                <div className="trade-equipped-art"><ItemArt item={ equipped.item } /></div>
                                <span><b>Equipped</b>Put away to trade</span>
                            </div> }
                        <div className="trade-pack-grid">
                            { CARRY_SLOTS.map(slot =>
                            {
                                const entry = remaining.get(slot) ?? null;
                                const locked = ((slot > packOpen) && !entry);
                                const gear = (!!entry && POLICE_GEAR.includes(entry.item));
                                const label = (entry
                                    ? (gear ? `${ itemName(entry.item, entry.count) } - police equipment, cannot be traded` : `${ itemName(entry.item, entry.count) } - click to offer one, drag to offer all`)
                                    : (locked ? 'Locked - VIP' : 'Empty slot'));

                                return (
                                    <button key={ slot } type="button" title={ label } aria-label={ label } aria-disabled={ !entry || gear }
                                        className={ `trade-slot${ entry ? ' has-item' : '' }${ gear ? ' is-gear' : '' }${ locked ? ' is-locked' : '' }${ (dragging === slot) ? ' is-lifted' : '' }` }
                                        draggable={ !!entry && !gear } onDragStart={ (entry && !gear) ? onDragStart(slot) : undefined } onDragEnd={ () => setDragging(0) }
                                        onClick={ () => entry && !gear && send(TradeAction.Offer, slot, false) }>
                                        { entry && <ItemArt item={ entry.item } /> }
                                        { (entry && (entry.count > 1)) && <span className="trade-count">{ entry.count }</span> }
                                        { gear && <span className="trade-gear"><Lock /></span> }
                                        { locked && <Lock /> }
                                    </button>
                                );
                            }) }
                        </div>
                    </section>
                    <section className={ `trade-offer${ trade.mine.ready ? ' is-ready' : '' }${ dragging ? ' is-drop-zone' : '' }` } aria-label="You are offering" { ...dropZone }>
                        <div className="trade-side-head">
                            <span className="trade-offer-title">You are offering</span>
                            <span className={ `trade-chip${ trade.mine.ready ? ' is-ready' : '' }` }>{ trade.mine.ready ? 'Ready' : 'Not ready' }</span>
                        </div>
                        { offerGrid(mineCells, true) }
                        <span className={ `trade-hint${ trade.mineFits ? '' : ' is-warning' }` }>
                            { trade.mineFits ? `${ mineCells.length } of ${ OFFER_SLOTS } slots` : `${ partner }'s backpack cannot hold all of that - take some back.` }
                        </span>
                    </section>
                    <section className={ `trade-offer${ trade.theirs.ready ? ' is-ready' : '' }` } aria-label={ `${ partner } is offering` }>
                        <div className="trade-side-head">
                            <span className="trade-offer-title">{ partner } is offering</span>
                            <span className={ `trade-chip${ trade.theirs.ready ? ' is-ready' : '' }` }>{ trade.theirs.ready ? 'Ready' : 'Not ready' }</span>
                        </div>
                        { offerGrid(theirCells, false) }
                        <span className={ `trade-hint${ trade.theirsFits ? '' : ' is-warning' }` }>
                            { trade.theirsFits ? `${ theirCells.length } of ${ OFFER_SLOTS } slots` : 'Your backpack cannot hold all of that.' }
                        </span>
                    </section>
                </div>
                { notice && <div className="trade-notice" role="status">{ notice }</div> }
                <div className="trade-actions">
                    <button type="button" className="trade-button is-plain trade-cancel" onClick={ () => send(TradeAction.Cancel) }>Cancel</button>
                    <button type="button" className={ `trade-button trade-primary ${ primaryClass }` } disabled={ primaryDisabled } onClick={ () => send(primaryAction) }>{ primaryLabel }</button>
                </div>
            </NitroCardContentView>
        </NitroCardView>
    );
}
