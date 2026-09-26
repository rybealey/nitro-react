import { HabboSearchComposer, HabboSearchResultEvent } from '@nitrots/nitro-renderer';
import { FC, useEffect, useRef, useState } from 'react';
import { SendMessageComposer } from '../../api';
import { RpGangCancelInviteComposer, RpGangInviteComposer } from '../../api/rp-gangs/RpGangMessages';
import { FormatGangCountdown, GangDetail } from '../../api/rp-gangs/RpGangTypes';
import { Button } from '../../common';
import { useMessageEvent } from '../../hooks';
import { GangPortrait } from './GangPortrait';

interface SearchResult
{
    userId: number;
    username: string;
    figure: string;
    online: boolean;
}

// how many matches the list shows, and how long typing must pause before a search
const MAX_RESULTS = 8;
const SEARCH_DELAY_MS = 300;

// Invite by name at the top. Typing searches players (the stock player search
// the phone's Contacts app uses - HabboSearchComposer) and lists the matches
// under the box: head, name, online dot and Invite. Members of this gang are
// left out, and anyone already invited shows Invited instead. Enter or Send
// Invite still sends whatever was typed. The pending invites below show who
// sent them and the time left, with Cancel to revoke. Only players with the
// invite permission see this tab (labelled Invite, the last tab).
export const GangInvitesTab: FC<{ detail: GangDetail, nowSeconds: number }> = ({ detail, nowSeconds }) =>
{
    const [ username, setUsername ] = useState('');
    const [ results, setResults ] = useState<SearchResult[]>(null);
    // the query this tab is waiting on: search results are broadcast to every
    // listener, so anything arriving while this is empty was someone else's
    const pendingQuery = useRef('');
    const canSend = (username.trim().length > 0);

    useMessageEvent<HabboSearchResultEvent>(HabboSearchResultEvent, event =>
    {
        if(!pendingQuery.current) return;

        const parser = event.getParser();

        setResults([ ...parser.friends, ...parser.others ].map(result => ({ userId: result.avatarId, username: result.avatarName, figure: result.avatarFigure, online: result.isAvatarOnline })));
    });

    useEffect(() =>
    {
        const query = username.trim();

        if(!query.length)
        {
            pendingQuery.current = '';
            setResults(null);

            return;
        }

        const timeout = window.setTimeout(() =>
        {
            pendingQuery.current = query;
            SendMessageComposer(new HabboSearchComposer(query));
        }, SEARCH_DELAY_MS);

        return () => window.clearTimeout(timeout);
    }, [ username ]);

    const invite = (name: string) =>
    {
        const trimmed = name.trim();

        if(!trimmed) return;

        SendMessageComposer(new RpGangInviteComposer(trimmed));
        pendingQuery.current = '';
        setUsername('');
        setResults(null);
    }

    const memberIds = new Set(detail.members.map(member => member.userId));
    const invitedIds = new Set(detail.invites.map(invite => invite.userId));
    const matches = (results ?? []).filter(result => !memberIds.has(result.userId)).slice(0, MAX_RESULTS);

    return (
        <>
            <div className="gang-invite-form">
                <div className="gang-invite-search">
                    <div className="gang-invite-form-row">
                        <input className="form-control" type="text" placeholder="Search players..." maxLength={ 32 } value={ username } aria-label="Search players to invite"
                            onChange={ event => setUsername(event.target.value) }
                            onKeyDown={ event => { if(event.key === 'Enter') invite(username); else if(event.key === 'Escape') setResults(null); } } />
                        <Button variant="success" disabled={ !canSend } onClick={ () => invite(username) }>Send Invite</Button>
                    </div>
                    { results && canSend &&
                        <div className="gang-invite-results">
                            { (matches.length === 0) &&
                                <div className="gang-invite-results-empty">No players found.</div> }
                            { matches.map(result =>
                            {
                                const invited = invitedIds.has(result.userId);

                                return (
                                    <div key={ result.userId } className={ `gang-invite-result${ result.online ? '' : ' is-offline' }` }>
                                        <GangPortrait figure={ result.figure } online={ result.online } small />
                                        <div className="gang-member-info">
                                            <div className="gang-member-name">{ result.username }</div>
                                        </div>
                                        { result.online &&
                                            <span className="gang-dot is-online" /> }
                                        { invited &&
                                            <span className="gang-invite-result-sent">Invited</span> }
                                        { !invited &&
                                            <Button variant="success" onClick={ () => invite(result.username) }>Invite</Button> }
                                    </div>
                                );
                            }) }
                        </div> }
                </div>
                <div className="gang-note">Invites expire after { detail.inviteHours } hours. Players already in a gang cannot be invited.</div>
            </div>
            <div className="gang-section gang-section-grow">
                <div className="gang-section-head">
                    <span className="gang-section-label">Pending</span>
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
