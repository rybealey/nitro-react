import { FC, FormEvent, useEffect, useState } from 'react';
import { GetSessionDataManager, SendMessageComposer } from '../../../api';
import { CorpPanelAction, CorpPanelRequests, CorpRankAction, CorpRankDirection, CorpRankPerson, CorpRankRequest, CorpRequestStatus, RANK_RESULT_BASE, RpCorpPanelActionComposer, RpCorpPanelRankComposer, RpCorpPanelRequestsEvent, RpCorpPanelResultEvent } from '../../../api/rp-corps/RpCorpPanelMessages';
import { useMessageEvent } from '../../../hooks';
import { CorpPanelLinks } from '../CorpPanelView';
import { CorpHead, CorpName, LongDate, RecordTime, ShiftsOf } from '../CorpPanelShared';

// The Corporation Panel's Promo requests and Demotion requests - one view,
// one packet, split by direction. Anyone the panel opens for asks for one
// step up or down for someone ranked below them; a rank that approves (not
// the one who asked) decides. Each card carries the employee's week so the
// decision has the facts beside it. Approved ones land in the logs by
// themselves.

interface CorpRequestsViewProps
{
    direction: CorpRankDirection;
    links: CorpPanelLinks;
}

type Tab = 'pending' | 'approved' | 'denied';

const TABS: [ Tab, string ][] = [ [ 'pending', 'Pending' ], [ 'approved', 'Approved' ], [ 'denied', 'Denied' ] ];

const tabOf = (status: CorpRequestStatus): Tab => ((status === 'cancelled') ? 'denied' : status);

const REASON_MAX = 255;

