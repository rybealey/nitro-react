import { DragEvent, FC, useEffect, useState } from 'react';
import { SendMessageComposer } from '../../api';
import { RpGangKickComposer, RpGangReorderRolesComposer, RpGangSetMemberRoleComposer, RpGangTransferOwnershipComposer } from '../../api/rp-gangs/RpGangMessages';
import { GANG_PERM_ADMIN, GANG_PERM_KICK, GANG_PERM_LEADER, GangDetail, GangMember, GangRole, HasGangPermission } from '../../api/rp-gangs/RpGangTypes';
import { Button } from '../../common';
import { useNotification } from '../../hooks';
import { GangCrest } from './GangCrest';
import { GangRoleGroups } from './GangInfoTab';
import { GangPortrait } from './GangPortrait';
import { GangRoleEditor } from './GangRoleEditor';

interface GangManageTabProps
{
    detail: GangDetail;
    ownUserId: number;
}

const GripIcon = () => (
    <svg className="gang-role-grip" width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
        <path d="M2 3.5h10M2 7h10M2 10.5h10" />
    </svg>
);

// What a drag is carrying: a role's band (reorders the ladder) or a member's
// card (re-ranks them into the role it is dropped on).
type DragItem = { kind: 'role', id: number } | { kind: 'member', id: number };

