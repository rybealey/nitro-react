import { FC, MouseEvent, useState } from 'react';
import { AppGlyph, APP_DEFS } from './PhoneHomeView';
import { PhoneIcon } from './PhoneIcon';
import { AppPrice, EmployedBy, FindStoreApp, PriceAmount, PriceCurrency, STORE_APPS, StoreApp } from './PhoneAppStore';
import { LayoutCurrencyIcon } from '../../common';
import { usePhonePrefs } from './usePhone';

// The App Store.
//
// "Installed" is not a flag of its own - it IS the home screen layout, so
// getting an app drops its tile into the first free slot and removing one
// empties that slot. Ownership is remembered separately (usePhone), which is
// the rule that matters once apps are priced: you buy an app once, and it
// comes back free however many times you remove it.
//
// Two screens: the list, and an app's own page. A corporation app opens the
// unauthorised screen instead for anyone who does not work there.

interface PhoneAppStoreViewProps
{
    onBack: () => void;
    // Launching an installed app straight from its row, as the Store does.
    openApp: (key: string) => void;
}

// A price: the amount beside the coin or diamond the player already knows
// from the toolbar. A free app just says GET.
const PriceTag: FC<{ price: AppPrice }> = ({ price }) =>
{
    if(price.kind === 'free') return <>Get</>;

    return (
        <>
            { PriceAmount(price) }
            <LayoutCurrencyIcon type={ PriceCurrency(price) } />
        </>
    );
}

// An app's plate at any size, the same gradient the home screen tile uses.
const StorePlate: FC<{ appKey: string, size: number }> = ({ appKey, size }) =>
{
    const def = APP_DEFS[appKey];

    if(!def) return null;

    return (
        <div className="phone-store-plate" style={ { width: size, height: size, borderRadius: Math.round(size * 0.26), background: def.plate, fontSize: Math.round(size * 0.56) } }>
            <AppGlyph icon={ def.icon } pri={ def.pri } sec={ def.sec } faStyle={ def.faStyle } />
        </div>
    );
}