export const CorpRequestsView: FC<CorpRequestsViewProps> = props =>
{
    const { direction = 'promotion', links = null } = props;
    const [ data, setData ] = useState<CorpPanelRequests>(null);
    const [ tab, setTab ] = useState<Tab>('pending');
    const [ asking, setAsking ] = useState(false);
    const [ now, setNow ] = useState(Date.now());

    useMessageEvent<RpCorpPanelRequestsEvent>(RpCorpPanelRequestsEvent, event => setData(event.getParser().requests));

    useEffect(() =>
    {
        setNow(Date.now());
        SendMessageComposer(new RpCorpPanelActionComposer(CorpPanelAction.Requests, 0));
    }, [ links.refreshKey ]);

    useEffect(() =>
    {
        setTab('pending');
        setAsking(false);
    }, [ direction ]);

    const isPromotion = (direction === 'promotion');
    const myId = GetSessionDataManager().userId;
    const quota = (data?.shiftQuota ?? 0);
    const people = new Map((data?.people ?? []).map(person => [ person.userId, person ]));
    const mine = (data?.requests ?? []).filter(request => (request.direction === direction));
    const shown = mine.filter(request => (tabOf(request.status) === tab));
    const canAsk = (data?.people ?? []).some(person => (isPromotion ? person.canRequestUp : person.canRequestDown));

    const decide = (request: CorpRankRequest, approve: boolean) =>
        SendMessageComposer(new RpCorpPanelRankComposer(approve ? CorpRankAction.Approve : CorpRankAction.Deny, request.id));
    const withdraw = (request: CorpRankRequest) => SendMessageComposer(new RpCorpPanelRankComposer(CorpRankAction.Withdraw, request.id));

    return (
        <div className="corp-page">
            <div className="corp-page-head">
                <div className="corp-page-title">
                    <h2>{ isPromotion ? 'Promo requests' : 'Demotion requests' }</h2>
                    <p>
                        { isPromotion
                            ? 'Ask for someone to move up a step. A rank that approves decides; nobody approves their own request.'
                            : 'Ask for someone to move down a step. They keep their rank until a rank that approves decides.' }
                    </p>
                </div>
                { canAsk &&
                    <button type="button" className="mt-chrome corp-primary" onClick={ () => setAsking(true) }>
                        { isPromotion ? 'Request a promotion' : 'Request a demotion' }
                    </button> }
            </div>
            <div className="corp-tools">
                <div className="mt-seg corp-filter-seg is-start" role="group" aria-label="Status">
                    { TABS.map(([ key, label ]) =>
                        <button key={ key } type="button" aria-pressed={ (key === tab) } className={ `mt-seg-button ${ (key === tab) ? 'is-on' : '' }` } onClick={ () => setTab(key) }>
                            { label } <span className="corp-seg-n">{ mine.filter(request => (tabOf(request.status) === key)).length }</span>
                        </button>) }
                </div>
                <span className="mt-hint corp-tools-end">Decided requests stay here for a week.</span>
            </div>
            { !data && <div className="mt-empty">Loading…</div> }
            { data && (shown.length === 0) &&
                <section className="mt-card">
                    <div className="mt-empty">
                        { (tab === 'pending') ? 'Nothing waiting on anyone.' : `None ${ tab } in the last week.` }
                    </div>
                </section> }
            { shown.map(request =>
            {
                const person = people.get(request.userId);
                const shifts = (person ? ShiftsOf(person.weekSeconds) : 0);
                const pending = (request.status === 'pending');
                const own = (request.requestedBy === myId);

                return (
                    <article key={ request.id } className="mt-card corp-request">
                        <div className="corp-request-main">
                            <CorpHead look={ request.look } gender={ request.gender } size="lg" />
                            <div className="corp-request-text">
                                <div className="corp-request-line">
                                    <CorpName userId={ request.userId } name={ request.username } onOpen={ links.openEmployee } />
                                    { (request.fromTitle || request.toTitle) &&
                                        <span className="corp-move">
                                            <span className="corp-rank">{ request.fromTitle || 'No longer here' }</span>
                                            <span className={ `corp-move-arrow is-${ direction }` } aria-label="to">→</span>
                                            <span className={ `corp-rank is-${ direction }` }>{ request.toTitle || '–' }</span>
                                        </span> }
                                    <span className="corp-time corp-tools-end">Requested by { own ? 'you' : request.requestedByName } · { RecordTime(request.createdAt, now) }</span>
                                </div>
                                <div className="corp-request-reason">“{ request.reason }”</div>
                                { person &&
                                    <div className="corp-facts">
                                        <span className={ `corp-chip ${ (quota > 0) ? ((shifts >= quota) ? 'is-met' : 'is-close') : '' }` }>{ shifts }{ (quota > 0) ? ` of ${ quota }` : '' } shifts this week</span>
                                        <span className={ `corp-chip ${ person.warnings ? 'is-close' : 'is-met' }` }>{ person.warnings } { (person.warnings === 1) ? 'warning' : 'warnings' }</span>
                                        <span className={ `corp-chip ${ person.strikes ? 'is-short' : 'is-met' }` }>{ person.strikes } { (person.strikes === 1) ? 'strike' : 'strikes' }</span>
                                        { (person.inRankSince > 0) && <span className="corp-chip">{ person.rankTitle } since { LongDate(person.inRankSince) }</span> }
                                    </div> }
                            </div>
                        </div>
                        <div className="corp-request-foot">
                            { pending &&
                                <>
                                    <span className="mt-hint">{ request.blocker || (isPromotion ? 'Approving promotes them now and logs it.' : 'Approving demotes them now, logs it and tells them why.') }</span>
                                    <span className="corp-tools-end corp-request-actions">
                                        { own && <button type="button" className="mt-ghost mt-small" onClick={ () => withdraw(request) }>Withdraw</button> }
                                        { data.canApprove && !own &&
                                            <>
                                                <button type="button" className="mt-ghost mt-small" onClick={ () => decide(request, false) }>Deny</button>
                                                <button type="button" className={ `mt-small ${ isPromotion ? 'mt-success' : 'mt-danger' }` } disabled={ !!request.blocker } onClick={ () => decide(request, true) }>
                                                    { isPromotion ? 'Approve' : 'Approve demotion' }
                                                </button>
                                            </> }
                                    </span>
                                </> }
                            { !pending &&
                                <span className={ `corp-chip corp-tools-end ${ (request.status === 'approved') ? 'is-met' : 'is-short' }` }>
                                    { (request.status === 'approved') ? 'Approved' : ((request.status === 'cancelled') ? 'Withdrawn' : 'Denied') }
                                    { (request.status !== 'cancelled') && request.decidedByName ? ` by ${ request.decidedByName }` : '' }
                                    { request.decidedAt ? ` · ${ RecordTime(request.decidedAt, now) }` : '' }
                                </span> }
                        </div>
                    </article>
                );
            }) }
            { asking && data &&
                <CorpRequestDialog direction={ direction } people={ data.people } quota={ quota } onClose={ () => setAsking(false) } /> }
        </div>
    );
}

