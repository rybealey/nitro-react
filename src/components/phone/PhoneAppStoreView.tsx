import { FC, MouseEvent, useMemo, useState } from 'react';
import { GetSessionDataManager } from '../../api';
import { LayoutCurrencyIcon } from '../../common';
import { AppPrice, EmployedBy, FindStoreApp, PriceAmount, PriceCurrency, STORE_APPS, StoreApp } from './PhoneAppStore';
import { PhoneAvatar } from './PhoneAvatar';
import { AppGlyph, APP_DEFS, AppPlate } from './PhoneHomeView';
import { PhoneIcon } from './PhoneIcon';
import { SwipeRow } from './PhoneNotesView';
import { usePhonePrefs } from './usePhone';

// The App Store.
//
// Three screens. DISCOVER leads with one featured app and lists what is not on
// the phone yet; the account button opens the LIBRARY, which is the other way
// round - what you have, with a swipe to remove it - and either can open an
// app's own PAGE.
//
// "Installed" is not a flag of its own: it IS the home screen layout, so
// getting an app drops its tile into the first free slot and removing one
// closes the gap behind it. Ownership is remembered separately (usePhone),
// which is the rule that matters once apps carry a price - you buy an app
// once, and it comes back free however many times you remove it.

interface PhoneAppStoreViewProps
{
    onBack: () => void;
    // Launching an installed app straight from its row, as the Store does.
    openApp: (key: string) => void;
}

type StoreScreen = 'discover' | 'library';

// An app's plate at any size - the home screen's own icon, rendered smaller.
const StorePlate: FC<{ appKey: string, size: number }> = ({ appKey, size }) =>
    <AppPlate appKey={ appKey } size={ size } className="phone-store-plate" />;

// A price: the amount beside the coin or diamond the player already knows from
// the toolbar. A free app just says GET.
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