// The ladder (Gang Window canvas, Manage): one card per role in order, its
// band carrying the role's name and Edit, its members as cards three across
// underneath. Admins drag a band to reorder roles and a member's card onto
// another role to re-rank them - the card's dropdown does the same. Every
// role is an ordinary one; the owner is ranked like anyone, tagged OWNER, and
// alone can Transfer Ownership. Offline members are greyed out, no dot.
export const GangManageTab: FC<GangManageTabProps> = ({ detail, ownUserId }) =>
{
    const { showConfirm = null } = useNotification();
    // 'add', a role id (that role's Edit), or null
    const [ editing, setEditing ] = useState<'add' | number>(null);
    const [ transferOpen, setTransferOpen ] = useState(false);
    const [ transferTo, setTransferTo ] = useState(0);
    const [ drag, setDrag ] = useState<DragItem>(null);
    const [ overRoleId, setOverRoleId ] = useState(0);
    const [ localOrder, setLocalOrder ] = useState<number[]>(null);

    const isOwner = HasGangPermission(detail.permissions, GANG_PERM_LEADER);
    const canAdmin = HasGangPermission(detail.permissions, GANG_PERM_ADMIN);
    const canKick = HasGangPermission(detail.permissions, GANG_PERM_KICK);

    // a fresh detail (someone saved) wins over any half-finished local drag
    useEffect(() =>
    {
        setLocalOrder(null);
    }, [ detail.roles ]);

    // a role that went away closes its editor
    useEffect(() =>
    {
        if((typeof editing === 'number') && !detail.roles.some(role => (role.id === editing))) setEditing(null);
    }, [ detail.roles, editing ]);

    const roles: GangRole[] = (localOrder ? localOrder.map(id => detail.roles.find(role => (role.id === id))).filter((role): role is GangRole => !!role) : detail.roles);
    const groups = GangRoleGroups(roles, detail.members);
    const hasAdminRole = (roleId: number) => HasGangPermission(detail.roles.find(role => (role.id === roleId))?.flags ?? 0, GANG_PERM_ADMIN);

    // an admin may move anyone but themselves; the owner may move themselves too
    const canMove = (member: GangMember) => (canAdmin && ((member.userId !== ownUserId) || isOwner));
    const canKickMember = (member: GangMember) => (canKick && (member.userId !== detail.ownerId) && (member.userId !== ownUserId) && (isOwner || !hasAdminRole(member.roleId)));

    const openEditor = (target: 'add' | number) =>
    {
        setTransferOpen(false);
        setEditing(prevValue => ((prevValue === target) ? null : target));
    }

    const toggleTransfer = () =>
    {
        setEditing(null);
        setTransferTo(0);
        setTransferOpen(prevValue => !prevValue);
    }

    const setRole = (member: GangMember, roleId: number) =>
    {
        if(member.roleId === roleId) return;

        SendMessageComposer(new RpGangSetMemberRoleComposer(member.userId, roleId));
    }

    const onBandDragStart = (event: DragEvent<HTMLDivElement>, roleId: number) =>
    {
        event.stopPropagation();
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', `role-${ roleId }`);
        setDrag({ kind: 'role', id: roleId });
    }

    const onCardDragStart = (event: DragEvent<HTMLDivElement>, member: GangMember) =>
    {
        event.stopPropagation();
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', `member-${ member.userId }`);
        setDrag({ kind: 'member', id: member.userId });
    }

    const onRoleDragOver = (event: DragEvent<HTMLDivElement>, roleId: number) =>
    {
        if(!drag) return;

        event.preventDefault();

        if(drag.kind === 'member')
        {
            if(overRoleId !== roleId) setOverRoleId(roleId);

            return;
        }

        if(drag.id === roleId) return;

        const order = roles.map(role => role.id);
        const from = order.indexOf(drag.id);
        const to = order.indexOf(roleId);

        if((from < 0) || (to < 0) || (from === to)) return;

        order.splice(from, 1);
        order.splice(to, 0, drag.id);

        setLocalOrder(order);
    }

    const onRoleDrop = (event: DragEvent<HTMLDivElement>, roleId: number) =>
    {
        event.preventDefault();

        if(drag?.kind === 'member')
        {
            const member = detail.members.find(row => (row.userId === drag.id));

            if(member) setRole(member, roleId);
        }
    }

    const onDragEnd = () =>
    {
        if((drag?.kind === 'role') && localOrder) SendMessageComposer(new RpGangReorderRolesComposer(localOrder));

        setDrag(null);
        setOverRoleId(0);
    }

    const kick = (member: GangMember) =>
    {
        showConfirm(`Kick ${ member.username } from ${ detail.name }?`, () => SendMessageComposer(new RpGangKickComposer(member.userId)), () => {}, 'Kick', 'Cancel', 'Kick member');
    }

    const transfer = () =>
    {
        const member = detail.members.find(row => (row.userId === transferTo));

        if(!member) return;

        showConfirm(`Hand ${ detail.name } to ${ member.username }? They become the owner - the only one who can disband or transfer it - and you stay in the gang.`, () =>
        {
            SendMessageComposer(new RpGangTransferOwnershipComposer(member.userId));
            setTransferOpen(false);
        }, () => {}, 'Transfer', 'Cancel', 'Transfer ownership');
    }

    const others = detail.members.filter(member => (member.userId !== detail.ownerId)).sort((a, b) => a.username.localeCompare(b.username));

    return (
        <>
            <div className="gang-head">
                <div className="gang-crest-plate">
                    <GangCrest primary={ detail.colourA } secondary={ detail.colourB } size={ 40 } />
                </div>
                <div className="gang-head-info">
                    <div className="gang-title">{ detail.name }</div>
                </div>
            </div>
            <div className="gang-section gang-section-grow">
                <div className="gang-section-head">
                    <span className="gang-section-label">Roles &amp; members</span>
                    <div className="gang-section-actions">
                        { isOwner && (others.length > 0) &&
                            <div className="gang-pop-anchor">
                                <span className="gang-chrome-btn is-amber" onClick={ toggleTransfer }>Transfer Ownership</span>
                                { transferOpen &&
                                    <div className="gang-popover is-narrow" onClick={ event => event.stopPropagation() }>
                                        <span className="gang-popover-arrow" />
                                        <div className="gang-popover-title">Transfer ownership</div>
                                        <select className="gang-role-select is-wide" value={ transferTo } aria-label="New owner" onChange={ event => setTransferTo(parseInt(event.target.value)) }>
                                            <option value={ 0 }>Choose a member…</option>
                                            { others.map(member => <option key={ member.userId } value={ member.userId }>{ member.username }</option>) }
                                        </select>
                                        <div className="gang-popover-actions">
                                            <span className="gang-chrome-btn" onClick={ toggleTransfer }>Cancel</span>
                                            <Button variant="danger" disabled={ !transferTo } onClick={ transfer }>Transfer</Button>
                                        </div>
                                    </div> }
                            </div> }
                        { canAdmin &&
                            <div className="gang-pop-anchor">
                                <span className="gang-chrome-btn" onClick={ () => openEditor('add') }>Add Role</span>
                                { (editing === 'add') &&
                                    <GangRoleEditor key="add" role={ null } canDelete={ false } onClose={ () => setEditing(null) } /> }
                            </div> }
                    </div>
                </div>
                <div className="gang-list gang-list-scroll gang-ladder">
                    { groups.map(({ role, members }) => (
                        <div key={ role.id }
                            className={ `gang-card gang-group-card${ ((drag?.kind === 'role') && (drag.id === role.id)) ? ' is-dragging' : '' }${ ((drag?.kind === 'member') && (overRoleId === role.id)) ? ' is-target' : '' }` }
                            onDragOver={ event => (canAdmin ? onRoleDragOver(event, role.id) : undefined) }
                            onDragLeave={ () => ((overRoleId === role.id) && setOverRoleId(0)) }
                            onDrop={ event => onRoleDrop(event, role.id) }>
                            <div className={ `gang-group-band${ canAdmin ? ' is-draggable' : '' }` } draggable={ canAdmin && (editing !== role.id) } onDragStart={ event => onBandDragStart(event, role.id) } onDragEnd={ onDragEnd }>
                                { canAdmin && <GripIcon /> }
                                <span className="gang-role-name">{ role.name }</span>
                                <span className="gang-band-spacer" />
                                { canAdmin &&
                                    <div className="gang-pop-anchor">
                                        <span className="gang-chrome-btn is-small" onClick={ () => openEditor(role.id) }>Edit</span>
                                        { (editing === role.id) &&
                                            <GangRoleEditor key={ role.id } role={ role } canDelete={ detail.roles.length > 1 } onClose={ () => setEditing(null) } /> }
                                    </div> }
                            </div>
                            { (members.length === 0) &&
                                <div className="gang-group-empty">No members yet</div> }
                            { (members.length > 0) &&
                                <div className="gang-manage-grid">
                                    { members.map(member =>
                                    {
                                        const movable = canMove(member);

                                        return (
                                            <div key={ member.userId }
                                                className={ `gang-manage-card${ member.online ? '' : ' is-offline' }${ movable ? ' is-movable' : '' }${ ((drag?.kind === 'member') && (drag.id === member.userId)) ? ' is-dragging' : '' }` }
                                                draggable={ movable } onDragStart={ event => (movable ? onCardDragStart(event, member) : undefined) } onDragEnd={ onDragEnd }>
                                                { member.online &&
                                                    <span className="gang-dot gang-member-status is-online" /> }
                                                <div className="gang-manage-card-top">
                                                    <GangPortrait figure={ member.figure } online={ member.online } />
                                                    <div className="gang-member-info">
                                                        { (member.userId === detail.ownerId) &&
                                                            <span className="gang-owner-tag">Owner</span> }
                                                        <div className="gang-member-name">{ member.username }</div>
                                                    </div>
                                                </div>
                                                <div className="gang-manage-card-actions">
                                                    { movable &&
                                                        <select className="gang-role-select" value={ member.roleId } aria-label={ `Role for ${ member.username }` } onChange={ event => setRole(member, parseInt(event.target.value)) }>
                                                            { roles.map(option => <option key={ option.id } value={ option.id }>{ option.name }</option>) }
                                                        </select> }
                                                    { !movable &&
                                                        <span className="gang-role-select is-static">{ role.name }</span> }
                                                    { canKickMember(member) &&
                                                        <Button variant="danger" className="gang-kick-btn" onClick={ () => kick(member) }>Kick</Button> }
                                                </div>
                                            </div>
                                        );
                                    }) }
                                </div> }
                        </div>
                    )) }
                </div>
            </div>
        </>
    );
}
