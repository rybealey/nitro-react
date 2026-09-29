import { IssueMessageData, ReleaseIssuesMessageComposer } from '@nitrots/nitro-renderer';
import { FC } from 'react';
import { GetIssueCategoryName, SendMessageComposer } from '../../../../api';

interface ModToolsMyIssuesTabViewProps
{
    myIssues: IssueMessageData[];
    handleIssue: (issueId: number) => void;
}

// One ticket per row card: its category, who it is about, when it came in
// and what can be done with it from this list (Mod Tools canvas).
export const ModToolsMyIssuesTabView: FC<ModToolsMyIssuesTabViewProps> = props =>
{
    const { myIssues = null, handleIssue = null } = props;

    return (
        <>
            <div className="mt-label mt-ticket-head"><span>Type</span><span>Room / player</span><span>Opened</span><span /></div>
            <div className="mt-ticket-list">
                { !(myIssues && myIssues.length) &&
                    <div className="mt-empty">You have not picked any tickets.</div> }
                { myIssues && myIssues.map(issue => (
                    <div key={ issue.issueId } className="mt-ticket">
                        <span className="mt-category">{ GetIssueCategoryName(issue.categoryId) }</span>
                        <span className="mt-ticket-who">{ issue.reportedUserName }</span>
                        <span className="mt-muted mt-time">{ new Date(Date.now() - issue.issueAgeInMilliseconds).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }</span>
                        <span className="mt-ticket-actions">
                            <button type="button" className="mt-chrome mt-small" onClick={ event => handleIssue(issue.issueId) }>Handle</button>
                            <button type="button" className="mt-ghost mt-small" onClick={ event => SendMessageComposer(new ReleaseIssuesMessageComposer([ issue.issueId ])) }>Release</button>
                        </span>
                    </div>
                )) }
            </div>
        </>
    );
}
