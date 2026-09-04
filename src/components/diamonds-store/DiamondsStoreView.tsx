import { DiamondsStoreEvent, DiamondsStoreListing, DiamondsStorePurchaseResultEvent, GetDiamondsStoreComposer, ILinkEventTracker, PurchaseDiamondsStoreItemComposer } from '@nitrots/nitro-renderer';
import { ChangeEvent, FC, useEffect, useState } from 'react';
import { AddEventLinkTracker, RemoveLinkEventTracker, SendMessageComposer } from '../../api';
import { Button, Flex, LayoutCurrencyIcon, NitroCardContentView, NitroCardHeaderView, NitroCardTabsItemView, NitroCardTabsView, NitroCardView } from '../../common';
import { useMessageEvent } from '../../hooks';
import { useCryptoCheckout } from './useCryptoCheckout';
import { useStripeCheckout } from './useStripeCheckout';

// The PixelRP Diamonds Store window, opened from the toolbar's Diamonds icon
// (CreateLinkEvent('diamonds-store/toggle')).

type DiamondsStoreTab = 'store' | 'buy';
// 'crypto' - hosted Checkout was opened in a new tab; the player finishes
// there and the webhook credits them, so in-game we just show a "check the
// other tab" confirmation.
type BuyViewState = 'form' | 'checkout' | 'crypto' | 'complete' | 'error';
type StoreViewState = 'list' | 'success' | 'error';

// MIN must stay in lockstep with the CMS DiamondCheckoutFormRequest rule
// (min:500) or valid-looking amounts 422 at checkout.
const MIN_DIAMONDS = 500;
const MAX_DIAMONDS = 100000;
const DEFAULT_DIAMONDS = 500;
const DIAMONDS_STEP = 100;