const CorpRequestDialog: FC<{ direction: CorpRankDirection, people: CorpRankPerson[], quota: number, onClose: () => void }> = props =>
{
    const { direction, people, quota, onClose } = props;
    const isPromotion = (direction === 'promotion');
    const choices = people.filter(person => (isPromotion ? person.canRequestUp : person.canRequestDown));
    const [ userId, setUserId ] = useState(0);
    const [ reason, setReason ] = useState('');
    const [ sending, setSending ] = useState(false);
    const [ error, setError ] = useState('');

    useMessageEvent<RpCorpPanelResultEvent>(RpCorpPanelResultEvent, event =>
    {
        const result = event.getParser().result;

        if(!sending || (result.action !== (RANK_RESULT_BASE + CorpRankAction.Request))) return;

        setSending(false);

        if(result.ok) onClose();
        else setError(result.message);
    });

    const target = choices.find(person => (person.userId === userId)) ?? null;

    const submit = (event: FormEvent) =>
    {
        event.preventDefault();

        if(!target || !reason.trim() || sending) return;

        setSending(true);
        setError('');
        SendMessageComposer(new RpCorpPanelRankComposer(CorpRankAction.Request, target.userId, direction, reason.trim().slice(0, REASON_MAX)));
    }

    return (
        <div className="corp-scrim" onMouseDown={ event => ((event.target === event.currentTarget) && onClose()) }>
            <form className="corp-dialog" role="dialog" aria-modal="true" aria-labelledby="corp-request-title" onSubmit={ submit }>
                <div className="corp-dialog-head">
                    <h3 id="corp-request-title">{ isPromotion ? 'Request a promotion' : 'Request a demotion' }</h3>
                    <button type="button" className="corp-icon-button" aria-label="Close" onClick={ onClose }>×</button>
                </div>
                <div className="corp-dialog-body">
                    <label className="corp-field">
                        <span className="mt-label">Employee</span>
                        <select className="form-select form-select-sm" value={ userId } onChange={ event => setUserId(Number(event.target.value)) }>
                            <option value={ 0 }>Choose someone</option>
                            { choices.map(person =>
                                <option key={ person.userId } value={ person.userId }>
                                    { person.username } · { person.rankTitle } → { isPromotion ? person.upTitle : person.downTitle }
                                </option>) }
                        </select>
                    </label>
                    { target &&
                        <div className="corp-facts">
                            <span className="corp-chip">{ ShiftsOf(target.weekSeconds) }{ (quota > 0) ? ` of ${ quota }` : '' } shifts this week</span>
                            <span className="corp-chip">{ target.warnings } { (target.warnings === 1) ? 'warning' : 'warnings' }</span>
                            <span className="corp-chip">{ target.strikes } { (target.strikes === 1) ? 'strike' : 'strikes' }</span>
                        </div> }
                    <label className="corp-field">
                        <span className="mt-label">Why</span>
                        <textarea className="form-control form-control-sm" rows={ 3 } maxLength={ REASON_MAX } value={ reason } onChange={ event => setReason(event.target.value) }
                            placeholder={ isPromotion ? 'What they do well. Whoever approves it will read this.' : 'What went wrong. They will read this if it is approved.' } />
                    </label>
                    { error && <div className="corp-effect is-bad" role="alert">{ error }</div> }
                </div>
                <div className="corp-dialog-foot">
                    <button type="button" className="mt-ghost" onClick={ onClose }>Cancel</button>
                    <button type="submit" className="mt-chrome" disabled={ !target || !reason.trim() || sending }>{ sending ? 'Sending…' : 'Send request' }</button>
                </div>
            </form>
        </div>
    );
}
