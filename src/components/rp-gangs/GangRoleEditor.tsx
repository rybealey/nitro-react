import { FC, useState } from 'react';
import { SendMessageComposer } from '../../api';
import { RpGangDeleteRoleComposer, RpGangSaveRoleComposer } from '../../api/rp-gangs/RpGangMessages';
import { GANG_PERM_ADMIN, GANG_PERM_BANK, GANG_PERM_INVITE, GANG_PERM_KICK, GANG_ROLE_NAME_MAX_LENGTH, GangRole } from '../../api/rp-gangs/RpGangTypes';
import { Button } from '../../common';
import { useNotification } from '../../hooks';

interface GangRoleEditorProps
{
    // null = a new role
    role: GangRole;
    // only the leader may grant Administrator
    isLeader: boolean;
    onClose: () => void;
}

const PERMISSIONS: { bit: number, label: string }[] = [
    { bit: GANG_PERM_INVITE, label: 'Invite members' },
    { bit: GANG_PERM_KICK, label: 'Kick members' },
    { bit: GANG_PERM_BANK, label: 'Bank access' },
    { bit: GANG_PERM_ADMIN, label: 'Administrator' }
];

// The Add / Edit Role popover: anchored under the roles header, over the
// list. Name, four permission switches (the settings-window switch), Save;
// an existing role also gets Delete.
export const GangRoleEditor: FC<GangRoleEditorProps> = ({ role, isLeader, onClose }) =>
{
    const { showConfirm = null } = useNotification();
    const [ name, setName ] = useState(role?.name ?? '');
    const [ flags, setFlags ] = useState(role?.flags ?? 0);
    const canSave = (name.trim().length > 0);

    const toggle = (bit: number) =>
    {
        if((bit === GANG_PERM_ADMIN) && !isLeader) return;

        setFlags(prevValue => (prevValue ^ bit));
    }

    const save = () =>
    {
        if(!canSave) return;

        SendMessageComposer(new RpGangSaveRoleComposer(role?.id ?? 0, name.trim(), flags));
        onClose();
    }

    const remove = () =>
    {
        if(!role) return;

        showConfirm(`Delete the ${ role.name } role? Its members become plain members.`, () =>
        {
            SendMessageComposer(new RpGangDeleteRoleComposer(role.id));
            onClose();
        }, () => {}, 'Delete', 'Keep it', 'Delete role');
    }

    return (
        <div className="gang-popover">
            <input className="form-control" type="text" placeholder="Role name" maxLength={ GANG_ROLE_NAME_MAX_LENGTH } autoFocus
                value={ name } onChange={ event => setName(event.target.value) } onKeyDown={ event => ((event.key === 'Enter') && save()) } />
            <div className="gang-popover-perms">
                { PERMISSIONS.map(permission =>
                {
                    const on = ((flags & permission.bit) !== 0);
                    const locked = ((permission.bit === GANG_PERM_ADMIN) && !isLeader);

                    return (
                        <div key={ permission.bit } className={ `gang-perm${ locked ? ' is-locked' : '' }` } title={ locked ? 'Only the leader can grant Administrator' : '' } onClick={ () => toggle(permission.bit) }>
                            <span className="gang-perm-label">{ permission.label }</span>
                            <span className={ `gang-switch${ on ? ' is-on' : '' }` }><span /></span>
                        </div>
                    );
                }) }
            </div>
            <div className="gang-popover-actions">
                { role &&
                    <span className="gang-link-danger" onClick={ remove }>Delete Role</span> }
                <span className="gang-chrome-btn" onClick={ onClose }>Cancel</span>
                <Button variant="success" disabled={ !canSave } onClick={ save }>Save</Button>
            </div>
        </div>
    );
}
