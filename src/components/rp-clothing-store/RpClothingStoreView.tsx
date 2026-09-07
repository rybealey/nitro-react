import { FigureSetIdsMessageEvent, IFigurePartSet, ILinkEventTracker, IPartColor, UserFigureComposer } from '@nitrots/nitro-renderer';
import { FC, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AddEventLinkTracker, AvatarEditorGridPartItem, AvatarEditorUtilities, FigureData, GetAvatarPalette, GetAvatarRenderManager, GetAvatarSetType, GetConfiguration, GetSessionDataManager, LocalizeFormattedNumber, RemoveLinkEventTracker, SendMessageComposer } from '../../api';
import { BUY_CLOTHING_BACKPACK_FULL, BUY_CLOTHING_INSUFFICIENT, BUY_CLOTHING_OK, BUY_CLOTHING_SOLD_OUT, ClothingListing, ClothingShelfName, IsLtdListing, IsSoldOutListing, RpBuyClothingComposer, RpBuyClothingResultEvent, RpClothingStoreEvent, RpGetClothingStoreComposer, RpOpenClothingStoreEvent } from '../../api/rp-clothing/RpClothingMessages';
import { LayoutAvatarImageView, LayoutCurrencyIcon, NitroCardContentView, NitroCardHeaderView, NitroCardTabsItemView, NitroCardTabsView, NitroCardView } from '../../common';
import { useMessageEvent, usePurse } from '../../hooks';
import { AvatarEditorIcon } from '../avatar-editor/views/AvatarEditorIcon';

// Clothing Store (:zara). The avatar editor's shape - category rail, shelf,
// spotlight mannequin - selling every priced catalog_clothing set for
// credits. Pieces go on the mannequin first (owned ones too, for free), the
// fitting list totals what is not yet owned, and Buy is two-step. A bought
// piece is worn out of the store and unlocked in Choose Your Looks; a limited
// edition lands in the Backpack as a token instead (see RpInventoryView).
//
// Opened by CreateLinkEvent('clothing-store/show|toggle|hide') or the
// server's RpOpenClothingStoreEvent (the :zara command).

type StoreTab = 'head' | 'torso' | 'legs' | 'ltd';

const TABS: { key: StoreTab, label: string, types: string[] }[] = [
    { key: 'head', label: 'Head', types: [ FigureData.HAIR, FigureData.HAT, FigureData.HEAD_ACCESSORIES, FigureData.EYE_ACCESSORIES, FigureData.FACE_ACCESSORIES ] },
    { key: 'torso', label: 'Torso', types: [ FigureData.SHIRT, FigureData.CHEST_PRINTS, FigureData.JACKET, FigureData.CHEST_ACCESSORIES ] },
    { key: 'legs', label: 'Legs', types: [ FigureData.TROUSERS, FigureData.SHOES, FigureData.TROUSER_ACCESSORIES ] },
];

const ALL_TYPES: string[] = TABS.flatMap(tab => tab.types);

const TYPE_LABELS: Record<string, string> = { hr: 'hair', ha: 'hats', he: 'head accessories', ea: 'eyewear', fa: 'face accessories', ch: 'shirts', cp: 'prints', cc: 'jackets', ca: 'chest accessories', lg: 'trousers', sh: 'shoes', wa: 'belts' };

// the shop's LTD category icon (catalogue/icon_145.png)
const LTD_ICON = '145';

interface ResolvedPart
{
    type: string;
    partSet: IFigurePartSet;
}

interface ShelfItem
{
    listing: ClothingListing;
    name: string;
    // the parts this piece puts on (gender-matched where possible), first is the tile's art
    parts: ResolvedPart[];
    // the rail category the piece files under
    type: string;
    tab: StoreTab;
}

// every figuredata part set by id, with the set type it belongs to
const BuildSetIndex = (): Map<number, ResolvedPart> =>
{
    const index = new Map<number, ResolvedPart>();

    for(const type of ALL_TYPES)
    {
        const setType = GetAvatarSetType(type);

        if(!setType) continue;

        for(const partSet of setType.partSets) index.set(partSet.id, { type, partSet });
    }

    return index;
}

const LayerCount = (partSet: IFigurePartSet) =>
{
    let max = 0;

    for(const part of partSet.parts) max = Math.max(max, part.colorLayerIndex);

    return (max + 1);
}

