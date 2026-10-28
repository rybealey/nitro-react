import { ILinkEventTracker } from '@nitrots/nitro-renderer';
import { FC, ReactNode, useEffect, useState } from 'react';
import { AddEventLinkTracker, GetConfiguration, RemoveLinkEventTracker } from '../../api';
import { RealEstateAction, RealEstateListing, RpRealEstateEvent, SendRpRealEstateAction } from '../../api/rp-apartments/RpRealEstateMessages';
import { LayoutCurrencyIcon, NitroCardContentView, NitroCardHeaderView, NitroCardView } from '../../common';
import { useMessageEvent, usePurse } from '../../hooks';
import { ApartmentLotShape } from './ApartmentFloorPlan';

// PixelRP real estate board (the "Apartments" canvas, "Real Estate board" -
// Twist, 2026-10-28). Apartments players listed for sale on the Apartments
// window's Sell tab: each with its owner, its lots, its price, whether there is
// furni in it, and a picture of its inside - taken as its owner last walked out
// of it. Visit to look round; Buy for its price in cash, furni and all. One
// apartment per player, and never your own.
//
// SERVER-OPENED by stepping onto a Real Estate point (SF Apartments' second
// action point), which closes it again with "realestate/hide" on the step off,
// and every action is answered with the board again (emulator RpRealEstate).

interface BoardState
{
    ownsOne: boolean;
    grid: number;
    lotSize: number;
    listings: RealEstateListing[];
}

const Money = (value: number) => `$${ Math.max(0, value || 0).toLocaleString('en-US') }`;

const LotsText = (n: number) => ((n === 1) ? '1 lot' : `${ n } lots`);

const Row: FC<{ label: string, last?: boolean, children?: ReactNode }> = ({ label, last = false, children }) =>
    <div className={ `re-row${ last ? ' is-last' : '' }` }><span>{ label }</span><strong>{ children }</strong></div>;

