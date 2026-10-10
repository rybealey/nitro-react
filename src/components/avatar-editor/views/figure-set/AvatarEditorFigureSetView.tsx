import { Dispatch, FC, SetStateAction, useCallback, useEffect, useRef, useState } from 'react';
import { AvatarEditorGridPartItem, CategoryData, IAvatarEditorCategoryModel } from '../../../../api';
import { AutoGrid } from '../../../../common';
import { AvatarEditorFigureSetItemView, ObserveTile } from './AvatarEditorFigureSetItemView';

export interface AvatarEditorFigureSetViewProps
{
    model: IAvatarEditorCategoryModel;
    category: CategoryData;
    setMaxPaletteCount: Dispatch<SetStateAction<number>>;
}

// pixelrp: a little ahead of the scroll, so tiles are drawn before they show.
const PREFETCH_MARGIN = '120px 0px';

// The element the tiles scroll in - the grid itself in Choose Your Look, but
// whichever ancestor it is, so "on screen" means what the player sees. Null
// (the viewport) when nothing scrolls.
const ScrollParent = (element: HTMLElement): HTMLElement =>
{
    for(let node = element; node; node = node.parentElement)
    {
        const overflow = getComputedStyle(node).overflowY;

        if((overflow === 'auto') || (overflow === 'scroll')) return node;
    }

    return null;
};

export const AvatarEditorFigureSetView: FC<AvatarEditorFigureSetViewProps> = props =>
{
    const { model = null, category = null, setMaxPaletteCount = null } = props;
    const elementRef = useRef<HTMLDivElement>(null);
    // pixelrp: one observer for the grid, telling each part item whether its
    // tile is on screen - a thumbnail is only drawn while it is
    // (AvatarEditorGridPartItem).
    const [ observeTile, setObserveTile ] = useState<ObserveTile>(null);

    useEffect(() =>
    {
        const tiles: Map<Element, AvatarEditorGridPartItem> = new Map();
        const observer = new IntersectionObserver(entries =>
        {
            for(const entry of entries)
            {
                const item = tiles.get(entry.target);

                if(item) item.visible = entry.isIntersecting;
            }
        }, { root: ScrollParent(elementRef.current), rootMargin: PREFETCH_MARGIN });

        setObserveTile(() => (element: Element, item: AvatarEditorGridPartItem) =>
        {
            tiles.set(element, item);
            observer.observe(element);

            return () =>
            {
                observer.unobserve(element);
                tiles.delete(element);
                item.visible = false;
            };
        });

        return () => observer.disconnect();
    }, []);

    const selectPart = useCallback((item: AvatarEditorGridPartItem) =>
    {
        const index = category.parts.indexOf(item);

        if(index === -1) return;

        model.selectPart(category.name, index);

        const partItem = category.getCurrentPart();

        setMaxPaletteCount(partItem.maxColorIndex || 1);
    }, [ model, category, setMaxPaletteCount ]);

    useEffect(() =>
    {
        if(!model || !category || !elementRef || !elementRef.current) return;

        elementRef.current.scrollTop = 0;
    }, [ model, category ]);

    return (
        <AutoGrid innerRef={ elementRef } columnCount={ 3 } columnMinHeight={ 50 }>
            { (category.parts.length > 0) && category.parts.map((item, index) =>
                <AvatarEditorFigureSetItemView key={ index } partItem={ item } observeTile={ observeTile } onClick={ event => selectPart(item) } />) }
        </AutoGrid>
    );
}
