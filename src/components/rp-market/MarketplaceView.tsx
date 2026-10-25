import { ILinkEventTracker, RpInventoryEvent } from '@nitrots/nitro-renderer';
import { FC, useEffect, useMemo, useState } from 'react';
import { AddEventLinkTracker, HasHabboVip, RemoveLinkEventTracker } from '../../api';
import { DurabilityPercent, ResolveRpItem } from '../../api/rp-inventory/RpItems';
import { MarketAction, MarketListing, MarketOwnListing, RpMarketEvent, SendRpMarketAction } from '../../api/rp-market/RpMarketMessages';
import { LayoutCurrencyIcon, NitroCardContentView, NitroCardHeaderView, NitroCardView } from '../../common';
import { useMessageEvent, usePurse } from '../../hooks';

// PixelRP Marketplace (:mp; the "Marketplace" canvas, board A - Twist,
// 2026-10-25). Players sell backpack items to each other: Browse everybody
// else's listings by category, search and sort, and buy one at a time with
// the cash in hand; Sell from the backpack at a price each; My listings shows
// what is up and what sold, and takes back what has not.
//
// SERVER-OPENED by :mp or by stepping onto a Marketplace point (which closes
// it again with "marketplace/hide" on the step off), and every action is
// answered with the whole market again (emulator RpMarket), so this only ever
// shows it. Anonymous on
// purpose: no listing names its seller, and nothing you sold names its buyer.
// No fee - a sale's whole price goes into the seller's bank account.

type Tab = 'browse' | 'sell' | 'mine';

interface MarketState
{
    canSell: boolean;
    maxListings: number;
    maxPrice: number;
    browse: MarketListing[];
    mine: MarketOwnListing[];
    unsellable: Set<string>;
    now: number;
}

interface PackEntry
{
    slot: number;
    item: string;
    count: number;
    wear: number;
    maxWear: number;
}

const CATEGORIES: { id: string, label: string }[] = [
    { id: 'all', label: 'All items' },
    { id: 'weapons', label: 'Weapons' },
    { id: 'armour', label: 'Armour' },
    { id: 'food', label: 'Food & drink' },
    { id: 'medical', label: 'Medical' },
    { id: 'tokens', label: 'Tokens' },
    { id: 'clothing', label: 'Clothing' },
    { id: 'other', label: 'Other' }
];

const CATEGORY_OF: Record<string, string> = {
    knife: 'weapons', baseball_bat: 'weapons', axe: 'weapons', stun_gun: 'weapons',
    body_armor: 'armour',
    smoothie: 'food', snack: 'food',
    medkit: 'medical', cop_medkit: 'medical',
    vip_token_31: 'tokens', vip_token_14: 'tokens', spit_token: 'tokens'
};

const CategoryOf = (item: string) => (item.startsWith('clothing:') ? 'clothing' : (CATEGORY_OF[item] ?? 'other'));

const SORTS: { id: string, label: string }[] = [
    { id: 'new', label: 'Newest' },
    { id: 'low', label: 'Lowest price' },
    { id: 'high', label: 'Highest price' },
    { id: 'name', label: 'Name A-Z' }
];

// Ten carry slots open to everybody, all twelve while VIP - the backpack's own rule.
const CARRY_SLOTS = [ 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12 ];
const CARRY_OPEN = 10;

const ItemName = (item: string) => (ResolveRpItem(item)?.name ?? item);

const Money = (value: number) => Math.max(0, value || 0).toLocaleString('en-US');

const ItemArt: FC<{ item: string, className?: string }> = ({ item, className = '' }) =>
{
    const meta = ResolveRpItem(item);

    return <div className={ `rp-inventory-item ${ meta?.cls ?? '' } ${ className }` } style={ meta?.iconUrl ? { backgroundImage: `url(${ meta.iconUrl })` } : undefined } />;
}

// Green from 70%, amber from 40%, red below - the condition badge and line.
const ConditionClass = (percent: number) => ((percent >= 70) ? 'is-good' : ((percent >= 40) ? 'is-worn' : 'is-poor'));

// "today", "yesterday" or "3 days ago", from the server's clock.
const Ago = (now: number, then: number) =>
{
    const days = Math.max(0, Math.floor((now - then) / 86400));

    if(days === 0) return 'today';

    return (days === 1) ? 'yesterday' : `${ days } days ago`;
}

const Chevron: FC<{ open: boolean }> = ({ open }) =>
    <svg className={ `mk-chevron${ open ? ' is-open' : '' }` } width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M2 3.5 L5 6.5 L8 3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>;

