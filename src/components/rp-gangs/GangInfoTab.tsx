import { FC } from 'react';
import { SendMessageComposer } from '../../api';
import { RpGangLeaveComposer } from '../../api/rp-gangs/RpGangMessages';
import { FormatGangDate, GANG_PERM_LEADER, GangDetail, GangMember, HasGangPermission } from '../../api/rp-gangs/RpGangTypes';
import { Button } from '../../common';
import { useNotification } from '../../hooks';
import { GangCrest } from './GangCrest';
import { GangPortrait, OpenGangMemberProfile } from './GangPortrait';

interface RosterGroup
{
    key: string;
    name: string;
    members: GangMember[];
}

// What every member sees: the identity header, the level bar (filled with the
// gang's primary colour) and the roster grouped by role - leader first, the
// custom roles in their order, plain members last - like the corporation
// rank ladder. Leave Gang lives here because plain members only see this tab.
export const GangInfoTab: FC<{ detail: GangDetail }> = ({ detail }) =>
{
    const { showConfirm = null } = useNotification();
    const isLeader = HasGangPermission(detail.permissions, GANG_PERM_LEADER);
    const onlineCount = detail.members.filter(member => member.online).length;

    const groups: RosterGroup[] = [
        { key: 'leader', name: 'Leader', members: detail.members.filter(member => (member.userId === detail.ownerId)) },
        ...detail.roles.map(role => ({ key: `role-${ role.id }`, name: role.name, members: detail.members.filter(member => ((member.roleId === role.id) && (member.userId !== detail.ownerId))) })),
        { key: 'member', name: 'Member', members: detail.members.filter(member => ((member.roleId === 0) && (member.userId !== detail.ownerId))) }
    ];

    const leave = () =>
    {
        if(isLeader)
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
                    <GangCrest primary={ detail.colourA } secondary={ detail.colourB } size={ 40 } />
                </div>
                <div className="gang-head-info">
                    <div className="gang-title">{ detail.name }</div>
                    <div className="gang-sub">Led by { detail.ownerName } · { detail.members.length } { (detail.members.length === 1) ? 'member' : 'members' } · founded { FormatGangDate(detail.createdAt) }</div>
                </div>
                <Button variant="danger" onClick={ leave }>{ isLeader ? 'Disband Gang' : 'Leave Gang' }</Button>
            </div>
            <div className="gang-card gang-level">
                <div className="gang-level-label">Level { detail.level }</div>
                <div className="gang-level-track">
                    <div className="gang-level-fill" style={ { width: `${ Math.min(100, Math.round((detail.xp / Math.max(1, detail.xpCap)) * 100)) }%`, backgroundColor: detail.colourA } } />
                </div>
                <div className="gang-level-value">{ detail.xp } / { detail.xpCap }</div>
            </div>
            <div className="gang-legend">
                <span className="gang-legend-item"><i className="gang-dot" />Offline</span>
                <span className="gang-legend-item"><i className="gang-dot is-online" />Online · { onlineCount }</span>
            </div>
            <div className="gang-roster">
                { groups.map((group, index) => (
                    <div key={ group.key } className="gang-group">
                        <div className="gang-group-head">
                            <span className={ `gang-group-name${ (index === 0) ? ' is-top' : '' }` }>{ group.name }</span>
                            <span className="gang-group-count">{ group.members.length }</span>
                        </div>
                        { (group.members.length === 0) &&
                            <div className="gang-group-none">No members</div> }
                        { (group.members.length > 0) &&
                            <div className="gang-members-grid">
                                { group.members.map(member => (
                                    <div key={ member.userId } className="gang-member-card" title={ `${ member.username} - ${ member.online ? 'Online' : 'Offline' }` } onClick={ () => OpenGangMemberProfile(member) }>
                                        <span className={ `gang-dot gang-member-status${ member.online ? ' is-online' : '' }` } />
                                        <GangPortrait figure={ member.figure } online={ member.online } />
                                        <div className="gang-member-info">
                                            <div className="gang-member-name">{ member.username }</div>
                                        </div>
                                    </div>
                                )) }
                            </div> }
                    </div>
                )) }
            </div>
        </>
    );
}
