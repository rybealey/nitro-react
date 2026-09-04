import { FC } from 'react';
import { CreateLinkEvent } from '../../api';
import { GangMember } from '../../api/rp-gangs/RpGangTypes';
import { LayoutAvatarImageView } from '../../common';
import { RpProfileState } from '../rp-profile/RpProfileState';

// The head-only sprite at native size, unmasked and on no fill - the stock
// group member list's crop box (40x50, head centred by offset). Presence is
// signalled by the dot beside it, not by tinting the portrait.
export const GangPortrait: FC<{ figure: string, online?: boolean, small?: boolean }> = ({ figure, small = false }) =>
{
    return (
        <div className={ `gang-portrait${ small ? ' is-small' : '' }` }>
            <LayoutAvatarImageView figure={ figure } headOnly={ true } direction={ 2 } />
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
