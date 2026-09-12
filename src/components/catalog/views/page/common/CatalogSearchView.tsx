import { FC, useEffect, useState } from 'react';
import { FaSearch, FaTimes } from 'react-icons/fa';
import { CatalogPage, FilterCatalogNode, GetSessionDataManager, ICatalogNode, ICatalogPage, IPurchasableOffer, LocalizeText, PageLocalization, SearchOffer, SearchResult } from '../../../../../api';
import { SendRpCatalogSearch, SubscribeRpCatalogSearch } from '../../../../../api/rp-catalog/RpCatalogSearchMessages';
import { Button, Flex } from '../../../../../common';
import { useCatalog } from '../../../../../hooks';

export const CatalogSearchView: FC<{}> = props =>
{
    const [ searchValue, setSearchValue ] = useState('');
    const { currentType = null, rootNode = null, offersToNodes = null, searchResult = null, setSearchResult = null, setCurrentPage = null } = useCatalog();

    // pixelrp: the search runs on the server.
    //
    // The stock version scanned FurnitureData client-side and then threw every
    // match away, because it proves an item is purchasable by looking its OFFER
    // id up in a map the catalog index builds - and every catalog row in this
    // hotel carries offer_id -1, which the emulator skips when filling that
    // map. The map is empty, so nothing survived except the category names
    // FilterCatalogNode returns. Typing a classname could never find anything.
    //
    // The emulator has the whole catalog in memory with each item's real page
    // beside it, which is both the correct place to ask and the only place the
    // answer exists: the client is never sent more than the page it is looking
    // at. Each hit comes back with that page, which is what makes it buyable.
    useEffect(() =>
    {
        const search = searchValue?.trim();

        if(!search || !search.length)
        {
            setSearchResult(null);

            return;
        }

        // Typing is not a query. The debounce is the server's protection as
        // much as the box's responsiveness.
        const timeout = setTimeout(() => SendRpCatalogSearch(search), 300);

        return () => clearTimeout(timeout);
    }, [ searchValue, setSearchResult ]);

    useEffect(() =>
    {
        return SubscribeRpCatalogSearch((query, hits) =>
        {
            // A slow answer must not overwrite a newer question: the query
            // rides back with the result so a stale one can be dropped.
            if(query.trim().toLowerCase() !== searchValue.trim().toLowerCase()) return;

            const offers: IPurchasableOffer[] = [];

            for(const hit of hits)
            {
                const furniData = hit.isWallItem
                    ? GetSessionDataManager().getWallItemData(hit.furnitureId)
                    : GetSessionDataManager().getFloorItemData(hit.furnitureId);

                // No FurnitureData means the client cannot draw it, which is a
                // catalog row pointing at furni this client build does not
                // have. Skipping is the honest answer; a blank tile is not.
                if(!furniData) continue;

                offers.push(new SearchOffer(hit.pageId, hit.itemId, hit.name, hit.className,
                    hit.costCredits, hit.costPixels, hit.costDiamonds, furniData));
            }

            const nodes: ICatalogNode[] = [];

            FilterCatalogNode(query.toLowerCase().replace(/\s+/g, ''), [], rootNode, nodes);

            setSearchResult(new SearchResult(query, offers, nodes.filter(node => (node.isVisible))));
            setCurrentPage((new CatalogPage(-1, 'default_3x3', new PageLocalization([], []), offers, false, 1) as ICatalogPage));
        });
    }, [ searchValue, rootNode, setSearchResult, setCurrentPage ]);

    return (
        <Flex gap={ 1 }>
            <Flex fullWidth alignItems="center" position="relative">
                <input type="text" className="form-control form-control-sm" placeholder={ LocalizeText('generic.search') } value={ searchValue } onChange={ event => setSearchValue(event.target.value) } />
            </Flex>
            { (!searchValue || !searchValue.length) &&
                <Button variant="primary" className="catalog-search-button">
                    <FaSearch className="fa-icon" />
                </Button> }
            { searchValue && !!searchValue.length &&
                <Button variant="primary" className="catalog-search-button" onClick={ event => setSearchValue('') }>
                    <FaTimes className="fa-icon" />
                </Button> }
        </Flex>
    );
}