const PaletteFirstColor = (type: string) =>
{
    const setType = GetAvatarSetType(type);
    const palette = (setType ? GetAvatarPalette(setType.paletteID) : null);

    if(!palette) return 0;

    for(const color of palette.colors.getValues()) if(color.isSelectable) return color.id;

    return 0;
}

const PartColorsFor = (type: string, colorIds: number[]): IPartColor[] =>
{
    const setType = GetAvatarSetType(type);
    const palette = (setType ? GetAvatarPalette(setType.paletteID) : null);
    const colors: IPartColor[] = [];

    if(!palette) return colors;

    for(const id of colorIds)
    {
        for(const color of palette.colors.getValues())
        {
            if(color.id === id)
            {
                colors.push(color);
                break;
            }
        }
    }

    return colors;
}

const CheckGlyph = () => <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M2 6.5l2.8 2.8L10 3.5" /></svg>;

interface StoreTileProps
{
    item: ShelfItem;
    active: boolean;
    owned: boolean;
    onClick: () => void;
}

// One shelf tile: the picker's own part thumbnail on the grid-grey well,
// the name, and the price (or Owned / Sold out).
const StoreTile: FC<StoreTileProps> = props =>
{
    const { item, active, owned, onClick } = props;
    const [ updateId, setUpdateId ] = useState(0);
    const partSet = (item.parts.length ? item.parts[0].partSet : null);
    const isLtd = IsLtdListing(item.listing);
    const soldOut = IsSoldOutListing(item.listing);

    const partItem = useMemo(() =>
    {
        if(!partSet) return null;

        const colorIds = new Array(LayerCount(partSet)).fill(PaletteFirstColor(item.type));

        return new AvatarEditorGridPartItem(partSet, PartColorsFor(item.type, colorIds), true, false);
    }, [ partSet, item.type ]);

    useEffect(() =>
    {
        if(!partItem) return;

        partItem.notify = () => setUpdateId(prevValue => (prevValue + 1));
        partItem.init();

        return () =>
        {
            partItem.notify = null;
            partItem.dispose();
        }
    }, [ partItem ]);

    const imageUrl = (partItem ? partItem.imageUrl : null);
    const remaining = Math.max(0, item.listing.ltdTotal - item.listing.ltdSold);

    return (
        <div className={ `clothing-store-tile${ active ? ' is-active' : '' }${ isLtd ? ' is-ltd' : '' }${ soldOut ? ' is-sold-out' : '' }` } title={ item.name } onClick={ soldOut ? undefined : onClick }>
            <div className="clothing-store-tile-well">
                <div className="clothing-store-tile-art" style={ imageUrl ? { backgroundImage: `url(${ imageUrl })` } : undefined } />
                { isLtd &&
                    <div className="clothing-store-tile-ltd"><img src={ GetConfiguration<string>('catalog.asset.icon.url', '').replace('%name%', LTD_ICON) } alt="LTD" /></div> }
                { active &&
                    <div className="clothing-store-tile-on"><CheckGlyph />ON</div> }
                { !active && owned &&
                    <div className="clothing-store-tile-owned"><CheckGlyph /></div> }
            </div>
            <div className="clothing-store-tile-body">
                <div className="clothing-store-tile-name">{ item.name }</div>
                { owned &&
                    <div className="clothing-store-tile-price is-owned">Owned</div> }
                { !owned && soldOut &&
                    <div className="clothing-store-tile-price is-muted">Sold out</div> }
                { !owned && !soldOut &&
                    <div className="clothing-store-tile-price"><LayoutCurrencyIcon type={ -1 } />{ LocalizeFormattedNumber(item.listing.price) }</div> }
                { isLtd &&
                    <div className="clothing-store-tile-stock">{ remaining } of { item.listing.ltdTotal } left</div> }
            </div>
        </div>
    );
}

