import { FC, useState } from 'react';
import { SendMessageComposer } from '../../api';
import { RpGangCancelInviteComposer, RpGangInviteComposer } from '../../api/rp-gangs/RpGangMessages';
import { FormatGangCountdown, GangDetail } from '../../api/rp-gangs/RpGangTypes';
import { Button } from '../../common';
import { GangPortrait } from './GangPortrait';

// Send an invite by name at the top; the pending invites below show who sent
// them and the time left, with Cancel to revoke. Only players with the invite
// permission see this tab.
export const GangInvitesTab: FC<{ detail: GangDetail, nowSeconds: number }> = ({ detail, nowSeconds }) =>
{
    const [ username, setUsername ] = useState('');
    const canSend = (username.trim().length > 0);

    const send = () =>
    {
        if(!canSend) return;

        SendMessageComposer(new RpGangInviteComposer(username.trim()));
        setUsername('');
    }

    return (
        <>
            <div className="gang-invite-form">
                <div className="gang-invite-form-row">
                    <input className="form-control" type="text" placeholder="Player name..." maxLength={ 32 } value={ username }
                        onChange={ event => setUsername(event.target.value) } onKeyDown={ event => ((event.key === 'Enter') && send()) } />
                    <Button variant="success" disabled={ !canSend } onClick={ send }>Send Invite</Button>
                </div>
                <div className="gang-note">Invites expire after { detail.inviteHours } hours. Players already in a gang cannot be invited.</div>
            </div>
            <div className="gang-section gang-section-grow">
                <div className="gang-section-head">
                    <span className="gang-section-label">Pending</span>
                    <span className="gang-group-count">{ detail.invites.length }</span>
                </div>
                <div className="gang-list gang-list-scroll">
                    { (detail.invites.length === 0) &&
                        <div className="gang-empty">No pending invites.</div> }
                    { detail.invites.map(invite => (
                        <div key={ invite.userId } className="gang-card gang-member-row">
                            <GangPortrait figure={ invite.figure } online={ false } small />
                            <div className="gang-member-info">
                                <div className="gang-member-name">{ invite.username }</div>
                                <div className="gang-note">Invited by { invite.invitedBy } · expires in { FormatGangCountdown(invite.expiresAt, nowSeconds) }</div>
                            </div>
                            <Button variant="danger" onClick={ () => SendMessageComposer(new RpGangCancelInviteComposer(invite.userId)) }>Cancel</Button>
                        </div>
                    )) }
                </div>
            </div>
        </>
    );
}