export const PhoneAppStoreView: FC<PhoneAppStoreViewProps> = props =>
{
    const { onBack = null, openApp = null } = props;
    const { isInstalled, installApp, removeApp, hasFreeSlot, owned } = usePhonePrefs();
    const [ screen, setScreen ] = useState<StoreScreen>('discover');
    const [ openKey, setOpenKey ] = useState<string>(null);
    const [ search, setSearch ] = useState<string>('');
    const [ swipeKey, setSwipeKey ] = useState<string>('');

    const open = FindStoreApp(openKey);
    const locked = (app: StoreApp) => (app.corporation && !EmployedBy(app.corporation));
    const ownedAlready = (key: string) => (owned.indexOf(key) >= 0);

    // The account button carries the player's own portrait, the same render
    // Settings shows beside their name. The initial stays as the fallback for
    // the case where no figure is known yet.
    const ownId = useMemo(() => (GetSessionDataManager()?.userId || 0), []);

    const ownFigure = useMemo(() => (GetSessionDataManager()?.figure || null), []);

    const initial = useMemo(() =>
    {
        const name = (GetSessionDataManager()?.userName || '');

        return (name.charAt(0) || '?');
    }, []);

    // An installed app's row launches it rather than opening its page.
    const launch = (event: MouseEvent<HTMLDivElement>, key: string) =>
    {
        event.stopPropagation();
        if(openApp) openApp(key);
    }

    const get = (event: MouseEvent<HTMLDivElement>, key: string) =>
    {
        event.stopPropagation();
        if(hasFreeSlot) installApp(key);
    }

    // The pill on the right of a row: open it, or what it costs to get.
    const actionFor = (app: StoreApp) =>
    {
        if(isInstalled(app.key)) return <div className="phone-store-get phone-tap" onClick={ event => launch(event, app.key) }>Open</div>;

        return (
            <div className={ `phone-store-get${ hasFreeSlot ? ' phone-tap' : ' is-inert' }` } onClick={ event => get(event, app.key) }>
                { ownedAlready(app.key) ? <>Get</> : <PriceTag price={ app.price } /> }
            </div>
        );
    }

    const rowBody = (app: StoreApp) => (
        <>
            <StorePlate appKey={ app.key } size={ 46 } />
            <div className="phone-settings-row-body">
                <div className="phone-settings-item-label">{ app.key }</div>
                <div className="phone-settings-row-sub">{ app.blurb }</div>
            </div>
        </>
    );

    const row = (app: StoreApp) => (
        <div key={ app.key } className="phone-settings-item phone-tap" onClick={ event => setOpenKey(app.key) }>
            { rowBody(app) }
            { actionFor(app) }
        </div>
    );

    // Back on the left like every other app's root, the account button on the
    // right; Discover carries both, the sub-screens only the first.
    const header = (title: string, kicker: string, onBackTo: () => void, onAccount?: () => void) => (
        <div className="phone-app-header">
            <div className="phone-app-header-lead">
                <div className="phone-tap phone-thread-back" onClick={ event => onBackTo() }>
                    <PhoneIcon icon="chevron-left" size={ 24 } />
                </div>
                <div>
                    <div className="phone-app-kicker">{ kicker }</div>
                    <div className="phone-app-title">{ title }</div>
                </div>
            </div>
            { !!onAccount &&
                <div className={ 'phone-store-account phone-tap' + (ownFigure ? ' is-avatar' : '') }
                    onClick={ event => onAccount() }>
                    { ownFigure
                        ? <PhoneAvatar portrait id={ ownId } figure={ ownFigure } size={ 30 } />
                        : initial }
                </div> }
        </div>
    );

    // ---- an app's own page ---------------------------------------------
    if(open)
    {
        const installed = isInstalled(open.key);
        const back = header(open.key, 'APP STORE', () => setOpenKey(null));

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
                                : <div className={ `phone-store-get is-buy${ hasFreeSlot ? ' phone-tap' : ' is-inert' }` } onClick={ event => get(event, open.key) }>
                                    { ownedAlready(open.key) ? <>Get</> : <PriceTag price={ open.price } /> }
                                </div> }
                        </div>
                    </div>
                    <div className="phone-store-meta">
                        <div><span>Price</span><b>{ ownedAlready(open.key) ? <>Owned</> : <PriceTag price={ open.price } /> }</b></div>
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

    // ---- library: what you have, and a swipe to let it go ---------------
    if(screen === 'library')
    {
        const mine = STORE_APPS.filter(app => isInstalled(app.key));
        const gone = STORE_APPS.filter(app => !isInstalled(app.key));

        return (
            <div className="phone-screen phone-app-screen phone-settings phone-store">
                <div className="phone-app-scroll">
                    { header('Library', 'APP STORE', () => setScreen('discover')) }
                    <div className="phone-settings-list">
                        { (mine.length > 0) &&
                            <div>
                                <div className="phone-section-label">ON THIS PHONE</div>
                                <div className="phone-settings-card">
                                    { mine.map((app, index) => (
                                        <SwipeRow key={ app.key } first={ index === 0 } index={ index }
                                            open={ swipeKey === app.key }
                                            onOpenChange={ isOpen => setSwipeKey(isOpen ? app.key : '') }
                                            onTap={ () => setOpenKey(app.key) }
                                            actions={ [ { icon: 'trash', label: 'Remove', tone: 'del', onClick: () => removeApp(app.key) } ] }>
                                            <div className="phone-settings-item">
                                                { rowBody(app) }
                                                <PhoneIcon icon="chevron-right" size={ 18 } className="phone-settings-chev" />
                                            </div>
                                        </SwipeRow>
                                    )) }
                                </div>
                            </div> }
                        { (gone.length > 0) &&
                            <div>
                                <div className="phone-section-label">NOT INSTALLED</div>
                                <div className="phone-settings-card">{ gone.map(row) }</div>
                            </div> }
                    </div>
                    <div className="phone-settings-footnote">Phone, Messages, Camera, Contacts, Wallet, Settings and the App&nbsp;Store are part of the phone and cannot be removed.</div>
                    <div className="phone-scroll-spacer" />
                </div>
            </div>
        );
    }

    // ---- discover -------------------------------------------------------
    const query = search.trim().toLowerCase();
    const matches = STORE_APPS.filter(app => (app.key.toLowerCase().includes(query) || app.category.toLowerCase().includes(query)));
    const featured = STORE_APPS.find(app => (app.featured && !isInstalled(app.key)));
    const rest = matches.filter(app => (!isInstalled(app.key) && (app !== featured)));

    return (
        <div className="phone-screen phone-app-screen phone-settings phone-store">
            <div className="phone-app-scroll">
                { header('App Store', 'PIXELOS', () => (onBack && onBack()), () => setScreen('library')) }
                <div className="phone-search">
                    <PhoneIcon icon="magnifying-glass" size={ 14 } />
                    <input value={ search } placeholder="Search apps" onChange={ event => setSearch(event.target.value) } />
                </div>
                { (!query && featured) &&
                    <div className="phone-store-feat phone-tap" onClick={ event => setOpenKey(featured.key) }>
                        <div className="phone-store-feat-band" style={ { background: APP_DEFS[featured.key]?.plate } }>
                            <div className="phone-store-feat-ghost" style={ { fontSize: 150 } }>
                                <AppGlyph icon={ APP_DEFS[featured.key]?.icon } pri={ APP_DEFS[featured.key]?.pri }
                                    sec={ APP_DEFS[featured.key]?.sec } faStyle={ APP_DEFS[featured.key]?.faStyle } />
                            </div>
                            <div className="phone-store-feat-tag">Featured</div>
                            <div className="phone-store-feat-line">{ featured.tagline }</div>
                        </div>
                        <div className="phone-settings-item">
                            { rowBody(featured) }
                            { actionFor(featured) }
                        </div>
                    </div> }
                <div className="phone-settings-list">
                    { (rest.length > 0) &&
                        <div>
                            <div className="phone-section-label">{ query ? 'RESULTS' : 'MORE TO INSTALL' }</div>
                            <div className="phone-settings-card">{ rest.map(row) }</div>
                        </div> }
                    { (!query && !rest.length && !featured) &&
                        <div className="phone-store-empty">
                            <PhoneIcon icon="circle-check" size={ 30 } />
                            <div className="phone-store-empty-title">Everything is installed</div>
                            <div className="phone-store-empty-sub">Your library has the rest.</div>
                        </div> }
                    { (!!query && !rest.length) &&
                        <div className="phone-store-empty">
                            <PhoneIcon icon="magnifying-glass" size={ 28 } />
                            <div className="phone-store-empty-title">No apps found</div>
                        </div> }
                </div>
                <div className="phone-scroll-spacer" />
            </div>
        </div>
    );
}
