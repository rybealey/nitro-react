import { RoomObjectType } from '@nitrots/nitro-renderer';
import { FC, useMemo } from 'react';
import { AvatarInfoName, GetSessionDataManager } from '../../../../../api';
import { ContextMenuView } from '../../context-menu/ContextMenuView';

interface AvatarInfoWidgetNameViewProps
{
    nameInfo: AvatarInfoName;
    onClose: () => void;
}

// pixelrp: a player's name tag sits 10% of their height lower than the stock
// place (Twist, 2026-10-18) - nearer the head. Pets and furni keep theirs.
const AVATAR_NAME_DROP = 0.1;

export const AvatarInfoWidgetNameView: FC<AvatarInfoWidgetNameViewProps> = props =>
{
    const { nameInfo = null, onClose = null } = props;

    const getClassNames = useMemo(() =>
    {
        const newClassNames: string[] = [ 'name-only' ];

        if(nameInfo.isFriend) newClassNames.push('is-friend');

        return newClassNames;
    }, [ nameInfo ]);

    return (
        <ContextMenuView objectId={ nameInfo.roomIndex } category={ nameInfo.category } userType={ nameInfo.userType } fades={ (nameInfo.id !== GetSessionDataManager().userId) } classNames={ getClassNames } drop={ (nameInfo.userType === RoomObjectType.USER) ? AVATAR_NAME_DROP : 0 } onClose={ onClose }>
            <div>
                { nameInfo.name }
            </div>
        </ContextMenuView>
    );
}
