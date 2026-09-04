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

// Roles first, members second. Role rows drag to reorder (the order is the
// Info roster's ladder), carry permission pills and Edit; the Leader and the
// implicit Member rows are fixed. Member rows get a role dropdown and Kick.
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
    const countFor = (roleId: number) => detail.members.filter(member => ((member.roleId === roleId) && (member.userId !== detail.ownerId))).length;
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

    const members = [ ...detail.members ].sort((a, b) =>
    {
        // leader on top, then by role order, then alphabetically
        if(a.userId === detail.ownerId) return -1;
        if(b.userId === detail.ownerId) return 1;

        const orderA = ((a.roleId === 0) ? Number.MAX_SAFE_INTEGER : roles.findIndex(role => (role.id === a.roleId)));
        const orderB = ((b.roleId === 0) ? Number.MAX_SAFE_INTEGER : roles.findIndex(role => (role.id === b.roleId)));

        if(orderA !== orderB) return (orderA - orderB);

        return a.username.localeCompare(b.username);
    });

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
            <div className="gang-section">
                <div className="gang-section-head">
                    <span className="gang-section-label">Roles</span>
                    { canAdmin &&
                        <span className="gang-chrome-btn" onClick={ () => setEditing({ role: null }) }>Add Role</span> }
                </div>
                { editing &&
                    <GangRoleEditor key={ editing.role?.id ?? 0 } role={ editing.role } isLeader={ isLeader } onClose={ () => setEditing(null) } /> }
                <div className="gang-list">
                    <div className="gang-card gang-role-row is-fixed">
                        <LockIcon />
                        <span className="gang-role-name">Leader</span>
                        <div className="gang-role-pills"><span className="gang-pill">All permissions</span></div>
                        <span className="gang-role-count">{ detail.ownerName }</span>
                    </div>
                    { roles.map(role => (
                        <div key={ role.id } className={ `gang-card gang-role-row${ canAdmin ? ' is-draggable' : '' }${ (dragId === role.id) ? ' is-dragging' : '' }` }
                            draggable={ canAdmin } onDragStart={ event => onDragStart(event, role.id) } onDragOver={ event => onDragOver(event, role.id) } onDragEnd={ onDragEnd } onDrop={ event => event.preventDefault() }>
                            { canAdmin ? <GripIcon /> : <LockIcon /> }
                            <span className="gang-role-name">{ role.name }</span>
                            <div className="gang-role-pills">
                                { GangPermissionLabels(role.flags).map(label => <span key={ label } className="gang-pill">{ label }</span>) }
                            </div>
                            <span className="gang-role-count">{ countFor(role.id) } { (countFor(role.id) === 1) ? 'member' : 'members' }</span>
                            { canAdmin && (isLeader || !hasAdminRole(role.id)) &&
                                <span className="gang-chrome-btn is-small" onClick={ () => setEditing({ role }) }>Edit</span> }
                        </div>
                    )) }
                    <div className="gang-card gang-role-row is-fixed">
                        <LockIcon />
                        <span className="gang-role-name">Member</span>
                        <div className="gang-role-pills" />
                        <span className="gang-role-count">{ countFor(0) } { (countFor(0) === 1) ? 'member' : 'members' }</span>
                    </div>
                </div>
            </div>
            <div className="gang-section gang-section-grow">
                <div className="gang-section-head">
                    <span className="gang-section-label">Members</span>
                </div>
                <div className="gang-list gang-list-scroll">
                    { members.map(member =>
                    {
                        const isOwner = (member.userId === detail.ownerId);
                        const isSelf = (member.userId === ownUserId);
                        // admins may not touch the leader, themselves, or anyone in/into an admin role
                        const roleLocked = (!canAdmin || isOwner || (isSelf && !isLeader) || (!isLeader && hasAdminRole(member.roleId)));
                        const kickable = (canKick && !isOwner && !isSelf && (isLeader || !hasAdminRole(member.roleId)));

                        return (
                            <div key={ member.userId } className="gang-card gang-member-row">
                                <GangPortrait figure={ member.figure } online={ member.online } small />
                                <div className="gang-member-info">
                                    <div className="gang-member-name">{ member.username }</div>
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
            </div>
        </>
    );
}
