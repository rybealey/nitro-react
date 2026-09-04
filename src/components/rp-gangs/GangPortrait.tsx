import { FC } from 'react';
import { CreateLinkEvent } from '../../api';
import { GangMember } from '../../api/rp-gangs/RpGangTypes';
import { LayoutAvatarImageView } from '../../common';
import { RpProfileState } from '../rp-profile/RpProfileState';

// Circular mask over the figure at native size (the corporations roster's
// portrait): no scaling, pixelated, the tint doubles as the presence signal.
export const GangPortrait: FC<{ figure: string, online: boolean, small?: boolean }> = ({ figure, online, small = false }) =>
{
    return (
        <div className={ `gang-portrait${ online ? ' is-online' : '' }${ small ? ' is-small' : '' }` }>
            <LayoutAvatarImageView figure={ figure } direction={ 2 } />
        </div>
    );
}

// Open a member's RP profile the way the corporations directory does: hand
// over what the roster knows, the profile fetches the rest by user id.
export const OpenGangMemberProfile = (member: GangMember) =>
{
    RpProfileState.name = member.username;
    RpProfileState.figure = member.figure;
    RpProfileState.motto = '';
    RpProfileState.online = member.online;
    RpProfileState.userId = member.userId;
    RpProfileState.employment = null;
    RpProfileState.staff = false;

    CreateLinkEvent('rp-profile/show');
}
