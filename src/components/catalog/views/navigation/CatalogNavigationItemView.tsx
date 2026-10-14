import { FC, MouseEvent, useEffect, useRef } from 'react';
import { FaCaretDown, FaCaretUp, FaRegStar, FaStar } from 'react-icons/fa';
import { ICatalogNode } from '../../../../api';
import { SetCatalogFavouritesOpen, ToggleCatalogFavourite, useCatalogFavourites } from '../../../../api/rp-catalog/RpCatalogFavouritesMessages';
import { Base, LayoutGridItem, Text } from '../../../../common';
import { useCatalog } from '../../../../hooks';
import { CatalogIconView } from '../catalog-icon/CatalogIconView';
import { CatalogNavigationSetView } from './CatalogNavigationSetView';

export interface CatalogNavigationItemViewProps
{
    node: ICatalogNode;
    child?: boolean;
}

// pixelrp: the page link of a Favourites category (256_CatalogFavourites).
// It is drawn as the player's starred categories, not as a page of its own.
const FAVOURITES_LINK = 'favourites';

// pixelrp: a category's star - shown when the row is hovered, gold while it is
// a favourite. Clicking it stars or unstars and does not open the category.
const FavouriteStarView: FC<{ pageId: number; favourite: boolean }> = props =>
{
    const { pageId = -1, favourite = false } = props;

    const toggle = (event: MouseEvent<HTMLSpanElement>) =>
    {
        event.stopPropagation();

        ToggleCatalogFavourite(pageId);
    }

    return (
        <span className={ 'rp-fav-star' + (favourite ? ' is-fav' : '') } title={ favourite ? 'Remove from favourites' : 'Add to favourites' } onClick={ toggle }>
            { favourite ? <FaStar /> : <FaRegStar /> }
        </span>
    );
}

// pixelrp: one starred category inside the Favourites category. It opens the
// real category, in whatever tab it lives in, the way a search path row does.
const FavouriteRowView: FC<{ node: ICatalogNode }> = props =>
{
    const { node = null } = props;
    const { activateNode = null, activeNodes = [] } = useCatalog();
    const isOpenPage = ((activeNodes.length > 0) && (activeNodes[activeNodes.length - 1] === node));
    const rowClasses = [ 'nav-row', 'is-child' ];

    if(isOpenPage) rowClasses.push('is-page');

    return (
        <Base className="nitro-catalog-navigation-section">
            <LayoutGridItem gap={ 1 } column={ false } itemActive={ isOpenPage } onClick={ event => activateNode(node) } className="inset" classNames={ rowClasses }>
                <span className="nav-ico"><CatalogIconView icon={ node.iconId } /></span>
                <Text grow truncate>{ node.localization }</Text>
                <FavouriteStarView pageId={ node.pageId } favourite={ true } />
            </LayoutGridItem>
        </Base>
    );
}

export const CatalogNavigationItemView: FC<CatalogNavigationItemViewProps> = props =>
{
    const { node = null, child = false } = props;
    const { activateNode = null, activeNodes = [], rootNode = null, getNodeById = null } = useCatalog();
    const { favourites = [], folderOpen = true, isFavourite = null } = useCatalogFavourites();
    const rowRef = useRef<HTMLDivElement>();
    // the page that is open - the last of the active path, not its ancestors
    const isOpenPage = (!!node && (activeNodes.length > 0) && (activeNodes[activeNodes.length - 1] === node));

    // pixelrp: the open page's row is brought into view. A category chosen from
    // the search results, or reached by a Buy link, opens deep in a tree the
    // list may be scrolled well away from; 'nearest' leaves a row that is
    // already on screen exactly where it is, so browsing by hand never jumps.
    useEffect(() =>
    {
        if(isOpenPage && rowRef.current) rowRef.current.scrollIntoView({ block: 'nearest' });
    }, [ isOpenPage ]);

    // pixelrp: a page whose server-side page_link is "divider" is a non-clickable
    // visual separator in the navigation list, not a real catalog page.
    if(node?.pageName === 'divider')
    {
        return <Base className="nitro-catalog-navigation-divider" />;
    }

    // pixelrp: page_link "heading" is a group label - its caption, padded, over
    // the categories that follow it. Like a divider it is a disabled page, so
    // it arrives with no page id and can neither be opened nor searched.
    if(node?.pageName === 'heading')
    {
        return <Base className="nitro-catalog-navigation-heading">{ node.localization }</Base>;
    }

    // pixelrp: the row's look (Furni Shop canvas, "Modern categories"): an
    // open category is filled orange, the open page is the grey highlight,
    // and a sub-category row sits indented under its parent.
    const rowClasses = [ 'nav-row' ];

    // how deep the row sits under its tab: 1 a category, 2 a sub-category,
    // 3+ a page inside one - the third level is drawn a touch smaller
    let depth = 0;

    for(let at = node; at?.parent && (at.parent.pageName !== 'root'); at = at.parent) depth++;

    if(child) rowClasses.push('is-child');
    if(child && (depth >= 3)) rowClasses.push('is-grand');
    if(isOpenPage) rowClasses.push('is-page');
    else if(node.isBranch && node.isOpen && node.isActive) rowClasses.push('is-open-branch');

    // pixelrp: Favourites folds like a category with sub-categories, its
    // sub-categories being the player's stars. Opening it also opens its own
    // page, which says how to add one. A star whose category this player cannot
    // see (since hidden, or under a tab above their rank) is left out.
    if(node.pageName === FAVOURITES_LINK)
    {
        const starred = (rootNode ? favourites.map(pageId => getNodeById(pageId, rootNode)) : [])
            .filter(found => (found && found.isVisible && (found.pageName !== FAVOURITES_LINK)));

        return (
            <Base className="nitro-catalog-navigation-section">
                <LayoutGridItem innerRef={ rowRef } gap={ 1 } column={ false } itemActive={ node.isActive } onClick={ event =>
                {
                    SetCatalogFavouritesOpen(!folderOpen);
                    activateNode(node);
                } } className={ child ? 'inset' : '' } classNames={ rowClasses }>
                    <span className="nav-ico"><CatalogIconView icon={ node.iconId } /></span>
                    <Text grow truncate>{ node.localization }</Text>
                    { folderOpen ? <FaCaretUp className="fa-icon" /> : <FaCaretDown className="fa-icon" /> }
                </LayoutGridItem>
                { folderOpen && starred.map(found => <FavouriteRowView key={ found.pageId } node={ found } />) }
                { folderOpen && !starred.length &&
                    <Base className="nitro-catalog-navigation-section">
                        <div className="rp-fav-empty">Hover over a category and click its star to add it here.</div>
                    </Base> }
            </Base>
        );
    }

    return (
        <Base className="nitro-catalog-navigation-section">
            <LayoutGridItem innerRef={ rowRef } gap={ 1 } column={ false } itemActive={ node.isActive } onClick={ event => activateNode(node) } className={ child ? 'inset' : '' } classNames={ rowClasses }>
                <span className="nav-ico"><CatalogIconView icon={ node.iconId } /></span>
                <Text grow truncate>{ node.localization }</Text>
                { (node.pageId > 0) && <FavouriteStarView pageId={ node.pageId } favourite={ isFavourite(node.pageId) } /> }
                { node.isBranch &&
                    <>
                        { node.isOpen && <FaCaretUp className="fa-icon" /> }
                        { !node.isOpen && <FaCaretDown className="fa-icon" /> }
                    </> }
            </LayoutGridItem>
            { node.isOpen && node.isBranch &&
                <CatalogNavigationSetView node={ node } child={ true } /> }
        </Base>
    );
}