export const RealEstateView: FC<{}> = props =>
{
    const [ isOpen, setIsOpen ] = useState(false);
    const [ board, setBoard ] = useState<BoardState>(null);
    const [ notice, setNotice ] = useState('');
    const [ selected, setSelected ] = useState(0);
    // The pictures that would not load - no picture taken yet - by room id.
    const [ missing, setMissing ] = useState<Set<number>>(new Set());
    // Pictures change as owners walk out; a fresh copy each time the board opens.
    const [ openedAt, setOpenedAt ] = useState(0);
    const [ busy, setBusy ] = useState(false);
    const { getCurrencyAmount } = usePurse();

    useMessageEvent<RpRealEstateEvent>(RpRealEstateEvent, event =>
    {
        const parser = event.getParser();

        // Only a Real Estate point opens the board; an answer lands only while it is up.
        if(!parser.open && !isOpen) return;

        setBoard({ ownsOne: parser.ownsOne, grid: parser.grid, lotSize: parser.lotSize, listings: parser.listings });

        if(parser.notice) setNotice(parser.notice);
        setBusy(false);

        if(parser.open)
        {
            setIsOpen(true);
            setSelected(parser.listings.length ? parser.listings[0].roomId : 0);
            setMissing(new Set());
            setOpenedAt(Date.now());
        }
    });

    // Stepping off the point closes the board (RpRealEstate.Close).
    useEffect(() =>
    {
        const linkTracker: ILinkEventTracker = {
            linkReceived: (url: string) =>
            {
                if(url.split('/')[1] !== 'hide') return;

                setIsOpen(false);
                setBusy(false);
            },
            eventUrlPrefix: 'realestate/'
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

    if(!isOpen || !board) return null;

    const cash = getCurrencyAmount(-1);
    const listing = board.listings.find(entry => (entry.roomId === selected)) ?? board.listings[0] ?? null;

    const act = (action: number) =>
    {
        if(busy || !listing) return;

        setBusy(true);
        SendRpRealEstateAction(action, listing.roomId, listing.price);
    };

    const pictureUrl = (roomId: number) =>
    {
        const url = (GetConfiguration<string>('thumbnails.url') || '').replace('%thumbnail%', roomId.toString());

        return url ? `${ url }${ url.includes('?') ? '&' : '?' }v=${ openedAt }` : '';
    };

    const size = (entry: RealEstateListing) =>
    {
        const n = entry.lots.length;

        return (n === 1) ? `1 lot · ${ board.lotSize } x ${ board.lotSize } tiles` : `${ n } lots · ${ (n * board.lotSize * board.lotSize).toLocaleString('en-US') } tiles`;
    };

    let reason = '';

    if(listing?.mine) reason = 'This is your own apartment.';
    else if(board.ownsOne) reason = 'You already own an apartment.';
    else if(listing && (cash < listing.price)) reason = `You need ${ Money(listing.price - cash) } more cash in hand.`;

    return (
        <NitroCardView className="nitro-real-estate" theme="primary-slim" uniqueKey="real-estate">
            <NitroCardHeaderView headerText="Real Estate" onCloseClick={ () => setIsOpen(false) } />
            <NitroCardContentView overflow="hidden" classNames={ [ 're-body' ] }>
                { !listing &&
                    <div className="re-panel re-empty">
                        <svg aria-hidden="true" width="28" height="36" viewBox="-7 -24 14 18" shapeRendering="crispEdges"><rect x="-6" y="-23" width="12" height="12" rx="2" fill="#ffffff" stroke="#a9b3bd" strokeWidth="1" /><polygon points="-3,-11 3,-11 0,-7" fill="#a9b3bd" /><rect x="-3" y="-18" width="6" height="2" fill="#a9b3bd" /></svg>
                        <span className="re-empty-title">No apartments for sale right now.</span>
                        <span className="re-dim">When a player lists one, it shows up here.</span>
                    </div> }
                { listing &&
                    <div className="re-layout">
                        <div className="re-panel re-list">
                            <div className="re-list-head"><span className="re-title">For sale</span><span className="re-count">{ board.listings.length }</span></div>
                            <div className="re-rows">
                                { board.listings.map(entry =>
                                {
                                    const on = (entry.roomId === listing.roomId);

                                    return (
                                        <button key={ entry.roomId } type="button" aria-pressed={ on } className={ `re-listing${ on ? ' is-on' : '' }` } onClick={ () => setSelected(entry.roomId) }>
                                            <span className="re-thumb"><ApartmentLotShape grid={ board.grid } lots={ entry.lots } width={ 72 } height={ 37 } /></span>
                                            <span className="re-listing-text">
                                                <span className="re-listing-name">{ entry.roomName || `${ entry.ownerName }'s Apartment` }</span>
                                                <span className="re-listing-sub">
                                                    <span className="re-dim">{ LotsText(entry.lots.length) }</span>
                                                    <span className="re-listing-price"><LayoutCurrencyIcon type={ -1 } />{ entry.price.toLocaleString('en-US') }</span>
                                                </span>
                                            </span>
                                        </button>
                                    );
                                }) }
                            </div>
                        </div>
                        <div className="re-panel re-detail">
                            <div className="re-picture">
                                { !missing.has(listing.roomId) && pictureUrl(listing.roomId)
                                    ? <img alt="Inside the apartment" src={ pictureUrl(listing.roomId) } onError={ () => setMissing(value => new Set(value).add(listing.roomId)) } />
                                    : <span className="re-no-picture">No picture yet</span> }
                            </div>
                            <div className="re-name-row">
                                <span className="re-name">{ listing.roomName || `${ listing.ownerName }'s Apartment` }</span>
                                <span className={ `re-tag${ listing.furnished ? ' is-furnished' : '' }` }>{ listing.furnished ? 'Furnished' : 'Unfurnished' }</span>
                            </div>
                            <div className="re-rows-info">
                                <Row label="Owner">{ listing.ownerName }</Row>
                                <Row label="Building">{ listing.building || '-' }</Row>
                                <Row label="Size" last><span className="re-size"><ApartmentLotShape grid={ board.grid } lots={ listing.lots } width={ 30 } height={ 15 } gap={ 12 } />{ size(listing) }</span></Row>
                            </div>
                            <div className="re-fill" />
                            { !!reason && <span className="re-reason">{ reason }</span> }
                            <div className="re-buttons">
                                <button type="button" className="re-button is-white" disabled={ busy } onClick={ () => act(RealEstateAction.Visit) }>Visit</button>
                                <button type="button" className="re-button is-orange" disabled={ busy || !!reason } onClick={ () => act(RealEstateAction.Buy) }>Buy for { Money(listing.price) }</button>
                            </div>
                        </div>
                    </div> }
                { !!notice && <div className="re-notice" role="status">{ notice }</div> }
            </NitroCardContentView>
        </NitroCardView>
    );
}
