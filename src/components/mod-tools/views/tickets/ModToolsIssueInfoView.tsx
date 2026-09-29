import { CloseIssuesMessageComposer, ReleaseIssuesMessageComposer } from '@nitrots/nitro-renderer';
import { FC, useState } from 'react';
import { GetIssueCategoryName, LocalizeText, SendMessageComposer } from '../../../../api';
import { NitroCardContentView, NitroCardHeaderView, NitroCardView } from '../../../../common';
import { useModTools } from '../../../../hooks';
import { CfhChatlogView } from './CfhChatlogView';

interface IssueInfoViewProps
{
    issueId: number;
    onIssueInfoClosed(issueId: number): void;
}

export const ModToolsIssueInfoView: FC<IssueInfoViewProps> = props =>
{
    const { issueId = null, onIssueInfoClosed = null } = props;
    const [ cfhChatlogOpen, setcfhChatlogOpen ] = useState(false);
    const { tickets = [], openUserInfo = null } = useModTools();
    const ticket = tickets.find(issue => (issue.issueId === issueId));

    const releaseIssue = (issueId: number) =>
    {
        SendMessageComposer(new ReleaseIssuesMessageComposer([ issueId ]));

        onIssueInfoClosed(issueId);
    }

    const closeIssue = (resolutionType: number) =>
    {
        SendMessageComposer(new CloseIssuesMessageComposer([ issueId ], resolutionType));

        onIssueInfoClosed(issueId)
    }
    
    if(!ticket) return null;

    // Resolving an issue (Mod Tools canvas): what it is and when, what the
    // reporter said, who is involved, the chatlog, then how to close it.
    return (
        <>
            <NitroCardView className="nitro-mod-tools-handle-issue" theme="primary-slim">
                <NitroCardHeaderView headerText={ `Issue #${ issueId }` } onCloseClick={ () => onIssueInfoClosed(issueId) } />
                <NitroCardContentView className="mt-page">
                    <div className="mt-issue-meta">
                        <span className="mt-category">{ LocalizeText('help.cfh.topic.' + ticket.reportedCategoryId) }</span>
                        <span className="mt-muted">from <b>{ GetIssueCategoryName(ticket.categoryId) }</b></span>
                    </div>
                    <div className="mt-card mt-panel">
                        <div className="mt-label">What they said</div>
                        <div className="mt-issue-text">{ ticket.message }</div>
                    </div>
                    <div className="mt-grid2">
                        <div className="mt-card mt-person">
                            <span className="mt-label">Reported by</span>
                            <span className="mt-link" onClick={ event => openUserInfo(ticket.reporterUserId) }>{ ticket.reporterUserName }</span>
                        </div>
                        <div className="mt-card mt-person">
                            <span className="mt-label">Reported</span>
                            <span className="mt-link" onClick={ event => openUserInfo(ticket.reportedUserId) }>{ ticket.reportedUserName }</span>
                        </div>
                    </div>
                    <button type="button" className="mt-chrome w-100" onClick={ () => setcfhChatlogOpen(!cfhChatlogOpen) }>Chatlog at the time</button>
                    <div className="mt-label mt-section-label">Close the issue as</div>
                    <div className="mt-grid3">
                        <button type="button" className="mt-success" onClick={ event => closeIssue(CloseIssuesMessageComposer.RESOLUTION_RESOLVED) }>Resolved</button>
                        <button type="button" className="mt-chrome" onClick={ event => closeIssue(CloseIssuesMessageComposer.RESOLUTION_USELESS) }>Useless</button>
                        <button type="button" className="mt-danger" onClick={ event => closeIssue(CloseIssuesMessageComposer.RESOLUTION_ABUSIVE) }>Abusive</button>
                    </div>
                    <button type="button" className="mt-ghost align-self-center" onClick={ event => releaseIssue(issueId) }>Release it back to the queue</button>
                </NitroCardContentView>
            </NitroCardView>
            { cfhChatlogOpen &&
                <CfhChatlogView issueId={ issueId } onCloseClick={ () => setcfhChatlogOpen(false) }/> }
        </>
    );
}
