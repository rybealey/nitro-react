import { DragEvent, FC, useEffect, useState } from 'react';
import { SendMessageComposer } from '../../api';
import { RpGangKickComposer, RpGangReorderRolesComposer, RpGangSetMemberRoleComposer } from '../../api/rp-gangs/RpGangMessages';
import { FormatGangDate, GANG_PERM_ADMIN, GANG_PERM_INVITE, GANG_PERM_KICK, GANG_PERM_LEADER, GangDetail, GangPermissionLabels, GangRole, HasGangPermission } from '../../api/rp-gangs/RpGangTypes';
import { Button } from '../../common';
import { useNotification } from '../../hooks';
import { GangCrest } from './GangCrest';
import { GangPortrait } from './GangPortrait';
import { GangRoleEditor } from './GangRoleEditor';

interface GangManageTabProps
{
    detail: GangDetail;
    ownUserId: number;
    onInvite: () => void;
}

const GripIcon = () => (
    <svg className="gang-role-grip" width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
        <path d="M2 3.5h10M2 7h10M2 10.5h10" />
    </svg>
);

const LockIcon = () => (
    <svg className="gang-role-lock" width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round">
        <rect x="2.5" y="6" width="9" height="6.5" rx="1" />
        <path d="M4.5 6V4.5a2.5 2.5 0 0 1 5 0V6" />
    </svg>
);

