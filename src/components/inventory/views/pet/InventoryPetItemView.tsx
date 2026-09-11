import { MouseEventType } from '@nitrots/nitro-renderer';
import { FC, MouseEvent, PropsWithChildren, useState } from 'react';
import { attemptPetPlacement, IPetItem, UnseenItemCategory } from '../../../../api';
import { LayoutGridItem, LayoutPetImageView } from '../../../../common';
import { useInventoryPets, useInventoryUnseenTracker } from '../../../../hooks';

export const InventoryPetItemView: FC<PropsWithChildren<{ petItem: IPetItem }>> = props =>
{
    const { petItem = null, children = null, ...rest } = props;
    const [ isMouseDown, setMouseDown ] = useState(false);
    const { selectedPet = null, setSelectedPet = null } = useInventoryPets();
    const { isUnseen } = useInventoryUnseenTracker();
    const unseen = isUnseen(UnseenItemCategory.PET, petItem.petData.id);

    const onMouseEvent = (event: MouseEvent) =>
    {
        switch(event.type)
        {
            case MouseEventType.MOUSE_DOWN:
                setSelectedPet(petItem);
                setMouseDown(true);
                return;
            case MouseEventType.MOUSE_UP:
                setMouseDown(false);
                return;
            case MouseEventType.ROLL_OUT:
                // The button has to still be DOWN for this to be a drag.
                // isMouseDown is only cleared by a MOUSE_UP on this same tile,
                // and a click that releases anywhere else - over the room,
                // which is most of them - left it stuck true. Moving the cursor
                // off the tile any time after that then armed a placement the
                // player never asked for: the ghost started following them,
                // and the next floor click moved it instead of walking.
                if(!isMouseDown || !(event.buttons & 1) || !(petItem === selectedPet)) return;

                setMouseDown(false);
                attemptPetPlacement(petItem);
                return;
            case 'dblclick':
                attemptPetPlacement(petItem);
                return;
        }
    }

    return (
        <LayoutGridItem itemActive={ (petItem === selectedPet) } itemUnseen={ unseen } onMouseDown={ onMouseEvent } onMouseUp={ onMouseEvent } onMouseOut={ onMouseEvent } onDoubleClick={ onMouseEvent } { ...rest }>
            <LayoutPetImageView figure={ petItem.petData.figureData.figuredata } direction={ 3 } headOnly={ true } />
            { children }
        </LayoutGridItem>
    );
}