const Tick: FC<{}> = () =>
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 6.2 L5 8.5 L9.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>;

export const MarketplaceView: FC<{}> = props =>
{
    const [ isOpen, setIsOpen ] = useState(false);
    const [ market, setMarket ] = useState<MarketState>(null);
    const [ notice, setNotice ] = useState('');
    const [ tab, setTab ] = useState<Tab>('browse');
    const [ category, setCategory ] = useState('all');
    const [ search, setSearch ] = useState('');
    const [ sort, setSort ] = useState('new');
    const [ sortOpen, setSortOpen ] = useState(false);
    const [ pack, setPack ] = useState<PackEntry[]>([]);
    const [ picked, setPicked ] = useState(0);
    const [ quantity, setQuantity ] = useState(1);
    const [ price, setPrice ] = useState('');
    // An action is on its way: Buy, List and Take back wait for the answer, so
    // one click is one action however fast it is pressed again.
    const [ busy, setBusy ] = useState(false);
    const { getCurrencyAmount } = usePurse();

    // The backpack, as everywhere else - login and every change.
    useMessageEvent<RpInventoryEvent>(RpInventoryEvent, event =>
    {
        setPack(event.getParser().items.map(entry => ({ slot: entry.slot, item: entry.item, count: entry.count, wear: (entry.wear ?? 0), maxWear: (entry.maxWear ?? 0) })));
    });

    useMessageEvent<RpMarketEvent>(RpMarketEvent, event =>
    {
        const parser = event.getParser();

        // Only :mp or a Marketplace point opens the window; a sale or a refresh lands only while it is up.
        if(!parser.open && !isOpen) return;

        setMarket({
            canSell: parser.canSell,
            maxListings: parser.maxListings,
            maxPrice: parser.maxPrice,
            browse: parser.browse,
            mine: parser.mine,
            unsellable: new Set(parser.unsellable),
            now: parser.now
        });
        setNotice(parser.notice);
        setBusy(false);

        if(parser.open)
        {
            setIsOpen(true);
            setTab('browse');
            setSortOpen(false);
        }
    });

    // Stepping off a Marketplace point closes the window (RpMarket.Close).
    useEffect(() =>
    {
        const linkTracker: ILinkEventTracker = {
            linkReceived: (url: string) =>
            {
                if(url.split('/')[1] !== 'hide') return;

                setIsOpen(false);
                setSortOpen(false);
            },
            eventUrlPrefix: 'marketplace/'
        };

        AddEventLinkTracker(linkTracker);

        return () => RemoveLinkEventTracker(linkTracker);
    }, []);

    // A notice says its piece and goes.
    useEffect(() =>
    {
        if(!notice) return;

        const timeout = setTimeout(() => setNotice(''), 5000);

        return () => clearTimeout(timeout);
    }, [ notice ]);

    // An answer that never comes (a dropped packet) must not lock the buttons for good.
    useEffect(() =>
    {
        if(!busy) return;

        const timeout = setTimeout(() => setBusy(false), 4000);

        return () => clearTimeout(timeout);
    }, [ busy ]);

    const packOpen = (HasHabboVip() ? CARRY_SLOTS.length : CARRY_OPEN);
    const pickedEntry = pack.find(entry => (entry.slot === picked) && (entry.slot >= 1) && (entry.slot <= CARRY_SLOTS.length)) ?? null;

    // The pick goes when what was in the slot does (listed, used or moved).
    useEffect(() =>
    {
        if(picked && !pickedEntry) setPicked(0);
    }, [ picked, pickedEntry ]);

    useEffect(() =>
    {
        if(pickedEntry && (quantity > pickedEntry.count)) setQuantity(pickedEntry.count);
    }, [ pickedEntry, quantity ]);

    const listings = useMemo(() =>
    {
        if(!market) return [];

        const query = search.trim().toLowerCase();
        const shown = market.browse.filter(entry => ((category === 'all') || (CategoryOf(entry.item) === category)) && (!query || ItemName(entry.item).toLowerCase().includes(query)));

        if(sort === 'low') shown.sort((a, b) => (a.price - b.price));
        else if(sort === 'high') shown.sort((a, b) => (b.price - a.price));
        else if(sort === 'name') shown.sort((a, b) => ItemName(a.item).localeCompare(ItemName(b.item)));
        else shown.sort((a, b) => (b.listedAt - a.listedAt) || (b.id - a.id));

        return shown;
    }, [ market, category, search, sort ]);

    if(!isOpen || !market) return null;

    const live = market.mine.filter(entry => !entry.endedAt);
    const cash = getCurrencyAmount(-1);

    const close = () =>
    {
        setIsOpen(false);
        setSortOpen(false);
    };

    // One action at a time, answered before the next.
    const act = (action: number, a: number = 0, b: number = 0, c: number = 0) =>
    {
        if(busy) return;

        setBusy(true);
        SendRpMarketAction(action, a, b, c);
    };

    const pickTab = (next: Tab) =>
    {
        setTab(next);
        setSortOpen(false);

        if(next !== 'sell') SendRpMarketAction(MarketAction.Refresh);
    };

    const pick = (entry: PackEntry) =>
    {
        setPicked(entry.slot);
        setQuantity(entry.count);
        setPrice('');
    };

    const typePrice = (value: string) =>
    {
        const digits = value.replace(/[^0-9]/g, '');

        setPrice(digits ? String(Math.min(market.maxPrice, parseInt(digits, 10))) : '');
    };

    const priceEach = (parseInt(price, 10) || 0);
    const full = (live.length >= market.maxListings);
    const canList = (market.canSell && !!pickedEntry && (priceEach > 0) && !full);

    const list = () =>
    {
        if(!canList || busy) return;

        act(MarketAction.List, pickedEntry.slot, quantity, priceEach);
        setPicked(0);
        setPrice('');
    };

    const browseView =
        <div className="mk-browse">
            <div className="mk-rail">
                <span className="mk-heading">CATEGORIES</span>
                { CATEGORIES.map(entry =>
                {
                    const count = market.browse.filter(listing => ((entry.id === 'all') || (CategoryOf(listing.item) === entry.id))).length;

                    return (
                        <button key={ entry.id } type="button" className={ `mk-category${ (category === entry.id) ? ' is-on' : '' }` } aria-pressed={ (category === entry.id) } onClick={ () => setCategory(entry.id) }>
                            <span>{ entry.label }</span>
                            <span className="mk-category-count">{ count }</span>
                        </button>
                    );
                }) }
            </div>
            <div className="mk-main">
                <div className="mk-toolbar">
                    <label className="mk-search">
                        <span className="visually-hidden">Search listings</span>
                        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><circle cx="6" cy="6" r="4.25" fill="none" stroke="currentColor" strokeWidth="1.5" /><path d="M9.2 9.2 L12.5 12.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
                        <input type="search" value={ search } placeholder="Search items..." spellCheck={ false } onChange={ event => setSearch(event.target.value) } />
                    </label>
                    <div className="mk-dropdown">
                        <button type="button" className={ `mk-dropdown-button${ sortOpen ? ' is-open' : '' }` } aria-haspopup="listbox" aria-expanded={ sortOpen } onClick={ () => setSortOpen(!sortOpen) }>
                            <span className="mk-dropdown-label">Sort:</span>
                            <span className="mk-dropdown-value">{ SORTS.find(entry => (entry.id === sort)).label }</span>
                            <Chevron open={ sortOpen } />
                        </button>
                        { sortOpen &&
                            <div className="mk-dropdown-menu" role="listbox" aria-label="Sort by">
                                { SORTS.map(entry =>
                                    <button key={ entry.id } type="button" role="option" aria-selected={ (sort === entry.id) } className={ `mk-option${ (sort === entry.id) ? ' is-on' : '' }` } onClick={ () =>
                                    {
                                        setSort(entry.id);
                                        setSortOpen(false);
                                    } }>
                                        <span>{ entry.label }</span>
                                        { (sort === entry.id) && <Tick /> }
                                    </button>) }
                            </div> }
                    </div>
                    <div className="mk-cash" title="Your cash in hand">
                        <span className="mk-cash-label">Cash</span>
                        <LayoutCurrencyIcon type={ -1 } />
                        <span className="mk-cash-value">{ Money(cash) }</span>
                    </div>
                </div>
                <div className="mk-grid-scroll">
                    { !listings.length && <div className="mk-empty">Nothing for sale here right now.</div> }
                    <div className="mk-grid">
                        { listings.map(entry =>
                        {
                            const condition = ((entry.maxWear > 0) ? DurabilityPercent(entry.wear, entry.maxWear) : 0);

                            return (
                                <div key={ entry.id } className="mk-card">
                                    <div className="mk-card-art">
                                        <ItemArt item={ entry.item } className="mk-art-small" />
                                        { (entry.left > 1) && <span className="mk-badge">×{ entry.left }</span> }
                                        { (entry.maxWear > 0) && <span className={ `mk-condition ${ ConditionClass(condition) }` } title="Condition">{ condition }%</span> }
                                    </div>
                                    <span className="mk-card-name" title={ ItemName(entry.item) }>{ ItemName(entry.item) }</span>
                                    <span className="mk-price">
                                        <LayoutCurrencyIcon type={ -1 } />
                                        <span className="mk-price-value">{ Money(entry.price) }</span>
                                        { (entry.left > 1) && <span className="mk-each">each</span> }
                                    </span>
                                    <button type="button" className="mk-buy" onClick={ () => act(MarketAction.Buy, entry.id) }>Buy</button>
                                </div>
                            );
                        }) }
                    </div>
                </div>
            </div>
        </div>;

    const pickedName = (pickedEntry ? ItemName(pickedEntry.item) : '');
    const pickedCondition = ((pickedEntry && (pickedEntry.maxWear > 0)) ? DurabilityPercent(pickedEntry.wear, pickedEntry.maxWear) : 0);

    const sellView =
        <div className="mk-sell">
            <div className="mk-panel mk-pack">
                <div className="mk-panel-head">
                    <span className="mk-panel-title">Your backpack</span>
                    <span className="mk-panel-sub">Pick an item to sell.</span>
                </div>
                <div className="mk-pack-grid">
                    { CARRY_SLOTS.slice(0, packOpen).map(slot =>
                    {
                        const entry = pack.find(row => (row.slot === slot)) ?? null;

                        if(!entry) return <div key={ slot } className="mk-slot is-empty" />;

                        const gear = market.unsellable.has(entry.item);
                        const label = gear ? `${ ItemName(entry.item) } - police equipment can't be sold` : `${ ItemName(entry.item) }${ (entry.count > 1) ? ` ×${ entry.count }` : '' }`;

                        return (
                            <button key={ slot } type="button" className={ `mk-slot${ (picked === slot) ? ' is-picked' : '' }${ gear ? ' is-locked' : '' }` } title={ label } aria-label={ label } aria-pressed={ (picked === slot) } disabled={ gear } onClick={ () => pick(entry) }>
                                <ItemArt item={ entry.item } />
                                { (entry.count > 1) && <span className="mk-slot-count">{ entry.count }</span> }
                            </button>
                        );
                    }) }
                </div>
                <span className="mk-panel-sub">{ 'Police gear can\'t be sold.' }</span>
            </div>
            <div className="mk-panel mk-form">
                { !market.canSell &&
                    <div className="mk-form-empty">Open a bank account at Mercury Bank to sell on the marketplace - that is where your money goes.</div> }
                { market.canSell && !pickedEntry &&
                    <div className="mk-form-empty">Pick an item from your backpack.</div> }
                { market.canSell && pickedEntry &&
                    <>
                        <div className="mk-form-item">
                            <div className="mk-form-art"><ItemArt item={ pickedEntry.item } /></div>
                            <div className="mk-form-name">
                                <span className="mk-form-title">{ pickedName }</span>
                                <span className="mk-panel-sub">
                                    { (pickedEntry.maxWear > 0) ? `${ pickedCondition }% condition` : `${ pickedEntry.count } in your backpack` }
                                </span>
                            </div>
                        </div>
                        <div className="mk-form-row">
                            <span className="mk-form-label">How many</span>
                            <div className="mk-stepper">
                                <button type="button" aria-label="One less" disabled={ (quantity <= 1) } onClick={ () => setQuantity(Math.max(1, (quantity - 1))) }>−</button>
                                <span className="mk-stepper-value" aria-live="polite">{ quantity }</span>
                                <button type="button" aria-label="One more" disabled={ (quantity >= pickedEntry.count) } onClick={ () => setQuantity(Math.min(pickedEntry.count, (quantity + 1))) }>+</button>
                                <span className="mk-panel-sub">of { pickedEntry.count }</span>
                            </div>
                        </div>
                        <div className="mk-form-row">
                            <label htmlFor="mk-price" className="mk-form-label">Price each</label>
                            <div className="mk-price-field">
                                <LayoutCurrencyIcon type={ -1 } />
                                <input id="mk-price" type="text" inputMode="numeric" value={ price } placeholder="0" maxLength={ 6 } spellCheck={ false } onChange={ event => typePrice(event.target.value) } onKeyDown={ event => ((event.key === 'Enter') && list()) } />
                            </div>
                        </div>
                        <div className="mk-summary">
                            <div className="mk-summary-row"><span className="mk-summary-dim">{ quantity } × ${ Money(priceEach) }</span><span>${ Money(quantity * priceEach) }</span></div>
                            <div className="mk-summary-row is-total"><span>You get when it sells</span><span>${ Money(quantity * priceEach) }</span></div>
                        </div>
                        <span className="mk-panel-sub">{ full
                            ? `You have ${ market.maxListings } listings up - the most at once. Take one back or wait for a sale.`
                            : `The most you can ask is $${ Money(market.maxPrice) } each. Your items leave your backpack while they're for sale - take them back any time from My listings.` }</span>
                    </> }
                <div className="mk-spacer" />
                <button type="button" className="mk-go" disabled={ !canList || busy } onClick={ list }>
                    { pickedEntry ? `List ${ pickedName }${ (quantity > 1) ? ` ×${ quantity }` : '' } for sale` : 'List for sale' }
                </button>
            </div>
        </div>;

    const mineView =
        <div className="mk-mine">
            <div className="mk-panel mk-table">
                <div className="mk-table-row is-head">
                    <span>ITEM</span><span>PRICE</span><span>STATUS</span><span />
                </div>
                <div className="mk-table-body">
                    { !market.mine.length && <div className="mk-empty">You have nothing for sale.</div> }
                    { market.mine.map(entry =>
                    {
                        const ended = (entry.endedAt > 0);
                        const sub = ended
                            ? `Sold ${ Ago(market.now, entry.endedAt) }${ (entry.listed > 1) ? ` · ${ entry.sold } of ${ entry.listed }` : '' }`
                            : ((entry.sold > 0) ? `${ entry.sold } sold · ${ entry.left } left` : `Listed ${ Ago(market.now, entry.listedAt) }${ (entry.left > 1) ? ` · ${ entry.left } for sale` : '' }`);

                        return (
                            <div key={ entry.id } className="mk-table-row">
                                <div className="mk-table-item">
                                    <div className="mk-table-art"><ItemArt item={ entry.item } /></div>
                                    <div className="mk-table-name">
                                        <span className="mk-card-name">{ ItemName(entry.item) }</span>
                                        <span className="mk-panel-sub">{ sub }</span>
                                    </div>
                                </div>
                                <span className="mk-price">
                                    <LayoutCurrencyIcon type={ -1 } />
                                    <span className="mk-price-value">{ Money(entry.price) }</span>
                                    { (entry.listed > 1) && <span className="mk-each">each</span> }
                                </span>
                                <span className={ `mk-status${ ended ? ' is-sold' : '' }` }>{ ended ? 'Sold' : 'For sale' }</span>
                                { ended
                                    ? <span className="mk-earned">+${ Money(entry.sold * entry.price) } to bank</span>
                                    : <button type="button" className="mk-take" onClick={ () => act(MarketAction.TakeBack, entry.id) }>Take back</button> }
                            </div>
                        );
                    }) }
                </div>
            </div>
            <div className="mk-panel mk-bank-note">
                <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M2 6.5 L8 3 L14 6.5 M3.5 7 V12 M6.5 7 V12 M9.5 7 V12 M12.5 7 V12 M2 13 H14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
                <span>When something sells, the money goes straight into your bank account.</span>
            </div>
        </div>;

    return (
        <NitroCardView className="nitro-marketplace" theme="primary-slim" uniqueKey="marketplace">
            <NitroCardHeaderView headerText="Marketplace" onCloseClick={ close } />
            <div className="mk-tabs" role="tablist">
                <button type="button" role="tab" aria-selected={ (tab === 'browse') } className={ `mk-tab${ (tab === 'browse') ? ' is-on' : '' }` } onClick={ () => pickTab('browse') }>Browse</button>
                <button type="button" role="tab" aria-selected={ (tab === 'sell') } className={ `mk-tab${ (tab === 'sell') ? ' is-on' : '' }` } onClick={ () => pickTab('sell') }>Sell</button>
                <button type="button" role="tab" aria-selected={ (tab === 'mine') } className={ `mk-tab${ (tab === 'mine') ? ' is-on' : '' }` } onClick={ () => pickTab('mine') }>
                    My listings{ (live.length > 0) && <span className="mk-tab-count">{ live.length }</span> }
                </button>
            </div>
            <NitroCardContentView overflow="hidden" classNames={ [ 'mk-body' ] }>
                { (tab === 'browse') && browseView }
                { (tab === 'sell') && sellView }
                { (tab === 'mine') && mineView }
                { !!notice && <div className="mk-notice" role="status">{ notice }</div> }
            </NitroCardContentView>
        </NitroCardView>
    );
}
