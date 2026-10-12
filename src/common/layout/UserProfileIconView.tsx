import { FC, useMemo } from 'react';
import { GetUserProfile } from '../../api';
import { PIXELRP_ROOM_OWNER } from '../../api/rp-rights/RpRoomRightsMessages';
import { Base, BaseProps } from '../Base';

export interface UserProfileIconViewProps extends BaseProps<HTMLDivElement>
{
    userId?: number;
    userName?: string;
}

export const UserProfileIconView: FC<UserProfileIconViewProps> = props =>
{
    const { userId = 0, userName = null, classNames = [], pointer = true, children = null, ...rest } = props;

    const getClassNames = useMemo(() =>
    {
        const newClassNames: string[] = [ 'nitro-friends-spritesheet', 'icon-profile-sm' ];

        if(classNames.length) newClassNames.push(...classNames);

        return newClassNames;
    }, [ classNames ]);

    // PixelRP: the hotel's own account - the owner of PixelRP rooms - has no
    // profile to open, so nothing offers one (the server refuses it too).
    if(userName === PIXELRP_ROOM_OWNER) return null;

    return (
        <Base classNames={ getClassNames } pointer={ pointer } onClick={ event => GetUserProfile(userId) } { ... rest }>
            { children }
        </Base>
    );
}
