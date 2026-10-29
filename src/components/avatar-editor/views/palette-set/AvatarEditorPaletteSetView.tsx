import { FC, useCallback, useEffect, useRef } from 'react';
import { AvatarEditorGridColorItem, CategoryData, CustomColorHexFromId, IAvatarEditorCategoryModel } from '../../../../api';
import { AutoGrid, LayoutGridItem } from '../../../../common';
import { AvatarEditorPaletteSetItem } from './AvatarEditorPaletteSetItemView';

export interface AvatarEditorPaletteSetViewProps
{
    model: IAvatarEditorCategoryModel;
    category: CategoryData;
    paletteSet: AvatarEditorGridColorItem[];
    paletteIndex: number;
    // pixelrp: the Custom tile, first in the grid - it opens the color picker
    // (AvatarEditorCustomColorView). customVersion changes as a custom color
    // is dragged, so the tile shows the color being made.
    customEnabled?: boolean;
    customOpen?: boolean;
    customVersion?: number;
    onCustomClick?: (paletteIndex: number) => void;
    registerCustomTile?: (paletteIndex: number, element: HTMLElement) => void;
}

export const AvatarEditorPaletteSetView: FC<AvatarEditorPaletteSetViewProps> = props =>
{
    const { model = null, category = null, paletteSet = [], paletteIndex = -1, customEnabled = false, customOpen = false, onCustomClick = null, registerCustomTile = null } = props;
    const elementRef = useRef<HTMLDivElement>(null);
    const customTileRef = useRef<HTMLDivElement>(null);

    const selectColor = useCallback((item: AvatarEditorGridColorItem) =>
    {
        const index = paletteSet.indexOf(item);

        if(index === -1) return;

        model.selectColor(category.name, index, paletteIndex);
    }, [ model, category, paletteSet, paletteIndex ]);

    useEffect(() =>
    {
        if(!model || !category || !elementRef || !elementRef.current) return;

        elementRef.current.scrollTop = 0;
    }, [ model, category ]);

    useEffect(() =>
    {
        if(registerCustomTile) registerCustomTile(paletteIndex, customTileRef.current);
    });

    const customColorId = (customEnabled ? category.getCustomColorId(paletteIndex) : 0);
    const customHex = (customColorId ? CustomColorHexFromId(customColorId) : null);
    const customLabel = (customHex ? `Custom color ${ customHex }, click to edit` : 'Pick a custom color');

    return (
        <AutoGrid innerRef={ elementRef } gap={ 1 } columnCount={ 5 } columnMinWidth={ 30 }>
            { customEnabled &&
                <LayoutGridItem innerRef={ customTileRef } itemHighlight itemActive={ (customOpen || !!customColorId) } itemColor={ customHex } classNames={ [ 'custom-color-tile', 'clear-bg', (customHex ? 'is-filled' : 'is-empty') ] }
                    title={ customLabel } aria-label={ customLabel } aria-expanded={ customOpen }
                    onClick={ event => (onCustomClick && onCustomClick(paletteIndex)) }>
                    { customHex ? <span className="custom-color-badge" /> : <span className="custom-color-plus" /> }
                </LayoutGridItem> }
            { (paletteSet.length > 0) && paletteSet.map((item, index) =>
                <AvatarEditorPaletteSetItem key={ index } colorItem={ item } onClick={ event => selectColor(item) } />) }
        </AutoGrid>
    );
}
