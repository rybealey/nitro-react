import { GetCatalogPageComposer } from '@nitrots/nitro-renderer';
import { FC, MouseEvent, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FaCaretDown, FaCaretRight, FaTimes } from 'react-icons/fa';
import { CatalogType, ICatalogNode, NotificationBubbleType, SendMessageComposer } from '../../../../../api';
import { MoveCatalogFurni } from '../../../../../api/rp-catalog/RpCatalogMoveMessages';
import { CanEditShop } from '../../../../../api/rp-rights/RpRanks';
import { useCatalog, useNotification } from '../../../../../hooks';
import { CatalogIconView } from '../../catalog-icon/CatalogIconView';

// The layouts that are a plain grid of furni - the only ones a listing can
// leave or join. Matches FurniLayouts in RpCatalogMoveFurniEvent.
const FURNI_LAYOUTS = [ 'default_3x3', 'default_3x3_color_grouping' ];

const PANEL_WIDTH = 260;

const visibleChildren = (node: ICatalogNode): ICatalogNode[] => (node?.children ?? []).filter(child => child.isVisible);

// The tab a page sits under: its ancestor just below the index's root.
const tabOf = (node: ICatalogNode, rootNode: ICatalogNode): ICatalogNode =>
{
    let current = node;

    while(current?.parent && (current.parent !== rootNode)) current = current.parent;

    return current ?? null;
}

/**
 * Staff move the selected furni to another shop category.
 *
 * Move opens the shop's own categories straight away, tab by tab, with a
 * search box over them that finds a category by name in any tab; the
 * category clicked is where the listing goes - no second step. The picker
 * stays open until the server answers, so a refused move says why where the
 * choice was made. Same gate as the shop rename (CanEditShop, Builder up).
 *
 * Kept out of useCatalog on purpose: that hook is shared through use-between,
 * which runs its effects inside every setter, and state added there has broken
 * the shop more than once. All this reads from it is the index and the offer.
 */