export const DiamondsStoreView: FC<{}> = props =>
{
    const [ isVisible, setIsVisible ] = useState(false);
    const [ currentTab, setCurrentTab ] = useState<DiamondsStoreTab>('store');
    // Held as the raw text the input shows, so the field can sit empty
    // mid-edit (select-all + backspace, then retype) instead of snapping
    // back to a placeholder value on every keystroke. Only clamped into a
    // real number on blur.
    const [ diamondsInput, setDiamondsInput ] = useState<string>(String(DEFAULT_DIAMONDS));
    const [ acceptedTerms, setAcceptedTerms ] = useState(false);
    const [ buyState, setBuyState ] = useState<BuyViewState>('form');
    const [ checkoutDiamonds, setCheckoutDiamonds ] = useState(0);
    const [ checkoutError, setCheckoutError ] = useState('');
    const { containerRef: checkoutContainerRef, mount: mountCheckout, destroy: destroyCheckout } = useStripeCheckout();
    const { launch: launchCryptoCheckout } = useCryptoCheckout();
    // Guards the crypto button against a double-tap firing two hosted sessions
    // (and two tabs) while the first request is still in flight.
    const [ cryptoLaunching, setCryptoLaunching ] = useState(false);
    const [ listings, setListings ] = useState<DiamondsStoreListing[]>([]);
    const [ storeState, setStoreState ] = useState<StoreViewState>('list');
    // itemKey armed for the two-step inline Buy -> Confirm flow
    const [ confirmingKey, setConfirmingKey ] = useState<string>(null);
    const [ storeError, setStoreError ] = useState('');
    // Guards the confirm screen's Buy button against a double-click firing
    // two purchases before the server round-trips a result.
    const [ purchasePending, setPurchasePending ] = useState(false);

    useMessageEvent<DiamondsStoreEvent>(DiamondsStoreEvent, event =>
    {
        setListings(event.getParser().items);
    });

    useMessageEvent<DiamondsStorePurchaseResultEvent>(DiamondsStorePurchaseResultEvent, event =>
    {
        const parser = event.getParser();

        setPurchasePending(false);
        setConfirmingKey(null);

        if(parser.status === 0)
        {
            setStoreState('success');
            return;
        }

        setStoreError((parser.status === 1) ? 'Not enough diamonds - top up in the Diamonds tab.' : 'Your backpack is full - free a slot and try again.');
        setStoreState('error');
    });

    // Request fresh listings whenever the Store tab comes on screen, so sale
    // prices are always current.
    useEffect(() =>
    {
        if(!isVisible || (currentTab !== 'store')) return;

        SendMessageComposer(new GetDiamondsStoreComposer());
    }, [ isVisible, currentTab ]);

    const show = (tab: DiamondsStoreTab = null) =>
    {
        setIsVisible(true);

        if(tab) setCurrentTab(tab);
    }

    const hide = () =>
    {
        setIsVisible(false);
    }

    // While the field is empty or holds something unparseable, there's no
    // valid amount yet - treat it as invalid rather than guessing a number.
    const parsedDiamonds = parseInt(diamondsInput, 10);
    const diamondsValid = (diamondsInput.trim() !== '') && !isNaN(parsedDiamonds);
    const diamonds = (diamondsValid ? parsedDiamonds : 0);

    // 1 diamond = 1 cent.
    const totalCents = diamonds;
    const totalDisplay = `$${ (totalCents / 100).toFixed(2) }`;

    const onDiamondsChange = (event: ChangeEvent<HTMLInputElement>) =>
    {
        setDiamondsInput(event.target.value);
    }

    const onDiamondsBlur = () =>
    {
        const parsed = parseInt(diamondsInput, 10);
        const clamped = Math.min(MAX_DIAMONDS, Math.max(MIN_DIAMONDS, (isNaN(parsed) ? MIN_DIAMONDS : parsed)));
        // The server validates diamonds as multiple_of:100 - snap to the
        // nearest 100-step here too, so a blurred value (e.g. typed or
        // pasted) can't sail through as a 422 from the checkout request.
        // Round (not floor/ceil) first, then re-clamp: rounding a value near
        // MIN/MAX up or down by up to 50 could otherwise push it just
        // outside [MIN_DIAMONDS, MAX_DIAMONDS].
        const stepped = Math.min(MAX_DIAMONDS, Math.max(MIN_DIAMONDS, Math.round(clamped / DIAMONDS_STEP) * DIAMONDS_STEP));

        setDiamondsInput(String(stepped));
    }

    const onPurchase = () =>
    {
        if(!acceptedTerms || !diamondsValid) return;

        setCheckoutError('');
        setCheckoutDiamonds(diamonds);
        setBuyState('checkout');
    }

    const onCheckoutComplete = () => setBuyState('complete');

    const onPayWithCrypto = () =>
    {
        if(!acceptedTerms || !diamondsValid || cryptoLaunching) return;

        setCheckoutError('');
        setCryptoLaunching(true);

        // launchCryptoCheckout opens the new tab synchronously (inside this
        // click gesture) before it awaits, so the pop-up isn't blocked.
        launchCryptoCheckout(diamonds)
            .then(() =>
            {
                setCheckoutDiamonds(diamonds);
                setBuyState('crypto');
            })
            .catch((error: Error) =>
            {
                setCheckoutError(error?.message || 'Couldn\'t start crypto checkout - try again in a moment.');
                setBuyState('error');
            })
            .finally(() => setCryptoLaunching(false));
    }

    const onDone = () =>
    {
        setBuyState('form');
        setAcceptedTerms(false);
    }

    const onCheckoutErrorBack = () =>
    {
        setBuyState('form');
        setCheckoutError('');
    }

    // Mounted only while the checkout state is actually on screen - leaving
    // it any way (finishing, erroring, switching tabs, closing the window,
    // or unmounting) tears the embedded Checkout instance down so a second
    // one is never created while one is still live.
    const checkoutActive = (buyState === 'checkout') && isVisible && (currentTab === 'buy');

    // Whenever the store closes - toolbar toggle, close button, or a
    // 'diamonds-store/hide' link event - reset out of a mid-checkout or
    // stuck-result state, so reopening always lands back on the form
    // instead of resuming (or re-mounting a fresh) checkout session.
    // destroy() of the embedded Checkout instance itself is handled by the
    // checkoutActive effect above, once buyState flips away from 'checkout'.
    //
    // Driven by its own effect on [isVisible], not read/reset inline inside
    // hide() - the linkTracker effect below only re-subscribes when
    // isVisible changes, so a hide() closure captured there would otherwise
    // keep seeing whatever buyState existed at that last subscribe, and
    // silently skip the reset if checkout had since started.
    useEffect(() =>
    {
        if(isVisible) return;

        setBuyState('form');
        setCheckoutError('');
        setStoreState('list');
        setStoreError('');
        setPurchasePending(false);
        setConfirmingKey(null);
        setCryptoLaunching(false);
    }, [ isVisible ]);

    useEffect(() =>
    {
        if(!checkoutActive) return;

        let cancelled = false;

        mountCheckout(checkoutDiamonds, () =>
        {
            if(!cancelled) onCheckoutComplete();
        }).catch((error: Error) =>
        {
            if(cancelled) return;

            setCheckoutError(error?.message || 'Couldn\'t start checkout - try again in a moment.');
            setBuyState('error');
        });

        return () =>
        {
            cancelled = true;
            destroyCheckout();
        };
    }, [ checkoutActive ]);

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
                        show();
                        return;
                    case 'hide':
                        hide();
                        return;
                    case 'toggle':
                        if(isVisible) hide();
                        else show();
                        return;
                }
            },
            eventUrlPrefix: 'diamonds-store/'
        };

        AddEventLinkTracker(linkTracker);

        return () => RemoveLinkEventTracker(linkTracker);
    }, [ isVisible ]);

    if(!isVisible) return null;

    return (
        <NitroCardView uniqueKey="diamonds-store" className={ `nitro-diamonds-store${ checkoutActive ? ' diamonds-store-tall' : '' }` } theme="primary-slim">
            <NitroCardHeaderView headerText="Support PixelRP" onCloseClick={ () => hide() } />
            <NitroCardTabsView>
                <NitroCardTabsItemView isActive={ currentTab === 'store' } onClick={ () => setCurrentTab('store') }>
                    Tokens
                </NitroCardTabsItemView>
                <NitroCardTabsItemView isActive={ currentTab === 'buy' } onClick={ () => setCurrentTab('buy') }>
                    Diamonds
                </NitroCardTabsItemView>
            </NitroCardTabsView>
            <NitroCardContentView>
                { (currentTab === 'store') && (storeState === 'list') &&
                    <div className="diamonds-store-listings">
                        { (listings.length === 0) &&
                            <div className="diamonds-store-empty">
                                Nothing here yet - diamond items are coming soon.
                            </div> }
                        { listings.map(listing =>
                        {
                            const onSale = (listing.specialPrice >= 0);
                            const confirming = (confirmingKey === listing.itemKey);

                            return (
                                <div key={ listing.itemKey } className="diamonds-store-listing">
                                    <div className={ `diamonds-store-listing-icon icon-${ listing.icon }` } />
                                    <div className="diamonds-store-listing-info">
                                        <div className="diamonds-store-listing-name">{ listing.name }</div>
                                        <div className="diamonds-store-listing-desc">{ listing.description }</div>
                                    </div>
                                    <div className="diamonds-store-listing-side">
                                        <div className="diamonds-store-listing-price">
                                            <LayoutCurrencyIcon type={ 5 } />
                                            { onSale && <span className="diamonds-store-price-was">{ listing.price }</span> }
                                            <span className="diamonds-store-price-now">{ onSale ? listing.specialPrice : listing.price }</span>
                                            { onSale && <span className="diamonds-store-sale-tag">SALE</span> }
                                        </div>
                                        { /* two-step: Buy arms, Confirm purchases - only this
                                             container is clickable, never the row */ }
                                        <div className={ `diamonds-store-buy-btn${ confirming ? ' is-confirming' : '' }${ purchasePending ? ' is-pending' : '' }` } onClick={ () =>
                                        {
                                            if(purchasePending) return;

                                            if(!confirming)
                                            {
                                                setConfirmingKey(listing.itemKey);

                                                return;
                                            }

                                            setPurchasePending(true);
                                            SendMessageComposer(new PurchaseDiamondsStoreItemComposer(listing.itemKey));
                                        } }>
                                            { confirming ? 'Confirm' : 'Buy' }
                                        </div>
                                    </div>
                                </div>);
                        }) }
                    </div> }
                { (currentTab === 'store') && (storeState === 'success') &&
                    <div className="diamonds-store-result">
                        <div className="diamonds-store-result-message">Purchased - check your backpack!</div>
                        <Button fullWidth variant="success" onClick={ () => setStoreState('list') }>Done</Button>
                    </div> }
                { (currentTab === 'store') && (storeState === 'error') &&
                    <div className="diamonds-store-result">
                        <div className="diamonds-store-result-message diamonds-store-result-error">{ storeError }</div>
                        <Button fullWidth variant="secondary" onClick={ () => setStoreState('list') }>Back</Button>
                    </div> }
                { (currentTab === 'buy') && (buyState === 'form') &&
                    <div className="diamonds-store-buy">
                        <div className="diamonds-store-section-title">Buy Diamonds</div>
                        <div className="diamonds-store-field">
                            <label className="diamonds-store-field-label" htmlFor="diamonds-store-amount">Diamonds</label>
                            <input id="diamonds-store-amount" className="form-control diamonds-store-input" type="number"
                                step={ DIAMONDS_STEP } min={ MIN_DIAMONDS } max={ MAX_DIAMONDS }
                                value={ diamondsInput } onChange={ onDiamondsChange } onBlur={ onDiamondsBlur } />
                        </div>
                        <div className="diamonds-store-summary">
                            <div className="diamonds-store-summary-row">
                                <span>Diamonds</span>
                                <span>{ diamonds }</span>
                            </div>
                            <div className="diamonds-store-summary-row diamonds-store-summary-total">
                                <span>Total</span>
                                <span>{ totalDisplay }</span>
                            </div>
                        </div>
                        <div className="diamonds-store-accept-row">
                            <span>I accept that all donations are final, and are non-refundable.</span>
                            <div className={ `diamonds-store-switch${ acceptedTerms ? ' is-on' : '' }` } onClick={ () => setAcceptedTerms(prevValue => !prevValue) }>
                                <div className="diamonds-store-switch-knob" />
                            </div>
                        </div>
                        <Flex gap={ 2 }>
                            <Button fullWidth variant="success" disabled={ !acceptedTerms || !diamondsValid } onClick={ onPurchase }>
                                Pay with Debit or Credit Card
                            </Button>
                            <Button fullWidth variant="secondary" disabled={ !acceptedTerms || !diamondsValid || cryptoLaunching } onClick={ onPayWithCrypto }>
                                { cryptoLaunching ? 'Opening...' : 'Pay with Crypto' }
                            </Button>
                        </Flex>
                        <div className="diamonds-store-crypto-hint">Prefer crypto? USDC stablecoin checkout opens in a new tab.</div>
                    </div> }
                { (currentTab === 'buy') && (buyState === 'checkout') &&
                    <div className="diamonds-store-checkout">
                        <div ref={ checkoutContainerRef } className="diamonds-store-checkout-container" />
                    </div> }
                { (currentTab === 'buy') && (buyState === 'crypto') &&
                    <div className="diamonds-store-result">
                        <div className="diamonds-store-result-message">Crypto checkout opened in a new tab. Finish there and your diamonds arrive automatically - you can close this window.</div>
                        <Button fullWidth variant="success" onClick={ onDone }>Done</Button>
                    </div> }
                { (currentTab === 'buy') && (buyState === 'complete') &&
                    <div className="diamonds-store-result">
                        <div className="diamonds-store-result-message">Diamonds delivered - enjoy!</div>
                        <Button fullWidth variant="success" onClick={ onDone }>Done</Button>
                    </div> }
                { (currentTab === 'buy') && (buyState === 'error') &&
                    <div className="diamonds-store-result">
                        <div className="diamonds-store-result-message diamonds-store-result-error">{ checkoutError }</div>
                        <Button fullWidth variant="secondary" onClick={ onCheckoutErrorBack }>Back</Button>
                    </div> }
            </NitroCardContentView>
        </NitroCardView>
    );
}