export const PhoneAppStoreView: FC<PhoneAppStoreViewProps> = props =>
{
    const { onBack = null, openApp = null } = props;
    const { isInstalled, installApp, removeApp, hasFreeSlot, owned } = usePhonePrefs();
    const [ openKey, setOpenKey ] = useState<string>(null);

    const open = FindStoreApp(openKey);
    const locked = (app: StoreApp) => (app.corporation && !EmployedBy(app.corporation));

    // An installed app's row launches it rather than opening its page.
    const launch = (event: MouseEvent<HTMLDivElement>, key: string) =>
    {
        event.stopPropagation();
        if(openApp) openApp(key);
    }

    // The pill on the right of a row: open it, or what it costs to get.
    const actionFor = (app: StoreApp) =>
    {
        if(isInstalled(app.key)) return <div className="phone-store-get phone-tap" onClick={ event => launch(event, app.key) }>Open</div>;

        // Owned already: putting it back never costs anything again.
        const reinstall = (owned.indexOf(app.key) >= 0);

        return <div className="phone-store-get">{ reinstall ? <>Get</> : <PriceTag price={ app.price } /> }</div>;
    }

    const row = (app: StoreApp) => (
        <div key={ app.key } className="phone-settings-item phone-tap" onClick={ event => setOpenKey(app.key) }>
            <StorePlate appKey={ app.key } size={ 46 } />
            <div className="phone-settings-row-body">
                <div className="phone-settings-item-label">{ app.key }</div>
                <div className="phone-settings-row-sub">{ app.blurb }</div>
            </div>
            { actionFor(app) }
        </div>
    );

    // ---- an app's own page ---------------------------------------------
    if(open)
    {
        const installed = isInstalled(open.key);
        const reinstall = (owned.indexOf(open.key) >= 0);

        const back = (
            <div className="phone-app-header">
                <div className="phone-app-header-lead">
                    <div className="phone-tap phone-thread-back" onClick={ event => setOpenKey(null) }>
                        <PhoneIcon icon="chevron-left" size={ 24 } />
                    </div>
                    <div>
                        <div className="phone-app-kicker">APP STORE</div>
                        <div className="phone-app-title">{ open.key }</div>
                    </div>
                </div>
            </div>
        );

        if(locked(open))
        {
            return (
                <div className="phone-screen phone-app-screen phone-settings phone-store">
                    <div className="phone-app-scroll">
                        { back }
                        <div className="phone-store-locked">
                            <StorePlate appKey={ open.key } size={ 74 } />
                            <div className="phone-store-locked-title">Not authorised</div>
                            <div className="phone-store-locked-sub">{ open.key } is { open.corporation } software. You need to be on their payroll to open it.</div>
                        </div>
                        <div className="phone-scroll-spacer" />
                    </div>
                </div>
            );
        }

        return (
            <div className="phone-screen phone-app-screen phone-settings phone-store">
                <div className="phone-app-scroll">
                    { back }
                    <div className="phone-store-hero">
                        <StorePlate appKey={ open.key } size={ 88 } />
                        <div className="phone-store-hero-body">
                            <div className="phone-store-hero-name">{ open.key }</div>
                            <div className="phone-store-hero-sub">PixelOS &middot; { open.category }</div>
                            { installed
                                ? <div className="phone-store-actions">
                                    <div className="phone-store-get is-buy phone-tap" onClick={ event => launch(event, open.key) }>Open</div>
                                    <div className="phone-store-get phone-tap" onClick={ event => removeApp(open.key) }>Remove</div>
                                </div>
                                : <div className={ `phone-store-get is-buy${ hasFreeSlot ? ' phone-tap' : ' is-inert' }` } onClick={ event => (hasFreeSlot && installApp(open.key)) }>
                                    { reinstall ? <>Get</> : <PriceTag price={ open.price } /> }
                                </div> }
                        </div>
                    </div>
                    <div className="phone-store-meta">
                        <div><span>Price</span><b>{ reinstall ? <>Owned</> : <PriceTag price={ open.price } /> }</b></div>
                        <div className="is-mid"><span>Category</span><b>{ open.category }</b></div>
                        <div><span>Size</span><b>1 tile</b></div>
                    </div>
                    <div className="phone-store-about">{ open.about }</div>
                    { (!installed && !hasFreeSlot) &&
                        <div className="phone-settings-footnote">Your home screen is full. Remove an app to make room for this one.</div> }
                    <div className="phone-scroll-spacer" />
                </div>
            </div>
        );
    }

    // ---- the list --------------------------------------------------------
    const off = STORE_APPS.filter(app => !isInstalled(app.key));
    const on = STORE_APPS.filter(app => isInstalled(app.key));

    return (
        <div className="phone-screen phone-app-screen phone-settings phone-store">
            <div className="phone-app-scroll">
                <div className="phone-app-header">
                    <div className="phone-app-header-lead">
                        <div className="phone-tap phone-thread-back" onClick={ event => (onBack && onBack()) }>
                            <PhoneIcon icon="chevron-left" size={ 24 } />
                        </div>
                        <div>
                            <div className="phone-app-kicker">PIXELOS</div>
                            <div className="phone-app-title">App Store</div>
                        </div>
                    </div>
                </div>
                <div className="phone-settings-list">
                    { (off.length > 0) &&
                        <div>
                            <div className="phone-section-label">Not on this phone</div>
                            <div className="phone-settings-card">{ off.map(row) }</div>
                        </div> }
                    { (on.length > 0) &&
                        <div>
                            <div className="phone-section-label">On this phone</div>
                            <div className="phone-settings-card">{ on.map(row) }</div>
                        </div> }
                </div>
                <div className="phone-settings-footnote">Phone, Messages, Camera, Settings and the App&nbsp;Store are part of the phone and cannot be removed.</div>
                <div className="phone-scroll-spacer" />
            </div>
        </div>
    );
}
