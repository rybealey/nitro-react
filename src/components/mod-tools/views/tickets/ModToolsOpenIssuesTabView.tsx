import { IssueMessageData, PickIssuesMessageComposer } from '@nitrots/nitro-renderer';
import { FC } from 'react';
import { GetIssueCategoryName, SendMessageComposer } from '../../../../api';

interface ModToolsOpenIssuesTabViewProps
{
    openIssues: IssueMessageData[];
}

// One ticket per row card: its category, who it is about, when it came in
// and what can be done with it from this list (Mod Tools canvas).
export const ModToolsOpenIssuesTabView: FC<ModToolsOpenIssuesTabViewProps> = props =>
{
    const { openIssues = null } = props;

    return (
        <>
            <div className="mt-label mt-ticket-head"><span>Type</span><span>Room / player</span><span>Opened</span><span /></div>
            <div className="mt-ticket-list">
                { !(openIssues && openIssues.length) &&
                    <div className="mt-empty">No open tickets.</div> }
                { openIssues && openIssues.map(issue => (
                    <div key={ issue.issueId } className="mt-ticket">
                        <span className="mt-category">{ GetIssueCategoryName(issue.categoryId) }</span>
                        <span className="mt-ticket-who">{ issue.reportedUserName }</span>
                        <span className="mt-muted mt-time">{ new Date(Date.now() - issue.issueAgeInMilliseconds).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }</span>
                        <span className="mt-ticket-actions">
                            <button type="button" className="mt-success mt-small" onClick={ event => SendMessageComposer(new PickIssuesMessageComposer([ issue.issueId ], false, 0, 'pick issue button')) }>Pick issue</button>
                        </span>
                    </div>
                )) }
            </div>
        </>
    );
}
