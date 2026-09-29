import { IssueMessageData } from '@nitrots/nitro-renderer';
import { FC } from 'react';
import { GetIssueCategoryName } from '../../../../api';

interface ModToolsPickedIssuesTabViewProps
{
    pickedIssues: IssueMessageData[];
}

// One ticket per row card: its category, who it is about, when it came in
// and what can be done with it from this list (Mod Tools canvas).
export const ModToolsPickedIssuesTabView: FC<ModToolsPickedIssuesTabViewProps> = props =>
{
    const { pickedIssues = null } = props;

    return (
        <>
            <div className="mt-label mt-ticket-head"><span>Type</span><span>Room / player</span><span>Opened</span><span /></div>
            <div className="mt-ticket-list">
                { !(pickedIssues && pickedIssues.length) &&
                    <div className="mt-empty">Nobody is working on a ticket.</div> }
                { pickedIssues && pickedIssues.map(issue => (
                    <div key={ issue.issueId } className="mt-ticket">
                        <span className="mt-category">{ GetIssueCategoryName(issue.categoryId) }</span>
                        <span className="mt-ticket-who">{ issue.reportedUserName }</span>
                        <span className="mt-muted mt-time">{ new Date(Date.now() - issue.issueAgeInMilliseconds).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }</span>
                        <span className="mt-ticket-actions">
                            <span className="mt-muted mt-picker">by <b>{ issue.pickerUserName }</b></span>
                        </span>
                    </div>
                )) }
            </div>
        </>
    );
}
