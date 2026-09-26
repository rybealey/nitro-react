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
    // false for the gang's last role - a gang always keeps one
    canDelete: boolean;
    onClose: () => void;
}

const PERMISSIONS: { bit: number, label: string }[] = [
    { bit: GANG_PERM_INVITE, label: 'Invite members' },
    { bit: GANG_PERM_KICK, label: 'Kick members' },
    { bit: GANG_PERM_BANK, label: 'Bank access' },
    { bit: GANG_PERM_ADMIN, label: 'Administrator' }
];

// The Add / Edit Role popover. It hangs under the button that opened it (Add
// Role, or that role's Edit) - the caller wraps the button in a positioned
// box - so it floats over the ladder and never resizes the window. Name, four
// permission switches (the owner and admins may both grant Administrator),
// Cancel / Save; an existing role also gets Delete Role unless it is the
// gang's last one.
export const GangRoleEditor: FC<GangRoleEditorProps> = ({ role, canDelete, onClose }) =>
{
    const { showConfirm = null } = useNotification();
    const [ name, setName ] = useState(role?.name ?? '');
    const [ flags, setFlags ] = useState(role?.flags ?? 0);
    const canSave = (name.trim().length > 0);

    const toggle = (bit: number) => setFlags(prevValue => (prevValue ^ bit));

    const save = () =>
    {
        if(!canSave) return;

        SendMessageComposer(new RpGangSaveRoleComposer(role?.id ?? 0, name.trim(), flags));
        onClose();
    }

    const remove = () =>
    {
        if(!role) return;

        showConfirm(`Delete the ${ role.name } role? Its members move to the bottom role.`, () =>
        {
            SendMessageComposer(new RpGangDeleteRoleComposer(role.id));
            onClose();
        }, () => {}, 'Delete', 'Keep it', 'Delete role');
    }

    return (
        <div className="gang-popover" onClick={ event => event.stopPropagation() }>
            <span className="gang-popover-arrow" />
            <input className="form-control" type="text" placeholder="Role name" maxLength={ GANG_ROLE_NAME_MAX_LENGTH } autoFocus
                value={ name } onChange={ event => setName(event.target.value) } onKeyDown={ event => ((event.key === 'Enter') && save()) } />
            <div className="gang-popover-perms">
                { PERMISSIONS.map(permission =>
                {
                    const on = ((flags & permission.bit) !== 0);

                    return (
                        <div key={ permission.bit } className="gang-perm" onClick={ () => toggle(permission.bit) }>
                            <span className="gang-perm-label">{ permission.label }</span>
                            <span className={ `gang-switch${ on ? ' is-on' : '' }` }><span /></span>
                        </div>
                    );
                }) }
            </div>
            <div className="gang-popover-actions">
                { role && canDelete &&
                    <Button variant="danger" className="gang-popover-delete" onClick={ remove }>Delete Role</Button> }
                <span className="gang-chrome-btn" onClick={ onClose }>Cancel</span>
                <Button variant="success" disabled={ !canSave } onClick={ save }>Save</Button>
            </div>
        </div>
    );
}
