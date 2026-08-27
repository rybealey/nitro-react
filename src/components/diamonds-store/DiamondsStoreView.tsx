import { ILinkEventTracker } from '@nitrots/nitro-renderer';
import { ChangeEvent, FC, useEffect, useState } from 'react';
import { AddEventLinkTracker, RemoveLinkEventTracker } from '../../api';
import { Button, NitroCardContentView, NitroCardHeaderView, NitroCardTabsItemView, NitroCardTabsView, NitroCardView } from '../../common';
import { useStripeCheckout } from './useStripeCheckout';

// The PixelRP Diamonds Store window, opened from the toolbar's Diamonds icon
// (CreateLinkEvent('diamonds-store/toggle')).

type DiamondsStoreTab = 'store' | 'buy';
type BuyViewState = 'form' | 'checkout' | 'complete' | 'error';

const MIN_DIAMONDS = 100;
const MAX_DIAMONDS = 100000;
const DEFAULT_DIAMONDS = 300;
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
        <NitroCardView uniqueKey="diamonds-store" className="nitro-diamonds-store" theme="primary-slim">
            <NitroCardHeaderView headerText="Diamonds Store" onCloseClick={ () => hide() } />
            <NitroCardTabsView>
                <NitroCardTabsItemView isActive={ currentTab === 'store' } onClick={ () => setCurrentTab('store') }>
                    Store
                </NitroCardTabsItemView>
                <NitroCardTabsItemView isActive={ currentTab === 'buy' } onClick={ () => setCurrentTab('buy') }>
                    Buy Diamonds
                </NitroCardTabsItemView>
            </NitroCardTabsView>
            <NitroCardContentView>
                { (currentTab === 'store') &&
                    <div className="diamonds-store-empty">
                        Nothing here yet - diamond items are coming soon.
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
                            <span>I accept that all purchases are final, and are non-refundable.</span>
                            <div className={ `diamonds-store-switch${ acceptedTerms ? ' is-on' : '' }` } onClick={ () => setAcceptedTerms(prevValue => !prevValue) }>
                                <div className="diamonds-store-switch-knob" />
                            </div>
                        </div>
                        <Button fullWidth variant="success" disabled={ !acceptedTerms || !diamondsValid } onClick={ onPurchase }>
                            { `Purchase ${ totalDisplay }` }
                        </Button>
                    </div> }
                { (currentTab === 'buy') && (buyState === 'checkout') &&
                    <div className="diamonds-store-checkout">
                        <div ref={ checkoutContainerRef } className="diamonds-store-checkout-container" />
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
