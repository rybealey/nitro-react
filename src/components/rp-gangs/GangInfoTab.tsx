import { FC } from 'react';
import { SendMessageComposer } from '../../api';
import { RpGangLeaveComposer } from '../../api/rp-gangs/RpGangMessages';
import { GANG_PERM_LEADER, GangDetail, GangMember, GangRole, HasGangPermission } from '../../api/rp-gangs/RpGangTypes';
import { Button, LayoutAvatarImageView } from '../../common';
import { useNotification } from '../../hooks';
import { GangCrest } from './GangCrest';
import { OpenGangMemberProfile } from './GangPortrait';

// What every member sees: the identity header, the level bar (filled with the
// gang's primary colour) and the roster - one panel per role in ladder order,
// each member a portrait card with their name under it (Gang Window canvas,
// "member cards by rank"). Every role is a real one - there is no implicit
// Leader or Member group - and who owns the gang is not shown here (only the
// Manage tab tags the owner, for the owner and admins). Offline members are
// greyed out; there is no dot. Only the owner can disband; everyone else sees
// Leave Gang.
interface GangInfoTabProps
{
    detail: GangDetail;
    // someone else's gang: no Leave / Disband, and no button at all
    readOnly?: boolean;
}

// Each role with its members, in ladder order. A member whose role the
// packet doesn't carry (never expected) falls into the bottom role rather
// than vanishing from the roster.
export const GangRoleGroups = (roles: GangRole[], members: GangMember[]): { role: GangRole, members: GangMember[] }[] =>
{
    const known = new Set(roles.map(role => role.id));
    const bottomId = (roles.length ? roles[roles.length - 1].id : 0);

    return roles.map(role => ({
        role,
        members: members
            .filter(member => ((member.roleId === role.id) || ((role.id === bottomId) && !known.has(member.roleId))))
            .sort((a, b) => a.username.localeCompare(b.username))
    }));
}

export const GangInfoTab: FC<GangInfoTabProps> = ({ detail, readOnly = false }) =>
{
    const { showConfirm = null } = useNotification();
    const isOwner = HasGangPermission(detail.permissions, GANG_PERM_LEADER);
    const onlineCount = detail.members.filter(member => member.online).length;
    const groups = GangRoleGroups(detail.roles, detail.members);

    const leave = () =>
    {
        if(isOwner)
        {
            showConfirm(`Disband ${ detail.name }? Every member is let go and the gang is gone for good.`, () => SendMessageComposer(new RpGangLeaveComposer()), () => {}, 'Disband', 'Keep it', 'Disband gang');
            return;
        }

        showConfirm(`Leave ${ detail.name }? You'll need a new invite to come back.`, () => SendMessageComposer(new RpGangLeaveComposer()), () => {}, 'Leave', 'Stay', 'Leave gang');
    }

    return (
        <>
            <div className="gang-head">
                <div className="gang-crest-plate">
                    <GangCrest primary={ detail.colourA } secondary={ detail.colourB } size={ 34 } crop />
                </div>
                <div className="gang-head-info">
                    <div className="gang-title">{ detail.name }</div>
                    <div className="gang-sub">{ detail.members.length } { (detail.members.length === 1) ? 'member' : 'members' } · { onlineCount } online</div>
                </div>
                { !readOnly &&
                    <Button variant="danger" onClick={ leave }>{ isOwner ? 'Disband Gang' : 'Leave Gang' }</Button> }
            </div>
            <div className="gang-card gang-level">
                <div className="gang-level-label">Level { detail.level }</div>
                <div className="gang-level-track">
                    <div className="gang-level-fill" style={ { width: `${ Math.min(100, Math.round((detail.xp / Math.max(1, detail.xpCap)) * 100)) }%`, backgroundColor: detail.colourA } } />
                </div>
                <div className="gang-level-value">{ detail.xp } / { detail.xpCap }</div>
            </div>
            <div className="gang-roster">
                { groups.map(({ role, members }, index) => (
                    <section key={ role.id } className="gang-rank" aria-label={ role.name }>
                        <div className="gang-rank-bar">{ role.name }</div>
                        { (members.length === 0) &&
                            <div className="gang-rank-none">No members</div> }
                        { (members.length > 0) &&
                            <div className={ `gang-rank-cards${ (index === (groups.length - 1)) ? ' is-bottom' : '' }` }>
                                { members.map(member => (
                                    <div key={ member.userId } className={ `gang-tile${ member.online ? '' : ' is-offline' }` } title={ `${ member.username } - ${ member.online ? 'Online' : 'Offline' }` } onClick={ () => OpenGangMemberProfile(member) }>
                                        <div className="gang-tile-face">
                                            <LayoutAvatarImageView figure={ member.figure } headOnly={ true } direction={ 2 } />
                                        </div>
                                        <div className="gang-member-name">{ member.username }</div>
                                    </div>
                                )) }
                            </div> }
                    </section>
                )) }
            </div>
        </>
    );
}
