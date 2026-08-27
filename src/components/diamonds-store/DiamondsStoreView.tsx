import { ILinkEventTracker } from '@nitrots/nitro-renderer';
import { ChangeEvent, FC, useEffect, useState } from 'react';
import { AddEventLinkTracker, RemoveLinkEventTracker } from '../../api';
import { Button, NitroCardContentView, NitroCardHeaderView, NitroCardTabsItemView, NitroCardTabsView, NitroCardView } from '../../common';

// The PixelRP Diamonds Store window, opened from the toolbar's Diamonds icon
// (CreateLinkEvent('diamonds-store/toggle')). Layout only for now - the
// Purchase button is wired to Stripe in a follow-up task.

type DiamondsStoreTab = 'store' | 'buy';

const MIN_DIAMONDS = 100;
const MAX_DIAMONDS = 100000;
const DEFAULT_DIAMONDS = 300;
const DIAMONDS_STEP = 100;

export const DiamondsStoreView: FC<{}> = props =>
{
    const [ isVisible, setIsVisible ] = useState(false);
    const [ currentTab, setCurrentTab ] = useState<DiamondsStoreTab>('store');
    const [ diamonds, setDiamonds ] = useState<number>(DEFAULT_DIAMONDS);
    const [ acceptedTerms, setAcceptedTerms ] = useState(false);

    const show = (tab: DiamondsStoreTab = null) =>
    {
        setIsVisible(true);

        if(tab) setCurrentTab(tab);
    }

    const hide = () => setIsVisible(false);

    // 1 diamond = 1 cent.
    const totalCents = diamonds;
    const totalDisplay = `$${ (totalCents / 100).toFixed(2) }`;

    const onDiamondsChange = (event: ChangeEvent<HTMLInputElement>) =>
    {
        const parsed = parseInt(event.target.value, 10);

        setDiamonds(isNaN(parsed) ? MIN_DIAMONDS : parsed);
    }

    const onDiamondsBlur = () =>
    {
        setDiamonds(prevValue => Math.min(MAX_DIAMONDS, Math.max(MIN_DIAMONDS, prevValue)));
    }

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
                { (currentTab === 'buy') &&
                    <div className="diamonds-store-buy">
                        <div className="diamonds-store-section-title">Buy Diamonds</div>
                        <div className="diamonds-store-field">
                            <label className="diamonds-store-field-label" htmlFor="diamonds-store-amount">Diamonds</label>
                            <input id="diamonds-store-amount" className="form-control diamonds-store-input" type="number"
                                step={ DIAMONDS_STEP } min={ MIN_DIAMONDS } max={ MAX_DIAMONDS }
                                value={ diamonds } onChange={ onDiamondsChange } onBlur={ onDiamondsBlur } />
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
                        <Button fullWidth variant="success" disabled={ !acceptedTerms } onClick={ () => {} }>
                            { `Purchase ${ totalDisplay }` }
                        </Button>
                    </div> }
            </NitroCardContentView>
        </NitroCardView>
    );
}
