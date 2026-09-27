import { FC, useMemo } from 'react';
import { ICatalogNode } from '../../../../../api';
import { Text, TextProps } from '../../../../../common';
import { useCatalog } from '../../../../../hooks';

/**
 * pixelrp: where a search hit is sold - its category and the sub-categories
 * down to its page, e.g. "Designer › Kitchen › Modern Kitchen".
 *
 * Only on the results page. A clicked hit's offer carries its real page
 * (requestSearchOffer loads it), while the page on screen is still the results
 * page, id -1 - on a normal page the path is the navigation beside it.
 *
 * The search runs inside one tab, so the tab is left off. A page the index
 * does not hold (its chain to the tab did not survive the rank walk, see
 * RpCatalogSearchEvent) shows nothing rather than a guess.
 */
export const CatalogSearchPathWidgetView: FC<TextProps> = props =>
{
    const { currentPage = null, currentOffer = null, rootNode = null, getNodeById = null } = useCatalog();

    const path = useMemo(() =>
    {
        if(!currentPage || (currentPage.pageId !== -1) || !currentOffer?.page || !rootNode) return null;

        const names: string[] = [];
        let node: ICatalogNode = getNodeById(currentOffer.page.pageId, rootNode);

        // Up to the tab, which is the node whose parent is the root.
        while(node && node.parent && (node.parent !== rootNode))
        {
            names.unshift(node.localization);
            node = node.parent;
        }

        return (names.length ? names.join(' › ') : null);
    }, [ currentPage, currentOffer, rootNode, getNodeById ]);

    if(!path) return null;

    return <Text small truncate variant="muted" title={ path } { ...props }>{ path }</Text>;
}