// One ladder like the Info roster: each role is a card whose band drags to
// reorder, carries permission pills and Edit, and whose members sit under it
// with a role dropdown and Kick. Leader and the implicit Member are fixed.
// What an admin may touch is gated by the viewer's permission bits.
export const GangManageTab: FC<GangManageTabProps> = ({ detail, ownUserId, onInvite }) =>
{
    const { showConfirm = null } = useNotification();
    const [ editing, setEditing ] = useState<{ role: GangRole } | null>(null);
    const [ dragId, setDragId ] = useState(0);
    const [ localOrder, setLocalOrder ] = useState<number[]>(null);

    const isLeader = HasGangPermission(detail.permissions, GANG_PERM_LEADER);
    const canAdmin = HasGangPermission(detail.permissions, GANG_PERM_ADMIN);
    const canKick = HasGangPermission(detail.permissions, GANG_PERM_KICK);
    const canInvite = HasGangPermission(detail.permissions, GANG_PERM_INVITE);

    // a fresh detail (someone saved) wins over any half-finished local drag
    useEffect(() =>
    {
        setLocalOrder(null);
    }, [ detail.roles ]);

    const roles: GangRole[] = (localOrder ? localOrder.map(id => detail.roles.find(role => (role.id === id))).filter((role): role is GangRole => !!role) : detail.roles);
    const roleName = (roleId: number) => (detail.roles.find(role => (role.id === roleId))?.name ?? 'Member');
        const hasAdminRole = (roleId: number) => HasGangPermission(detail.roles.find(role => (role.id === roleId))?.flags ?? 0, GANG_PERM_ADMIN);

    const onDragStart = (event: DragEvent<HTMLDivElement>, roleId: number) =>
    {
        setDragId(roleId);
        event.dataTransfer.effectAllowed = 'move';
    }

    const onDragOver = (event: DragEvent<HTMLDivElement>, overId: number) =>
    {
        event.preventDefault();

        if(!dragId || (dragId === overId)) return;

        const order = roles.map(role => role.id);
        const from = order.indexOf(dragId);
        const to = order.indexOf(overId);

        if((from < 0) || (to < 0) || (from === to)) return;

        order.splice(from, 1);
        order.splice(to, 0, dragId);

        setLocalOrder(order);
    }

    const onDragEnd = () =>
    {
        if(dragId && localOrder) SendMessageComposer(new RpGangReorderRolesComposer(localOrder));

        setDragId(0);
    }

    const kick = (userId: number, username: string) =>
    {
        showConfirm(`Kick ${ username } from ${ detail.name }?`, () => SendMessageComposer(new RpGangKickComposer(userId)), () => {}, 'Kick', 'Cancel', 'Kick member');
    }

    const byName = (a: { username: string }, b: { username: string }) => a.username.localeCompare(b.username);
    const membersOf = (roleId: number) => detail.members.filter(member => ((member.roleId === roleId) && (member.userId !== detail.ownerId))).sort(byName);
    const owner = detail.members.filter(member => (member.userId === detail.ownerId));

    // the ladder: leader, every role in order, then the plain members
    const groups: { key: string, name: string, role: GangRole, pills: string[], members: typeof detail.members }[] = [
        { key: 'leader', name: 'Leader', role: null, pills: [ 'All permissions' ], members: owner },
        ...roles.map(role => ({ key: `role-${ role.id }`, name: role.name, role, pills: GangPermissionLabels(role.flags), members: membersOf(role.id) })),
        { key: 'member', name: 'Member', role: null, pills: [], members: membersOf(0) }
    ];

    return (
        <>
            <div className="gang-head">
                <div className="gang-crest-plate">
                    <GangCrest primary={ detail.colourA } secondary={ detail.colourB } size={ 40 } />
                </div>
                <div className="gang-head-info">
                    <div className="gang-title">{ detail.name }</div>
                    <div className="gang-sub">{ detail.members.length } { (detail.members.length === 1) ? 'member' : 'members' }{ canInvite && ` · ${ detail.invites.length } pending ${ (detail.invites.length === 1) ? 'invite' : 'invites' }` }</div>
                </div>
                { canInvite &&
                    <Button variant="success" onClick={ onInvite }>Invite Member</Button> }
            </div>
            <div className="gang-section gang-section-grow">
                <div className="gang-section-head">
                    <span className="gang-section-label">Roles &amp; members</span>
                    { canAdmin &&
                        <span className="gang-chrome-btn" onClick={ () => setEditing({ role: null }) }>Add Role</span> }
                </div>
                { editing &&
                    <GangRoleEditor key={ editing.role?.id ?? 0 } role={ editing.role } isLeader={ isLeader } onClose={ () => setEditing(null) } /> }
                { /* one ladder, like Info: every role is a card whose band carries
                     the role controls and whose members sit underneath it */ }
                <div className="gang-list gang-list-scroll gang-ladder">
                    { groups.map(group => (
                        <div key={ group.key } className={ `gang-card gang-group-card${ (group.role && canAdmin) ? ' is-draggable' : '' }${ (group.role && (dragId === group.role.id)) ? ' is-dragging' : '' }` }
                            onDragOver={ event => (group.role ? onDragOver(event, group.role.id) : undefined) } onDrop={ event => event.preventDefault() }>
                            <div className="gang-group-band" draggable={ !!group.role && canAdmin } onDragStart={ event => (group.role ? onDragStart(event, group.role.id) : undefined) } onDragEnd={ onDragEnd }>
                                { (group.role && canAdmin) ? <GripIcon /> : <LockIcon /> }
                                <span className="gang-role-name">{ group.name }</span>
                                <div className="gang-role-pills">
                                    { group.pills.map(label => <span key={ label } className="gang-pill">{ label }</span>) }
                                </div>
                                <span className="gang-role-count">{ group.key === 'leader' ? detail.ownerName : `${ group.members.length } ${ (group.members.length === 1) ? 'member' : 'members' }` }</span>
                                { group.role && canAdmin && (isLeader || !hasAdminRole(group.role.id)) &&
                                    <span className="gang-chrome-btn is-small" onClick={ () => setEditing({ role: group.role }) }>Edit</span> }
                            </div>
                            { (group.members.length === 0) &&
                                <div className="gang-group-empty">No members yet</div> }
                            { group.members.map(member =>
                            {
                                const isOwner = (member.userId === detail.ownerId);
                                const isSelf = (member.userId === ownUserId);
                                // admins may not touch the leader, themselves, or anyone in/into an admin role
                                const roleLocked = (!canAdmin || isOwner || (isSelf && !isLeader) || (!isLeader && hasAdminRole(member.roleId)));
                                const kickable = (canKick && !isOwner && !isSelf && (isLeader || !hasAdminRole(member.roleId)));

                                return (
                                    <div key={ member.userId } className="gang-member-line">
                                        <GangPortrait figure={ member.figure } online={ member.online } small />
                                        <div className="gang-member-info">
                                            <div className="gang-member-name">{ member.username }<span className={ `gang-dot gang-name-dot${ member.online ? ' is-online' : '' }` } /></div>
                                            <div className="gang-note">{ isOwner ? `Founder · ${ FormatGangDate(member.joinedAt) }` : `Joined ${ FormatGangDate(member.joinedAt) }` }</div>
                                        </div>
                                        { isOwner &&
                                            <span className="gang-role-select is-static">Leader</span> }
                                        { !isOwner && roleLocked &&
                                            <span className="gang-role-select is-static">{ roleName(member.roleId) }</span> }
                                        { !isOwner && !roleLocked &&
                                            <select className="gang-role-select" value={ member.roleId } onChange={ event => SendMessageComposer(new RpGangSetMemberRoleComposer(member.userId, parseInt(event.target.value))) }>
                                                <option value={ 0 }>Member</option>
                                                { detail.roles.filter(role => (isLeader || !HasGangPermission(role.flags, GANG_PERM_ADMIN))).map(role => <option key={ role.id } value={ role.id }>{ role.name }</option>) }
                                            </select> }
                                        { kickable &&
                                            <Button variant="danger" onClick={ () => kick(member.userId, member.username) }>Kick</Button> }
                                    </div>
                                );
                            }) }
                        </div>
                    )) }
                </div>
                <div className="gang-ladder-note">{ canAdmin ? 'Drag a role\u2019s band to reorder the ladder. Members change role from the dropdown on their row.' : 'Only the leader and administrators can change roles.' }</div>
            </div>
        </>
    );
}
