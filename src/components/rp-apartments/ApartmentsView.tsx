import { ILinkEventTracker } from '@nitrots/nitro-renderer';
import { FC, useEffect, useMemo, useState } from 'react';
import { AddEventLinkTracker, RemoveLinkEventTracker } from '../../api';
import { ApartmentAction, RpApartmentEvent, SendRpApartmentAction } from '../../api/rp-apartments/RpApartmentMessages';
import { TakeApartmentSnapshot } from '../../api/rp-apartments/TakeApartmentSnapshot';
import { LayoutCurrencyIcon, NitroCardContentView, NitroCardHeaderView, NitroCardView } from '../../common';
import { useMessageEvent, usePurse } from '../../hooks';
import { ApartmentFloorPlan, IsNextTo } from './ApartmentFloorPlan';

// PixelRP Apartments (the "Apartments" canvas, "Apartments · final design" -
// B's tabs over C's floor plan, Twist 2026-10-28). Any player can buy one
// apartment - a room of their own - for $5,000 cash, on the centre lot of the
// building's 5x5 grid. More lots sharing a side with theirs can be bought by
// clicking them on the floor plan - $2,500, then each $500 dearer - and the
// room grows by 8x8 tiles. Selling back returns half of everything paid, with
// the furni back in the inventory; List for sale puts it on the real estate
// board, furni included, for a $100 fee. No rent. One on every lot is a
// Penthouse, and the window calls it so.
//
// SERVER-OPENED by stepping onto an Apartments point (SF Apartments' action
// point), which closes it again with "apartments/hide" on the step off, and
// every action is answered with the window again (emulator RpApartments), so
// this only ever shows it.

type Tab = 'mine' | 'sell';

interface ApartmentState
{
    price: number;
    lotPriceBase: number;
    lotPriceStep: number;
    sellBackPercent: number;
    maxListPrice: number;
    listingFee: number;
    grid: number;
    lotSize: number;
    centreLot: number;
    building: string;
    owns: boolean;
    roomName: string;
    boughtAt: number;
    paid: number;
    listPrice: number;
    lots: number[];
}

// How long the red Sell back button waits for its second click.
const CONFIRM_MS = 5000;

const Money = (value: number) => `$${ Math.max(0, value || 0).toLocaleString('en-US') }`;

const Lock: FC<{}> = () =>
    <svg aria-hidden="true" width="8" height="10" viewBox="0 0 8 10" shapeRendering="crispEdges">
        <rect x="2" y="0" width="4" height="1" fill="currentColor" />
        <rect x="1" y="1" width="1" height="3" fill="currentColor" />
        <rect x="6" y="1" width="1" height="3" fill="currentColor" />
        <rect x="0" y="4" width="8" height="6" fill="currentColor" />
    </svg>;

// B's little room, drawn at twice its size to fill the panel.
const RoomPicture: FC<{}> = () =>
    <svg role="img" aria-label="Your apartment" width="192" height="144" viewBox="0 0 96 72" shapeRendering="crispEdges">
        <polygon points="8,46 48,26 48,4 8,24" fill="#e6e9ec" />
        <polygon points="48,26 88,46 88,24 48,4" fill="#c9ced4" />
        <polyline points="8,24 48,4 88,24" fill="none" stroke="#a9b3bd" strokeWidth="1" />
        <polygon points="18,41 26,37 26,23 18,27" fill="#a3abb5" />
        <polygon points="60,20 72,26 72,36 60,30" fill="#ffffff" stroke="#a9b3bd" strokeWidth="1" />
        <polygon points="48,26 88,46 48,66 8,46" fill="#f59436" />
        <polygon points="8,46 48,66 48,70 8,50" fill="#c9601f" />
        <polygon points="48,66 88,46 88,50 48,70" fill="#b35400" />
    </svg>;

const Row: FC<{ label: string, value: string, last?: boolean }> = ({ label, value, last = false }) =>
    <div className={ `ap-row${ last ? ' is-last' : '' }` }><span>{ label }</span><strong>{ value }</strong></div>;

