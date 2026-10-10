import { FC, useEffect, useRef, useState } from 'react';
import { AvatarEditorGridPartItem, GetConfiguration } from '../../../../api';
import { LayoutGridItem, LayoutGridItemProps } from '../../../../common';
import { AvatarEditorIcon } from '../AvatarEditorIcon';

/** Watch a tile for being on screen; returns the way to stop. */
export type ObserveTile = (element: Element, item: AvatarEditorGridPartItem) => () => void;

export interface AvatarEditorFigureSetItemViewProps extends LayoutGridItemProps
{
    partItem: AvatarEditorGridPartItem;
    observeTile?: ObserveTile;
}

export const AvatarEditorFigureSetItemView: FC<AvatarEditorFigureSetItemViewProps> = props =>
{
    const { partItem = null, observeTile = null, children = null, ...rest } = props;
    const [ updateId, setUpdateId ] = useState(-1);
    const elementRef = useRef<HTMLDivElement>(null);

    const hcDisabled = GetConfiguration<boolean>('hc.disabled', false);

    useEffect(() =>
    {
        const rerender = () => setUpdateId(prevValue => (prevValue + 1));

        partItem.notify = rerender;

        return () => partItem.notify = null;
    }, [ partItem ]);

    // pixelrp: the thumbnail is drawn while the tile is on screen.
    useEffect(() =>
    {
        if(!observeTile || !elementRef.current) return;

        return observeTile(elementRef.current, partItem);
    }, [ observeTile, partItem ]);

    return (
        <LayoutGridItem innerRef={ elementRef } itemImage={ (partItem.isClear ? undefined : partItem.imageUrl) } itemActive={ partItem.isSelected } { ...rest }>
            { /* pixelrp: clothing is not club-gated - no HC badge */ }
            { partItem.isClear && <AvatarEditorIcon icon="clear" /> }
            { partItem.isSellable && <AvatarEditorIcon icon="sellable" position="absolute" className="end-1 bottom-1" /> }
            { children }
        </LayoutGridItem>
    );
}
