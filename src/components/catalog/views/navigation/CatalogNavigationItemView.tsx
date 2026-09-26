import { FC, useEffect, useRef } from 'react';
import { FaCaretDown, FaCaretUp } from 'react-icons/fa';
import { ICatalogNode } from '../../../../api';
import { Base, LayoutGridItem, Text } from '../../../../common';
import { useCatalog } from '../../../../hooks';
import { CatalogIconView } from '../catalog-icon/CatalogIconView';
import { CatalogNavigationSetView } from './CatalogNavigationSetView';

export interface CatalogNavigationItemViewProps
{
    node: ICatalogNode;
    child?: boolean;
}

export const CatalogNavigationItemView: FC<CatalogNavigationItemViewProps> = props =>
{
    const { node = null, child = false } = props;
    const { activateNode = null, activeNodes = [] } = useCatalog();
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

    return (
        <Base className="nitro-catalog-navigation-section">
            <LayoutGridItem innerRef={ rowRef } gap={ 1 } column={ false } itemActive={ node.isActive } onClick={ event => activateNode(node) } className={ child ? 'inset' : '' }>
                <CatalogIconView icon={ node.iconId } />
                <Text grow truncate>{ node.localization }</Text>
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