export const RpClothingStoreView: FC<{}> = props =>
{
    const [ isVisible, setIsVisible ] = useState(false);
    const [ tab, setTab ] = useState<StoreTab>('head');
    const [ railType, setRailType ] = useState<string>(FigureData.HAIR);
    const [ search, setSearch ] = useState('');
    const [ listings, setListings ] = useState<ClothingListing[]>([]);
    const [ ownedSetIds, setOwnedSetIds ] = useState<number[]>(() => [ ...AvatarEditorUtilities.FIGURE_SET_IDS ]);
    // clothing id -> the set types it currently occupies on the mannequin
    const [ tried, setTried ] = useState<Map<number, string[]>>(new Map());
    const [ renderId, setRenderId ] = useState(0);
    const [ armed, setArmed ] = useState(false);
    const [ pending, setPending ] = useState(false);
    const [ notice, setNotice ] = useState<{ text: string, error: boolean }>(null);
    const figureRef = useRef<FigureData>(null);
    const baseRef = useRef<FigureData>(null);
    const armTimer = useRef<ReturnType<typeof setTimeout>>(null);
    const { purse = null } = usePurse();

    // FigureData only allocates its maps in loadAvatarData, and the first
    // render reads getFigureString() before the show effect runs - so both
    // start loaded with whatever the player wears.
    if(!figureRef.current)
    {
        figureRef.current = new FigureData();
        figureRef.current.loadAvatarData(GetSessionDataManager().figure, GetSessionDataManager().gender);
    }

    if(!baseRef.current)
    {
        baseRef.current = new FigureData();
        baseRef.current.loadAvatarData(GetSessionDataManager().figure, GetSessionDataManager().gender);
    }

    const figure = figureRef.current;
    const base = baseRef.current;
    const gender = GetSessionDataManager().gender;

    const setIndex = useMemo(() => (isVisible ? BuildSetIndex() : new Map<number, ResolvedPart>()), [ isVisible ]);

    const shelf = useMemo<ShelfItem[]>(() =>
    {
        const items: ShelfItem[] = [];

        for(const listing of listings)
        {
            const all = listing.partIds.map(id => setIndex.get(id)).filter(part => !!part);

            if(!all.length) continue;

            const matching = all.filter(part => ((part.partSet.gender === FigureData.UNISEX) || (part.partSet.gender === gender)));
            const parts = (matching.length ? matching : all);
            const type = parts[0].type;
            const tab = TABS.find(candidate => (candidate.types.indexOf(type) >= 0));

            items.push({ listing, name: ClothingShelfName(listing), parts, type, tab: (tab ? tab.key : 'head') });
        }

        return items;
    }, [ listings, setIndex, gender ]);

    const shelfById = useMemo(() =>
    {
        const map = new Map<number, ShelfItem>();

        for(const item of shelf) map.set(item.listing.id, item);

        return map;
    }, [ shelf ]);

    const isOwned = useCallback((item: ShelfItem) => item.parts.every(part => (ownedSetIds.indexOf(part.partSet.id) >= 0)), [ ownedSetIds ]);

    const railTypes = useMemo(() =>
    {
        if(tab !== 'ltd') return TABS.find(candidate => (candidate.key === tab)).types;

        const present = ALL_TYPES.filter(type => shelf.some(item => (IsLtdListing(item.listing) && (item.type === type))));

        return [ 'all', ...present ];
    }, [ tab, shelf ]);

    const visibleItems = useMemo(() =>
    {
        const needle = search.trim().toLowerCase();

        return shelf.filter(item =>
        {
            const ltd = IsLtdListing(item.listing);

            if(tab === 'ltd')
            {
                if(!ltd) return false;
                if((railType !== 'all') && (item.type !== railType)) return false;
            }
            else
            {
                if(ltd || (item.type !== railType)) return false;
            }

            return (!needle.length || (item.name.toLowerCase().indexOf(needle) >= 0));
        });
    }, [ shelf, tab, railType, search ]);

    const canRemove = useMemo(() =>
    {
        if(!isVisible || (tab === 'ltd')) return false;

        const mandatory = GetAvatarRenderManager().getMandatoryAvatarPartSetIds(gender, 2);

        return (mandatory.indexOf(railType) === -1);
    }, [ isVisible, tab, railType, gender ]);

    const basket = useMemo(() => Array.from(tried.keys()).map(id => shelfById.get(id)).filter(item => (item && !isOwned(item))), [ tried, shelfById, isOwned ]);
    const total = basket.reduce((sum, item) => (sum + item.listing.price), 0);

    const rerender = useCallback(() => setRenderId(prevValue => (prevValue + 1)), []);

    // the colours a part goes on with: whatever the mannequin already wears in
    // that slot, else the palette's first colour on every layer
    const colorsFor = useCallback((type: string, partSet: IFigurePartSet) =>
    {
        const layers = LayerCount(partSet);
        const current = ((figure.getPartSetId(type) >= 0) ? (figure.getColorIds(type) || []) : []);
        const fallback = PaletteFirstColor(type);
        const colorIds: number[] = [];

        for(let i = 0; i < layers; i++) colorIds.push((current[i] !== undefined) ? current[i] : fallback);

        return colorIds;
    }, [ figure ]);

    const restoreType = useCallback((type: string) =>
    {
        const baseId = base.getPartSetId(type);

        figure.savePartData(type, ((baseId >= 0) ? baseId : -1), (base.getColorIds(type) || [ 0 ]), false);
    }, [ figure, base ]);

    const tryOn = useCallback((item: ShelfItem) =>
    {
        const applied: string[] = [];

        for(const part of item.parts)
        {
            figure.savePartData(part.type, part.partSet.id, colorsFor(part.type, part.partSet), false);

            if(applied.indexOf(part.type) === -1) applied.push(part.type);
        }

        figure.updateView();

        setTried(prevValue =>
        {
            const next = new Map<number, string[]>();

            // anything that sat in these slots comes off
            for(const [ id, types ] of prevValue)
            {
                const remaining = types.filter(type => (applied.indexOf(type) === -1));

                if(remaining.length) next.set(id, remaining);
            }

            next.set(item.listing.id, applied);

            return next;
        });

        setNotice(null);
        setArmed(false);
    }, [ figure, colorsFor ]);

    const takeOff = useCallback((clothingId: number) =>
    {
        setTried(prevValue =>
        {
            const types = prevValue.get(clothingId);

            if(!types) return prevValue;

            for(const type of types) restoreType(type);

            figure.updateView();

            const next = new Map(prevValue);

            next.delete(clothingId);

            return next;
        });

        setArmed(false);
    }, [ figure, restoreType ]);

    const clearType = useCallback((type: string) =>
    {
        figure.savePartData(type, -1, [ 0 ], true);

        setTried(prevValue =>
        {
            const next = new Map<number, string[]>();

            for(const [ id, types ] of prevValue)
            {
                const remaining = types.filter(candidate => (candidate !== type));

                if(remaining.length) next.set(id, remaining);
            }

            return next;
        });

        setArmed(false);
    }, [ figure ]);

    const reset = useCallback(() =>
    {
        figure.loadAvatarData(base.getFigureString(), gender);

        setTried(new Map());
        setNotice(null);
        setArmed(false);
    }, [ figure, base, gender ]);

    const rotate = useCallback((offset: number) =>
    {
        let direction = (figure.direction + offset);

        if(direction < 0) direction = 7;
        if(direction > 7) direction = 0;

        figure.direction = direction;
    }, [ figure ]);

    const selectTab = useCallback((next: StoreTab) =>
    {
        setTab(next);
        setSearch('');

        if(next === 'ltd')
        {
            setRailType('all');

            return;
        }

        const types = TABS.find(candidate => (candidate.key === next)).types;
        const stocked = types.find(type => shelf.some(item => (!IsLtdListing(item.listing) && (item.type === type))));

        setRailType(stocked || types[0]);
    }, [ shelf ]);

    const buy = useCallback(() =>
    {
        if(!basket.length || pending) return;

        if(!armed)
        {
            setArmed(true);

            if(armTimer.current) clearTimeout(armTimer.current);

            armTimer.current = setTimeout(() => setArmed(false), 5000);

            return;
        }

        if(armTimer.current) clearTimeout(armTimer.current);

        setArmed(false);
        setPending(true);
        setNotice(null);

        SendMessageComposer(new RpBuyClothingComposer(basket.map(item => item.listing.id)));
    }, [ basket, pending, armed ]);

    useMessageEvent<RpClothingStoreEvent>(RpClothingStoreEvent, event =>
    {
        setListings(event.getParser().listings);
    });

    useMessageEvent<FigureSetIdsMessageEvent>(FigureSetIdsMessageEvent, event =>
    {
        setOwnedSetIds([ ...event.getParser().figureSetIds ]);
    });

    useMessageEvent<RpOpenClothingStoreEvent>(RpOpenClothingStoreEvent, event =>
    {
        setIsVisible(true);
    });

    useMessageEvent<RpBuyClothingResultEvent>(RpBuyClothingResultEvent, event =>
    {
        const parser = event.getParser();

        setPending(false);

        switch(parser.status)
        {
            case BUY_CLOTHING_OK:
            {
                // a token's piece is not wearable yet: take it back off before
                // the outfit is saved, or the server would swap in a default
                for(const [ id, types ] of tried)
                {
                    const item = shelfById.get(id);

                    if(item && IsLtdListing(item.listing)) for(const type of types) restoreType(type);
                }

                figure.updateView();

                if(parser.unlocked > 0) SendMessageComposer(new UserFigureComposer(gender, figure.getFigureString()));

                base.loadAvatarData(figure.getFigureString(), gender);

                setTried(new Map());

                const parts: string[] = [];

                if(parser.unlocked > 0) parts.push('Bought - now in Choose Your Looks.');
                if(parser.tokens > 0) parts.push((parser.tokens === 1) ? 'Your token is in the Backpack.' : 'Your tokens are in the Backpack.');

                setNotice({ text: parts.join(' '), error: false });
                return;
            }
            case BUY_CLOTHING_INSUFFICIENT:
                setNotice({ text: 'Not enough credits.', error: true });
                return;
            case BUY_CLOTHING_BACKPACK_FULL:
                setNotice({ text: 'Backpack full - free a slot for the token.', error: true });
                return;
            case BUY_CLOTHING_SOLD_OUT:
                setNotice({ text: 'That edition just sold out.', error: true });
                return;
            default:
                setNotice({ text: 'Nothing new on the mannequin to buy.', error: true });
                return;
        }
    });

    useEffect(() =>
    {
        if(!isVisible) return;

        const session = GetSessionDataManager();

        base.loadAvatarData(session.figure, session.gender);
        figure.loadAvatarData(session.figure, session.gender);
        figure.direction = 2;
        figure.notify = rerender;

        setTried(new Map());
        setNotice(null);
        setArmed(false);
        setPending(false);
        setOwnedSetIds([ ...AvatarEditorUtilities.FIGURE_SET_IDS ]);

        SendMessageComposer(new RpGetClothingStoreComposer());

        return () =>
        {
            figure.notify = null;

            if(armTimer.current) clearTimeout(armTimer.current);
        }
    }, [ isVisible, figure, base, rerender ]);

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
                        setIsVisible(true);
                        return;
                    case 'hide':
                        setIsVisible(false);
                        return;
                    case 'toggle':
                        setIsVisible(prevValue => !prevValue);
                        return;
                }
            },
            eventUrlPrefix: 'clothing-store/'
        };

        AddEventLinkTracker(linkTracker);

        return () => RemoveLinkEventTracker(linkTracker);
    }, []);

    if(!isVisible) return null;

    const ltdIconUrl = GetConfiguration<string>('catalog.asset.icon.url', '').replace('%name%', LTD_ICON);
    const placeholder = ((tab === 'ltd') ? 'Search limited editions...' : `Search ${ TYPE_LABELS[railType] || 'clothing' }...`);
    const buyLabel = (!basket.length ? 'Buy' : (armed ? 'Confirm purchase' : `Buy ${ basket.length } item${ (basket.length > 1) ? 's' : '' }`));

    return (
        <NitroCardView uniqueKey="rp-clothing-store" className="nitro-clothing-store" theme="primary-slim">
            <NitroCardHeaderView headerText="Clothing Store" onCloseClick={ () => setIsVisible(false) } />
            <NitroCardTabsView>
                { TABS.map(candidate => <NitroCardTabsItemView key={ candidate.key } isActive={ tab === candidate.key } onClick={ () => selectTab(candidate.key) }>{ candidate.label }</NitroCardTabsItemView>) }
                <NitroCardTabsItemView isActive={ tab === 'ltd' } onClick={ () => selectTab('ltd') }>
                    <span className="clothing-store-tab-ltd" title="Limited editions"><img src={ ltdIconUrl } alt="LTD" /></span>
                </NitroCardTabsItemView>
            </NitroCardTabsView>
            <NitroCardContentView>
                <div className="clothing-store-body">
                    <div className="clothing-store-rail">
                        { railTypes.map(type => (
                            <div key={ type } className={ `clothing-store-rail-item${ (railType === type) ? ' is-active' : '' }` } title={ (type === 'all') ? 'All limited editions' : TYPE_LABELS[type] } onClick={ () => { setRailType(type); setSearch(''); } }>
                                { (type === 'all') ? <img src={ ltdIconUrl } alt="LTD" /> : <AvatarEditorIcon icon={ type } selected={ railType === type } /> }
                            </div>)) }
                    </div>
                    <div className="clothing-store-middle">
                        <div className="clothing-store-search">
                            <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="6" cy="6" r="4" /><path d="M9.2 9.2L12.5 12.5" /></svg>
                            <input type="text" value={ search } placeholder={ placeholder } onChange={ event => setSearch(event.target.value) } />
                        </div>
                        <div className="clothing-store-shelf">
                            { (!visibleItems.length && !canRemove) &&
                                <div className="clothing-store-empty">{ listings.length ? 'Nothing here matches.' : 'The shelves are being stocked.' }</div> }
                            <div className="clothing-store-grid">
                                { canRemove &&
                                    <div className="clothing-store-tile" title="Remove" onClick={ () => clearType(railType) }>
                                        <div className="clothing-store-tile-well"><AvatarEditorIcon icon="clear" /></div>
                                        <div className="clothing-store-tile-body">
                                            <div className="clothing-store-tile-name">Remove</div>
                                            <div className="clothing-store-tile-note">nothing worn</div>
                                        </div>
                                    </div> }
                                { visibleItems.map(item => (
                                    <StoreTile key={ item.listing.id } item={ item } active={ tried.has(item.listing.id) } owned={ isOwned(item) } onClick={ () => (tried.has(item.listing.id) ? takeOff(item.listing.id) : tryOn(item)) } />)) }
                            </div>
                        </div>
                    </div>
                    <div className="clothing-store-side">
                        <div className="clothing-store-preview">
                            <LayoutAvatarImageView figure={ figure.getFigureString() } gender={ gender } direction={ figure.direction } scale={ 2 } animate />
                            <AvatarEditorIcon className="clothing-store-spotlight" icon="spotlight" />
                            <div className="clothing-store-shadow" />
                            <div className="clothing-store-arrows">
                                <AvatarEditorIcon pointer icon="arrow-left" onClick={ () => rotate(1) } />
                                <AvatarEditorIcon pointer icon="arrow-right" onClick={ () => rotate(-1) } />
                            </div>
                        </div>
                        <div className="clothing-store-fitting">
                            <div className="clothing-store-fitting-head">
                                <span>Trying on</span>
                                { (tried.size > 0) &&
                                    <span className="clothing-store-reset" onClick={ reset }>Reset</span> }
                            </div>
                            <div className="clothing-store-fitting-list">
                                { (tried.size === 0) &&
                                    <div className="clothing-store-fitting-hint">Click a piece to see it on you. Owned pieces are free to try.</div> }
                                { Array.from(tried.keys()).map(id =>
                                {
                                    const item = shelfById.get(id);

                                    if(!item) return null;

                                    const owned = isOwned(item);

                                    return (
                                        <div key={ id } className="clothing-store-fitting-row">
                                            <div style={ { minWidth: 0 } }>
                                                <div className="clothing-store-fitting-name">{ item.name }</div>
                                                { (!owned && IsLtdListing(item.listing)) &&
                                                    <div className="clothing-store-fitting-note">LTD token, lands in your backpack</div> }
                                            </div>
                                            { owned
                                                ? <div className="clothing-store-fitting-price is-owned">Owned</div>
                                                : <div className="clothing-store-fitting-price"><LayoutCurrencyIcon type={ -1 } />{ LocalizeFormattedNumber(item.listing.price) }</div> }
                                        </div>);
                                }) }
                            </div>
                            { notice &&
                                <div className={ `clothing-store-notice${ notice.error ? ' is-error' : '' }` }>{ notice.text }</div> }
                            <div className="clothing-store-balance">
                                <span>Your balance</span>
                                <span><LayoutCurrencyIcon type={ -1 } />{ LocalizeFormattedNumber(purse ? purse.credits : 0) }</span>
                            </div>
                            <div className={ `clothing-store-buy${ !basket.length ? ' is-disabled' : '' }${ armed ? ' is-armed' : '' }${ pending ? ' is-pending' : '' }` } onClick={ buy }>
                                { buyLabel }
                                { (basket.length > 0) &&
                                    <span className="clothing-store-buy-total"><LayoutCurrencyIcon type={ -1 } />{ LocalizeFormattedNumber(total) }</span> }
                            </div>
                        </div>
                    </div>
                </div>
            </NitroCardContentView>
        </NitroCardView>
    );
}