export const ApartmentsView: FC<{}> = props =>
{
    const [ isOpen, setIsOpen ] = useState(false);
    const [ apartment, setApartment ] = useState<ApartmentState>(null);
    const [ notice, setNotice ] = useState('');
    const [ tab, setTab ] = useState<Tab>('mine');
    // The lot clicked to buy next, -1 for none.
    const [ picked, setPicked ] = useState(-1);
    const [ hover, setHover ] = useState(-1);
    // A lot that can't be bought was clicked: the line under the title says why.
    const [ poked, setPoked ] = useState(false);
    const [ askingPrice, setAskingPrice ] = useState('');
    // The red Sell back button was pressed once and waits for the second.
    const [ confirmSell, setConfirmSell ] = useState(false);
    // An action is on its way: buttons wait for the answer, so one click is one action.
    const [ busy, setBusy ] = useState(false);
    const { getCurrencyAmount } = usePurse();

    useMessageEvent<RpApartmentEvent>(RpApartmentEvent, event =>
    {
        const parser = event.getParser();

        // Only an Apartments point opens the window; an answer lands only while it is up.
        if(!parser.open && !isOpen) return;

        setApartment({
            price: parser.price,
            lotPriceBase: parser.lotPriceBase,
            lotPriceStep: parser.lotPriceStep,
            sellBackPercent: parser.sellBackPercent,
            maxListPrice: parser.maxListPrice,
            listingFee: parser.listingFee,
            grid: parser.grid,
            lotSize: parser.lotSize,
            centreLot: parser.centreLot,
            building: parser.building,
            owns: parser.owns,
            roomName: parser.roomName,
            boughtAt: parser.boughtAt,
            paid: parser.paid,
            listPrice: parser.listPrice,
            lots: parser.lots
        });

        if(parser.notice) setNotice(parser.notice);
        setBusy(false);
        setConfirmSell(false);
        // A lot bought, or the apartment sold: nothing stays picked.
        setPicked(-1);

        if(parser.open)
        {
            setIsOpen(true);
            setTab('mine');
            setPoked(false);
            setAskingPrice('');
        }
    });

    // Stepping off the point closes the window (RpApartments.Close).
    useEffect(() =>
    {
        const linkTracker: ILinkEventTracker = {
            linkReceived: (url: string) =>
            {
                const action = url.split('/')[1];

                // Walking out of your own apartment: a picture of it for the
                // real estate board (RpApartments.LeaveSoon).
                if(action === 'snapshot')
                {
                    TakeApartmentSnapshot();
                    return;
                }

                if(action !== 'hide') return;

                setIsOpen(false);
                setBusy(false);
            },
            eventUrlPrefix: 'apartments/'
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

    // The second click on Sell back has to come soon, or it is asked again.
    useEffect(() =>
    {
        if(!confirmSell) return;

        const timeout = setTimeout(() => setConfirmSell(false), CONFIRM_MS);

        return () => clearTimeout(timeout);
    }, [ confirmSell ]);

    const owned = useMemo(() => new Set(apartment?.owns ? apartment.lots : []), [ apartment ]);

    const addable = useMemo(() =>
    {
        const lots = new Set<number>();

        if(!apartment?.owns) return lots;

        for(let lot = 0; lot < apartment.grid * apartment.grid; lot++)
        {
            if(!owned.has(lot) && IsNextTo(owned, lot, apartment.grid)) lots.add(lot);
        }

        return lots;
    }, [ apartment, owned ]);

    if(!isOpen || !apartment) return null;

    const cash = getCurrencyAmount(-1);
    const count = owned.size;
    const lotPrice = (n: number) => ((n <= 1) ? apartment.price : apartment.lotPriceBase + (n - 2) * apartment.lotPriceStep);
    const size = (n: number) => ((n === 1) ? `1 lot · ${ apartment.lotSize } x ${ apartment.lotSize } tiles` : `${ n } lots · ${ (n * apartment.lotSize * apartment.lotSize).toLocaleString('en-US') } tiles`);
    // Every lot of the grid: a Penthouse (Twist) - the server renames the room, the window says so.
    const penthouse = apartment.owns && (count >= apartment.grid * apartment.grid);
    const home = penthouse ? 'penthouse' : 'apartment';
    const pickedLot = (apartment.owns && addable.has(picked)) ? picked : -1;
    const view = !apartment.owns ? 'buy' : ((tab === 'sell') ? 'sell' : ((pickedLot >= 0) ? 'lot' : 'mine'));
    const sellBack = Math.floor(apartment.paid * apartment.sellBackPercent / 100);
    const asking = (parseInt(askingPrice, 10) || 0);

    // One action at a time, answered before the next.
    const act = (action: number, value: number = 0) =>
    {
        if(busy) return;

        setBusy(true);
        SendRpApartmentAction(action, value);
    };

    const pickTab = (next: Tab) =>
    {
        setTab(next);
        setPicked(-1);
        setPoked(false);
        setConfirmSell(false);
    };

    const pickLot = (lot: number) =>
    {
        if(!apartment.owns || owned.has(lot)) return;

        if(addable.has(lot))
        {
            setTab('mine');
            setPicked(lot);
            setPoked(false);
            return;
        }

        setPoked(true);
    };

    const typePrice = (value: string) =>
    {
        const digits = value.replace(/[^0-9]/g, '');

        setAskingPrice(digits ? String(Math.min(apartment.maxListPrice, parseInt(digits, 10))) : '');
    };

    const sellBackClick = () =>
    {
        if(!confirmSell)
        {
            setConfirmSell(true);
            return;
        }

        act(ApartmentAction.SellBack);
    };

    // Short of cash for `cost`: one line above the button says how much more (Twist: no cash box).
    const shortLine = (cost: number) => ((cash < cost) ? <span className="ap-short">You need { Money(cost - cash) } more cash in hand.</span> : null);

    let hint = 'The orange lot is for sale. Once you own it, you can add the grey lots next to it.';

    if(apartment.owns) hint = poked ? 'Pick a lot next to your apartment.' : (penthouse ? 'Your penthouse takes up every lot.' : ((count === 1) ? 'Your apartment is on the centre lot.' : 'Your apartment covers the orange lots.'));

    const bought = apartment.boughtAt ? new Date(apartment.boughtAt * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '';

    const tabs = apartment.owns
        ? <div className="ap-tabs" role="tablist">
            <button type="button" role="tab" aria-selected={ (tab === 'mine') } className={ `ap-tab${ (tab === 'mine') ? ' is-on' : '' }` } onClick={ () => pickTab('mine') }>{ penthouse ? 'My penthouse' : 'My apartment' }</button>
            <button type="button" role="tab" aria-selected={ (tab === 'sell') } className={ `ap-tab${ (tab === 'sell') ? ' is-on' : '' }` } onClick={ () => pickTab('sell') }>Sell</button>
        </div>
        : <div className="ap-tabs" role="tablist">
            <button type="button" role="tab" aria-selected="true" className="ap-tab is-on">Buy</button>
            <button type="button" role="tab" aria-selected="false" className="ap-tab is-locked" disabled><Lock />My apartment</button>
            <button type="button" role="tab" aria-selected="false" className="ap-tab is-locked" disabled><Lock />Sell</button>
        </div>;

    return (
        <NitroCardView className="nitro-apartments" theme="primary-slim" uniqueKey="apartments">
            <NitroCardHeaderView headerText={ apartment.building || 'Apartments' } onCloseClick={ () => setIsOpen(false) } />
            { tabs }
            <NitroCardContentView overflow="hidden" classNames={ [ 'ap-body' ] }>
                <div className="ap-layout">
                    <div className="ap-panel ap-plan">
                        <span className="ap-title">Lots in this building</span>
                        <span className={ `ap-sub${ poked ? ' is-poked' : '' }` }>{ hint }</span>
                        <div className="ap-plan-art">
                            <ApartmentFloorPlan
                                grid={ apartment.grid }
                                owned={ owned }
                                forSale={ apartment.owns ? -1 : apartment.centreLot }
                                addable={ addable }
                                picked={ pickedLot }
                                hover={ hover }
                                onPick={ pickLot }
                                onHover={ setHover } />
                        </div>
                        { apartment.owns && !penthouse && <span className="ap-click-line">Click a lot next to yours to buy it.</span> }
                        <div className="ap-legend">
                            { !apartment.owns && <span><span className="ap-key is-yours" />For sale</span> }
                            { apartment.owns && <span><span className="ap-key is-yours" />Yours</span> }
                            { apartment.owns && !penthouse && <span><svg aria-hidden="true" width="12" height="12" viewBox="0 0 12 12" shapeRendering="crispEdges"><rect x="0" y="0" width="12" height="12" rx="2" fill="#e87332" /><rect x="1" y="1" width="10" height="10" rx="1" fill="#ffffff" /><rect x="5" y="3" width="2" height="6" fill="#e87332" /><rect x="3" y="5" width="6" height="2" fill="#e87332" /></svg>Can add</span> }
                        </div>
                    </div>
                    { (view === 'buy') &&
                        <div className="ap-panel ap-side">
                            <span className="ap-label">Centre lot</span>
                            <span className="ap-heading">Your own apartment</span>
                            <div className="ap-rows">
                                <Row label="Price" value={ Money(apartment.price) } />
                                <Row label="Size" value={ `${ apartment.lotSize } x ${ apartment.lotSize } tiles` } />
                                <Row label="Sell back" value={ `${ apartment.sellBackPercent }%` } last />
                            </div>
                            <div className="ap-fill" />
                            { shortLine(apartment.price) }
                            <button type="button" className="ap-button is-orange ap-wide" disabled={ busy || (cash < apartment.price) } onClick={ () => act(ApartmentAction.Buy, apartment.centreLot) }>Buy apartment for { Money(apartment.price) }</button>
                        </div> }
                    { (view === 'mine') &&
                        <div className="ap-panel ap-side">
                            <div className="ap-picture"><RoomPicture /></div>
                            <span className="ap-heading ap-name">{ apartment.roomName || `Your ${ home }` }</span>
                            <div className="ap-rows">
                                <Row label="Building" value={ apartment.building || '-' } />
                                <Row label="Size" value={ size(count) } />
                                <Row label="Bought" value={ bought || '-' } last />
                            </div>
                            <button type="button" className="ap-button is-orange ap-wide ap-go" disabled={ busy } onClick={ () => act(ApartmentAction.Enter) }>Go to my { home }</button>
                        </div> }
                    { (view === 'lot') &&
                        <div className="ap-panel ap-side">
                            <span className="ap-label">Add a lot</span>
                            <span className="ap-heading">Add this lot</span>
                            <span className="ap-sub">Your apartment grows by { apartment.lotSize } x { apartment.lotSize } tiles. Your furni stays where it is.</span>
                            <div className="ap-rows">
                                <Row label="This lot" value={ Money(lotPrice(count + 1)) } />
                                <Row label="Next lot after this" value={ Money(lotPrice(count + 2)) } />
                                <Row label="Size after" value={ size(count + 1) } last />
                            </div>
                            <div className="ap-fill" />
                            { shortLine(lotPrice(count + 1)) }
                            <div className="ap-button-row">
                                <button type="button" className="ap-button is-white ap-cancel" onClick={ () => setPicked(-1) }>Cancel</button>
                                <button type="button" className="ap-button is-orange" disabled={ busy || (cash < lotPrice(count + 1)) } onClick={ () => act(ApartmentAction.Buy, pickedLot) }>Buy</button>
                            </div>
                        </div> }
                    { (view === 'sell') &&
                        <div className="ap-panel ap-side">
                            <span className="ap-label">Sell it back</span>
                            <div className="ap-sellback">
                                <LayoutCurrencyIcon type={ -1 } />
                                <span className="ap-sellback-value">{ sellBack.toLocaleString('en-US') }</span>
                                <span className="ap-dim">{ apartment.sellBackPercent }% of { Money(apartment.paid) }</span>
                            </div>
                            { confirmSell
                                ? <div className="ap-note is-warning">{ `You'll get ${ Money(sellBack) } and your furni goes to your inventory.${ (apartment.listPrice > 0) ? ' It also comes off the real estate board.' : '' }` }</div>
                                : <div className="ap-note">Your furni goes back to your inventory.</div> }
                            <button type="button" className="ap-button is-red ap-wide" disabled={ busy } onClick={ sellBackClick }>{ confirmSell ? 'Click again to sell back' : `Sell back for ${ Money(sellBack) }` }</button>
                            { confirmSell && <button type="button" className="ap-link" onClick={ () => setConfirmSell(false) }>Cancel</button> }
                            <div className="ap-divider" />
                            <span className="ap-label">List for sale</span>
                            { (apartment.listPrice > 0)
                                ? <>
                                    <div className="ap-listed">
                                        <svg aria-hidden="true" width="14" height="16" viewBox="-7 -24 14 16" shapeRendering="crispEdges"><rect x="-6" y="-23" width="12" height="12" rx="2" fill="#e87332" stroke="#c9601f" strokeWidth="1" /><polygon points="-3,-11 3,-11 0,-8" fill="#c9601f" /><g fill="#ffffff"><rect x="-4" y="-18" width="2" height="2" /><rect x="-2" y="-16" width="2" height="2" /><rect x="0" y="-18" width="2" height="2" /><rect x="2" y="-20" width="2" height="2" /></g></svg>
                                        <div className="ap-listed-text">
                                            <span>On the real estate board for</span>
                                            <strong>{ Money(apartment.listPrice) }</strong>
                                        </div>
                                    </div>
                                    <span className="ap-small">Other players can buy it now.</span>
                                    <button type="button" className="ap-button is-white ap-wide" disabled={ busy } onClick={ () => act(ApartmentAction.Unlist) }>Take off sale</button>
                                </>
                                : <>
                                    <span className="ap-small">Your { home } goes on the real estate board. The buyer gets the furni too.</span>
                                    <label className="ap-price">
                                        <LayoutCurrencyIcon type={ -1 } />
                                        <span className="ap-hidden">Your price</span>
                                        <input type="text" inputMode="numeric" placeholder="Your price" value={ askingPrice ? Number(askingPrice).toLocaleString('en-US') : '' } onChange={ event => typePrice(event.target.value) } />
                                    </label>
                                    <div className="ap-fee"><span>Listing fee</span><span>{ Money(apartment.listingFee) }</span></div>
                                    <div className="ap-earn"><span>You get when it sells</span><span>{ Money(asking) }</span></div>
                                    <button type="button" className="ap-button is-orange ap-wide" disabled={ busy || (asking < 1) || (cash < apartment.listingFee) } onClick={ () => act(ApartmentAction.List, asking) }>List for sale</button>
                                </> }
                        </div> }
                </div>
                { !!notice && <div className="ap-notice" role="status">{ notice }</div> }
            </NitroCardContentView>
        </NitroCardView>
    );
}
