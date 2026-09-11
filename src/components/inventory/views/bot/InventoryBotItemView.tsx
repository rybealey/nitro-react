import { MouseEventType } from '@nitrots/nitro-renderer';
import { FC, MouseEvent, PropsWithChildren, useState } from 'react';
import { attemptBotPlacement, IBotItem, UnseenItemCategory } from '../../../../api';
import { LayoutAvatarImageView, LayoutGridItem } from '../../../../common';
import { useInventoryBots, useInventoryUnseenTracker } from '../../../../hooks';

export const InventoryBotItemView: FC<PropsWithChildren<{ botItem: IBotItem }>> = props =>
{
    const { botItem = null, children = null, ...rest } = props;
    const [ isMouseDown, setMouseDown ] = useState(false);
    const { selectedBot = null, setSelectedBot = null } = useInventoryBots();
    const { isUnseen = null } = useInventoryUnseenTracker();
    const unseen = isUnseen(UnseenItemCategory.BOT, botItem.botData.id);

    const onMouseEvent = (event: MouseEvent) =>
    {
        switch(event.type)
        {
            case MouseEventType.MOUSE_DOWN:
                setSelectedBot(botItem);
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
                if(!isMouseDown || !(event.buttons & 1) || (selectedBot !== botItem)) return;

                setMouseDown(false);
                attemptBotPlacement(botItem);
                return;
            case 'dblclick':
                attemptBotPlacement(botItem);
                return;
        }
    }

    return (
        <LayoutGridItem itemActive={ (selectedBot === botItem) } itemUnseen={ unseen } onMouseDown={ onMouseEvent } onMouseUp={ onMouseEvent } onMouseOut={ onMouseEvent } onDoubleClick={ onMouseEvent } { ...rest }>
            <LayoutAvatarImageView figure={ botItem.botData.figure } direction={ 3 } headOnly={ true } />
            { children }
        </LayoutGridItem>
    );
}
