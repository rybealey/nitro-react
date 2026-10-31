import { FC, FormEvent, useEffect, useState } from 'react';
import { SendMessageComposer } from '../../../api';
import { CorpLoaEntry, CorpPanelAction, CorpPanelLoa, CorpRecordAction, RECORD_RESULT_BASE, RpCorpPanelActionComposer, RpCorpPanelLoaEvent, RpCorpPanelRecordComposer, RpCorpPanelResultEvent } from '../../../api/rp-corps/RpCorpPanelMessages';
import { useMessageEvent } from '../../../hooks';
import { CorpPanelLinks } from '../CorpPanelView';
import { CorpHead, CorpName } from '../CorpPanelShared';

// The Corporation Panel's LOA tracking. Employees ask with :loa <days>; a
// rank that approves decides here, and management can log leave straight
// away for anyone ranked below them. Approved leave stops them clocking in
// and counts the week as quota met. The timeline is three weeks of UK days
// from this week's Monday.

interface CorpLoaViewProps
{
    links: CorpPanelLinks;
}

const DAYS_SHOWN = 21;
const WEEKDAYS = [ 'M', 'T', 'W', 'T', 'F', 'S', 'S' ];
const MONTHS = [ 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec' ];

// 'yyyy-MM-dd' as a day number, so UK dates compare and subtract exactly.
const dayNumber = (date: string): number =>
{
    const [ year, month, day ] = date.split('-').map(Number);

    return Math.round(Date.UTC(year, month - 1, day) / 86400000);
}

const dayDate = (day: number): Date => new Date(day * 86400000);

// "Nov 4"
const shortDay = (date: string): string =>
{
    const at = dayDate(dayNumber(date));

    return `${ MONTHS[at.getUTCMonth()] } ${ at.getUTCDate() }`;
}

const rangeOf = (entry: CorpLoaEntry): string => ((entry.startsOn === entry.endsOn) ? shortDay(entry.startsOn) : `${ shortDay(entry.startsOn) } – ${ shortDay(entry.endsOn) }`);

const lengthOf = (entry: CorpLoaEntry): number => (dayNumber(entry.endsOn) - dayNumber(entry.startsOn) + 1);

export const CorpLoaView: FC<CorpLoaViewProps> = props =>
{
    const { links = null } = props;
    const [ loa, setLoa ] = useState<CorpPanelLoa>(null);
    const [ logging, setLogging ] = useState(false);

    useMessageEvent<RpCorpPanelLoaEvent>(RpCorpPanelLoaEvent, event => setLoa(event.getParser().loa));

    useEffect(() =>
    {
        SendMessageComposer(new RpCorpPanelActionComposer(CorpPanelAction.Loa, 0));
    }, [ links.refreshKey ]);

    const today = (loa ? dayNumber(loa.today) : 0);
    const first = (loa ? dayNumber(loa.monday) : 0);
    const entries = (loa?.entries ?? []);
    const pending = entries.filter(entry => (entry.status === 'pending'));
    const live = entries.filter(entry => (entry.status === 'approved') && (dayNumber(entry.endsOn) >= today));
    const onLeave = live.filter(entry => (dayNumber(entry.startsOn) <= today));
    const upcoming = live.filter(entry => (dayNumber(entry.startsOn) > today));
    const onTimeline = entries.filter(entry => ((entry.status !== 'denied') && (entry.status !== 'cancelled') && (dayNumber(entry.endsOn) >= first) && (dayNumber(entry.startsOn) < (first + DAYS_SHOWN))));
    const canLog = (loa?.people ?? []).some(person => person.canLog);

    const send = (action: number, entry: CorpLoaEntry) => SendMessageComposer(new RpCorpPanelRecordComposer(action, entry.id));

    return (
        <div className="corp-page">
            <div className="corp-page-head">
                <div className="corp-page-title">
                    <h2>LOA tracking</h2>
                    <p>Employees ask with :loa &lt;days&gt;. Weeks on leave count as quota met, and nobody clocks in while on leave.</p>
                </div>
                { canLog &&
                    <button type="button" className="mt-chrome corp-primary" onClick={ () => setLogging(true) }>Log an LOA</button> }
            </div>
            { !loa && <div className="mt-empty">Loading…</div> }
            { loa &&
                <>
                    <div className="corp-stats is-3">
                        <div className="corp-stat">
                            <b>{ onLeave.length }</b><span>On leave now</span>
                            <small>{ onLeave.length ? onLeave.map(entry => `${ entry.username } until ${ shortDay(entry.endsOn) }`).join(', ') : 'Everyone is in' }</small>
                        </div>
                        <div className="corp-stat"><b>{ upcoming.length }</b><span>Starting later</span><small>{ upcoming.map(entry => entry.username).join(', ') || 'None booked' }</small></div>
                        <div className={ `corp-stat ${ pending.length ? 'is-warn' : '' }` }><b>{ pending.length }</b><span>Waiting for a decision</span><small>{ pending.length ? 'Below' : 'All caught up' }</small></div>
                    </div>
                    <section className="mt-card">
                        <div className="corp-card-head">
                            <h3>Next 3 weeks</h3>
                            <span className="corp-legend"><span className="corp-legend-swatch is-approved" />Approved</span>
                            <span className="corp-legend"><span className="corp-legend-swatch is-pending" />Asked for</span>
                            <span className="corp-legend"><span className="corp-legend-swatch is-ended" />Ended early</span>
                        </div>
                        <div className="corp-timeline-wrap">
                            <div className="corp-timeline" style={ { gridTemplateColumns: `130px repeat(${ DAYS_SHOWN }, minmax(22px, 1fr))` } }>
                                <div />
                                { Array.from({ length: DAYS_SHOWN }, (_, index) =>
                                {
                                    const day = (first + index);

                                    return (
                                        <div key={ index } className={ `corp-timeline-day ${ (day === today) ? 'is-today' : '' }` }>
                                            <span>{ WEEKDAYS[index % 7] }</span>
                                            <b>{ dayDate(day).getUTCDate() }</b>
                                        </div>
                                    );
                                }) }
                                { onTimeline.map(entry =>
                                {
                                    const from = Math.max(0, dayNumber(entry.startsOn) - first);
                                    const to = Math.min(DAYS_SHOWN - 1, dayNumber(entry.endsOn) - first);

                                    return [
                                        <div key={ `n${ entry.id }` } className="corp-timeline-who">
                                            <CorpName userId={ entry.userId } name={ entry.username } onOpen={ links.openEmployee } />
                                        </div>,
                                        <div key={ `b${ entry.id }` } className={ `corp-timeline-bar is-${ entry.status }` } style={ { gridColumn: `${ from + 2 } / ${ to + 3 }` } } title={ `${ rangeOf(entry) }${ entry.reason ? ` · ${ entry.reason }` : '' }` }>
                                            { rangeOf(entry) }{ entry.reason ? ` · ${ entry.reason }` : '' }
                                        </div>
                                    ];
                                }) }
                            </div>
                            { (onTimeline.length === 0) && <div className="mt-empty">Nobody is away in the next three weeks.</div> }
                        </div>
                    </section>
                    { (pending.length > 0) &&
                        <section className="mt-card">
                            <div className="corp-card-head"><h3>Waiting for a decision</h3></div>
                            { pending.map(entry =>
                                <div key={ entry.id } className="corp-row">
                                    <CorpHead look={ entry.look } gender={ entry.gender } />
                                    <div className="corp-who">
                                        <span><CorpName userId={ entry.userId } name={ entry.username } onOpen={ links.openEmployee } /> · { entry.rankTitle } wants <b>{ rangeOf(entry) }</b> ({ lengthOf(entry) } { (lengthOf(entry) === 1) ? 'day' : 'days' })</span>
                                        <span>{ entry.reason ? `"${ entry.reason }" · ` : '' }{ entry.askedThemselves ? 'asked with :loa' : `asked by ${ entry.requestedByName }` }</span>
                                    </div>
                                    { loa.canApprove &&
                                        <span className="corp-request-actions">
                                            <button type="button" className="mt-ghost mt-small" onClick={ () => send(CorpRecordAction.DenyLoa, entry) }>Deny</button>
                                            <button type="button" className="mt-success mt-small" onClick={ () => send(CorpRecordAction.ApproveLoa, entry) }>Approve</button>
                                        </span> }
                                </div>) }
                        </section> }
                    { (live.length > 0) &&
                        <section className="mt-card">
                            <div className="corp-card-head"><h3>On leave and booked</h3></div>
                            { live.map(entry =>
                            {
                                const started = (dayNumber(entry.startsOn) <= today);

                                return (
                                    <div key={ entry.id } className="corp-row">
                                        <CorpHead look={ entry.look } gender={ entry.gender } />
                                        <div className="corp-who">
                                            <span><CorpName userId={ entry.userId } name={ entry.username } onOpen={ links.openEmployee } /> · { rangeOf(entry) }</span>
                                            <span>{ entry.reason ? `"${ entry.reason }" · ` : '' }approved by { entry.decidedByName }</span>
                                        </div>
                                        <span className={ `corp-chip ${ started ? 'is-close' : '' }` }>{ started ? `Back ${ shortDay(dayDate(dayNumber(entry.endsOn) + 1).toISOString().slice(0, 10)) }` : `From ${ shortDay(entry.startsOn) }` }</span>
                                        <button type="button" className="mt-ghost mt-small" onClick={ () => send(CorpRecordAction.EndLoa, entry) }>{ started ? 'End early' : 'Call off' }</button>
                                    </div>
                                );
                            }) }
                        </section> }
                </> }
            { logging && loa &&
                <CorpLogLoaDialog people={ loa.people.filter(person => person.canLog) } onClose={ () => setLogging(false) } /> }
        </div>
    );
}

const CorpLogLoaDialog: FC<{ people: CorpPanelLoa['people'], onClose: () => void }> = props =>
{
    const { people, onClose } = props;
    const [ userId, setUserId ] = useState(0);
    const [ startsIn, setStartsIn ] = useState(0);
    const [ days, setDays ] = useState(7);
    const [ reason, setReason ] = useState('');
    const [ sending, setSending ] = useState(false);
    const [ error, setError ] = useState('');

    useMessageEvent<RpCorpPanelResultEvent>(RpCorpPanelResultEvent, event =>
    {
        const result = event.getParser().result;

        if(!sending || (result.action !== (RECORD_RESULT_BASE + CorpRecordAction.LogLoa))) return;

        setSending(false);

        if(result.ok) onClose();
        else setError(result.message);
    });

    const submit = (event: FormEvent) =>
    {
        event.preventDefault();

        if(!userId || sending) return;

        setSending(true);
        setError('');
        SendMessageComposer(new RpCorpPanelRecordComposer(CorpRecordAction.LogLoa, userId, startsIn, days, '', reason.trim().slice(0, 128)));
    }

    return (
        <div className="corp-scrim" onMouseDown={ event => ((event.target === event.currentTarget) && onClose()) }>
            <form className="corp-dialog" role="dialog" aria-modal="true" aria-labelledby="corp-loa-title" onSubmit={ submit }>
                <div className="corp-dialog-head">
                    <h3 id="corp-loa-title">Log an LOA</h3>
                    <button type="button" className="corp-icon-button" aria-label="Close" onClick={ onClose }>×</button>
                </div>
                <div className="corp-dialog-body">
                    <label className="corp-field">
                        <span className="mt-label">Employee</span>
                        <select className="form-select form-select-sm" value={ userId } onChange={ event => setUserId(Number(event.target.value)) }>
                            <option value={ 0 }>Choose someone</option>
                            { people.map(person => <option key={ person.userId } value={ person.userId }>{ person.username } · { person.rankTitle }</option>) }
                        </select>
                    </label>
                    <div className="corp-field-row">
                        <label className="corp-field">
                            <span className="mt-label">Starts</span>
                            <select className="form-select form-select-sm" value={ startsIn } onChange={ event => setStartsIn(Number(event.target.value)) }>
                                <option value={ 0 }>Today</option>
                                <option value={ 1 }>Tomorrow</option>
                                { Array.from({ length: 13 }, (_, index) => (index + 2)).map(value => <option key={ value } value={ value }>In { value } days</option>) }
                            </select>
                        </label>
                        <label className="corp-field">
                            <span className="mt-label">Days</span>
                            <input className="form-control form-control-sm" type="number" min={ 1 } max={ 60 } value={ days } onChange={ event => setDays(Math.max(1, Math.min(60, Number(event.target.value) || 1))) } />
                        </label>
                    </div>
                    <label className="corp-field">
                        <span className="mt-label">Reason</span>
                        <input className="form-control form-control-sm" maxLength={ 128 } placeholder="Optional. Exams, a trip, a break." value={ reason } onChange={ event => setReason(event.target.value) } />
                    </label>
                    <div className="corp-effect is-quiet">Approved at once. If it starts today and they&apos;re on duty, their shift ends now.</div>
                    { error && <div className="corp-effect is-bad" role="alert">{ error }</div> }
                </div>
                <div className="corp-dialog-foot">
                    <button type="button" className="mt-ghost" onClick={ onClose }>Cancel</button>
                    <button type="submit" className="mt-chrome" disabled={ !userId || sending }>{ sending ? 'Logging…' : 'Log LOA' }</button>
                </div>
            </form>
        </div>
    );
}