export const CatalogMoveFurniView: FC<{}> = props =>
{
    const { currentOffer = null, currentPage = null, currentType = null, rootNode = null, getNodeById = null } = useCatalog();
    const { showSingleBubble = null } = useNotification();
    const [ open, setOpen ] = useState(false);
    const [ position, setPosition ] = useState<{ left: number; top: number }>(null);
    const [ tab, setTab ] = useState<ICatalogNode>(null);
    const [ expanded, setExpanded ] = useState<Set<ICatalogNode>>(new Set());
    const [ moving, setMoving ] = useState(false);
    const [ error, setError ] = useState<string>(null);
    const [ query, setQuery ] = useState('');
    const chipRef = useRef<HTMLDivElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);
    const cancelRef = useRef<() => void>(null);

    const sourcePageId = (currentOffer?.page?.pageId ?? -1);
    const canMove = (CanEditShop() && !!currentOffer && (sourcePageId > 0) && (currentType === CatalogType.NORMAL) &&
        (FURNI_LAYOUTS.indexOf(currentOffer.page.layoutCode) >= 0));

    const tabs = useMemo(() => visibleChildren(rootNode), [ rootNode ]);

    const close = () =>
    {
        cancelRef.current?.();
        cancelRef.current = null;
        setOpen(false);
        setMoving(false);
        setError(null);
        setQuery('');
    }

    // A new selection is a different furni; the picker was for the last one.
    useEffect(() =>
    {
        close();
    }, [ currentOffer ]);

    useEffect(() => () => cancelRef.current?.(), []);

    useEffect(() =>
    {
        if(!open) return;

        const onPointerDown = (event: PointerEvent) =>
        {
            const target = (event.target as Node);

            if(panelRef.current?.contains(target) || chipRef.current?.contains(target)) return;

            close();
        }

        const onKeyDown = (event: KeyboardEvent) =>
        {
            if(event.key === 'Escape') close();
        }

        document.addEventListener('pointerdown', onPointerDown, true);
        document.addEventListener('keydown', onKeyDown);

        return () =>
        {
            document.removeEventListener('pointerdown', onPointerDown, true);
            document.removeEventListener('keydown', onKeyDown);
        }
    }, [ open ]);

    if(!canMove) return null;

    const begin = (event: MouseEvent<HTMLDivElement>) =>
    {
        event.stopPropagation();

        if(open)
        {
            close();

            return;
        }

        // Opened on the furni's own tab, with the way down to its category
        // unfolded, so the categories beside it are one look away.
        const here = getNodeById(sourcePageId, rootNode);
        const path = new Set<ICatalogNode>();

        for(let node = here?.parent; (node && (node !== rootNode)); node = node.parent) path.add(node);

        const rect = chipRef.current.getBoundingClientRect();

        setPosition({
            left: Math.max(8, Math.min((rect.right - PANEL_WIDTH), (window.innerWidth - PANEL_WIDTH - 8))),
            top: Math.min((rect.bottom + 4), (window.innerHeight - 200))
        });
        setTab((here && tabOf(here, rootNode)) || tabs[0] || null);
        setExpanded(path);
        setError(null);
        setQuery('');
        setOpen(true);
    }

    const toggle = (node: ICatalogNode) => setExpanded(previous =>
    {
        const next = new Set(previous);

        if(next.has(node)) next.delete(node);
        else next.add(node);

        return next;
    });

    const moveTo = (node: ICatalogNode) =>
    {
        if(moving || (node.pageId < 0) || (node.pageId === sourcePageId)) return;

        const offer = currentOffer;
        const fromPageId = sourcePageId;
        const caption = node.localization;

        setMoving(true);
        setError(null);

        cancelRef.current = MoveCatalogFurni(offer.offerId, node.pageId, result =>
        {
            cancelRef.current = null;
            setMoving(false);

            if(!result.moved)
            {
                setError(result.message || 'That move did not go through.');

                return;
            }

            setOpen(false);
            showSingleBubble(result.message || `Moved to ${ caption }.`, NotificationBubbleType.INFORMATION);

            // The page it left is asked for again, through the shop's normal
            // page handler, so the moved furni drops off the grid. Not during
            // a search: those results are their own page.
            if(currentPage && (currentPage.pageId === fromPageId)) SendMessageComposer(new GetCatalogPageComposer(fromPageId, -1, currentType));
        });
    }

    const renderNodes = (nodes: ICatalogNode[], depth: number) => nodes.map((node, index) =>
    {
        const children = visibleChildren(node);
        const isOpen = expanded.has(node);
        const isHere = (node.pageId === sourcePageId);
        const indent = { paddingLeft: (4 + (depth * 12)) };

        // Headings and dividers come through with no page to open.
        if(node.pageId < 0)
        {
            if(!node.localization) return null;

            return <div key={ index } className="rp-catalog-move-heading" style={ indent }>{ node.localization }</div>;
        }

        return (
            <div key={ index }>
                <div className={ 'rp-catalog-move-row' + (isHere ? ' is-here' : '') + (moving ? ' is-busy' : '') } style={ indent }
                    onClick={ () => moveTo(node) }>
                    <span className="rp-catalog-move-caret" onClick={ event =>
                    {
                        if(!children.length) return;

                        event.stopPropagation();
                        toggle(node);
                    } }>
                        { (children.length > 0) && (isOpen ? <FaCaretDown /> : <FaCaretRight />) }
                    </span>
                    <span className="rp-catalog-move-icon"><CatalogIconView icon={ node.iconId } /></span>
                    <span className="rp-catalog-move-caption">{ node.localization }</span>
                    { isHere && <span className="rp-catalog-move-here">here</span> }
                </div>
                { isOpen && (children.length > 0) && renderNodes(children, (depth + 1)) }
            </div>
        );
    });

    // Typing searches every category in every tab by name; each hit shows
    // where it sits, since two shelves can share a name (Christmas ...).
    const search = query.trim().toLowerCase();
    const results: { node: ICatalogNode; path: string }[] = [];

    const collect = (nodes: ICatalogNode[], trail: string[]) =>
    {
        for(const node of nodes)
        {
            if(results.length >= 60) return;
            if(node.pageId < 0) continue;

            if((node.localization ?? '').toLowerCase().includes(search)) results.push({ node, path: trail.join(' > ') });

            collect(visibleChildren(node), [ ...trail, node.localization ]);
        }
    }

    if(search.length) for(const each of tabs) collect(visibleChildren(each), [ each.localization ]);

    const renderResults = () =>
    {
        if(!results.length) return <div className="rp-catalog-move-empty">No category called that.</div>;

        return results.map(({ node, path }, index) =>
        {
            const isHere = (node.pageId === sourcePageId);

            return (
                <div key={ index } className={ 'rp-catalog-move-row is-result' + (isHere ? ' is-here' : '') + (moving ? ' is-busy' : '') }
                    onClick={ () => moveTo(node) }>
                    <span className="rp-catalog-move-icon"><CatalogIconView icon={ node.iconId } /></span>
                    <span className="rp-catalog-move-caption">
                        { node.localization }
                        <span className="rp-catalog-move-path">{ path }</span>
                    </span>
                    { isHere && <span className="rp-catalog-move-here">here</span> }
                </div>
            );
        });
    }

    return (
        <>
            <div ref={ chipRef } className={ 'rp-catalog-move-chip' + (open ? ' is-open' : '') } title="Move to another category" onClick={ begin }>Move</div>
            { open && position && createPortal(
                <div ref={ panelRef } className="rp-catalog-move" style={ { left: position.left, top: position.top, width: PANEL_WIDTH } }>
                    <div className="rp-catalog-move-header">
                        <input type="text" className="rp-catalog-move-search" placeholder="Search categories" autoFocus
                            value={ query } onChange={ event => setQuery(event.target.value) } />
                        <FaTimes className="rp-catalog-move-close" onClick={ close } />
                    </div>
                    { !search.length &&
                        <div className="rp-catalog-move-tabs">
                            { tabs.map((node, index) =>
                                <div key={ index } className={ 'rp-catalog-move-tab' + ((node === tab) ? ' is-active' : '') }
                                    onClick={ () => setTab(node) }>{ node.localization }</div>) }
                        </div> }
                    <div className="rp-catalog-move-list">
                        { search.length ? renderResults() : (tab && renderNodes(visibleChildren(tab), 0)) }
                    </div>
                    { (moving || error) &&
                        <div className={ 'rp-catalog-move-status' + (error ? ' is-error' : '') }>{ error ?? 'Moving...' }</div> }
                </div>, document.body) }
        </>
    );
}
