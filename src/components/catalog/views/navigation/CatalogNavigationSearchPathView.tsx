import { FC, useMemo } from 'react';
import { FaCaretUp } from 'react-icons/fa';
import { ICatalogNode } from '../../../../api';
import { Base, LayoutGridItem, Text } from '../../../../common';
import { useCatalog } from '../../../../hooks';
import { CatalogIconView } from '../catalog-icon/CatalogIconView';

/**
 * pixelrp: in the search results, where the chosen furni is sold - its
 * category and the sub-categories down to its page, drawn in the navigation
 * list as the tree draws them, the page highlighted:
 *
 *     Designer
 *       Kitchen
 *         Modern Kitchen
 *
 * The results stay in the middle; choosing a row opens that page, the way a
 * category matched by the search does (activateNode ends the search).
 *
 * A clicked hit's offer carries its real page (requestSearchOffer loads it),
 * while the page on screen is still the results page, id -1. The search runs
 * inside one tab, so the tab is left off. A page the index does not hold (its
 * chain to the tab did not survive the rank walk, see RpCatalogSearchEvent)
 * shows nothing rather than a guess.
 */
export const CatalogNavigationSearchPathView: FC<{ divider?: boolean }> = props =>
{
    const { divider = false } = props;
    const { currentPage = null, currentOffer = null, rootNode = null, getNodeById = null, activateNode = null } = useCatalog();

    const path = useMemo(() =>
    {
        if(!currentPage || (currentPage.pageId !== -1) || !currentOffer?.page || !rootNode) return [];

        const nodes: ICatalogNode[] = [];
        let node: ICatalogNode = getNodeById(currentOffer.page.pageId, rootNode);

        // Up to the tab, which is the node whose parent is the root.
        while(node && node.parent && (node.parent !== rootNode))
        {
            nodes.unshift(node);
            node = node.parent;
        }

        return nodes;
    }, [ currentPage, currentOffer, rootNode, getNodeById ]);

    if(!path.length) return null;

    // Nested sections, so each level is inset under the one above it exactly
    // as an opened branch is.
    const row = (index: number) =>
    {
        if(index >= path.length) return null;

        const node = path[index];
        const isPage = (index === (path.length - 1));

        return (
            <Base className="nitro-catalog-navigation-section">
                <LayoutGridItem gap={ 1 } column={ false } itemActive={ isPage } onClick={ event => activateNode(node) }>
                    <CatalogIconView icon={ node.iconId } />
                    <Text grow truncate>{ node.localization }</Text>
                    { !isPage && <FaCaretUp className="fa-icon" /> }
                </LayoutGridItem>
                { row(index + 1) }
            </Base>
        );
    };

    // Set apart from the categories the search matched by name, below it.
    return (
        <>
            { row(0) }
            { divider && <Base className="nitro-catalog-navigation-divider" /> }
        </>
    );
}
