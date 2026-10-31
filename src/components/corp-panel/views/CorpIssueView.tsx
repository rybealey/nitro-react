import { FC, FormEvent, useEffect, useState } from 'react';
import { SendMessageComposer } from '../../../api';
import { RpRankTitle } from '../../../api/rp-employment/RpEmploymentRegistry';
import { CorpDisciplineAction, CorpPanelAction, CorpPanelDiscipline, CorpPanelResult, RpCorpPanelActionComposer, RpCorpPanelDisciplineComposer, RpCorpPanelDisciplineEvent, RpCorpPanelResultEvent } from '../../../api/rp-corps/RpCorpPanelMessages';
import { useMessageEvent } from '../../../hooks';
import { CorpIssueRequest } from '../CorpPanelView';
import { CorpPips } from '../CorpPanelShared';

// The Corporation Panel's issue form: a warning or strike for one employee
// ranked below you. It reads this week's counts so it can say what the
// warning will do before it is sent - the third in a week adds a strike, the
// third strike puts them up for a dismissal review. The server checks the
// rank again and answers with RpCorpPanelResultEvent.

interface CorpIssueViewProps
{
    request: CorpIssueRequest;
    onClose: () => void;
}

const REASONS: Record<'warning' | 'strike', string[]> = {
    warning: [ 'AFK on shift', 'Rude to a customer', 'Ignored a call', 'Left mid-shift', 'Off duty in uniform' ],
    strike: [ 'Repeated warnings', 'No-show for a shift', 'Abused their position', 'Stole from the corporation' ]
};

const OTHER = 'Something else';

// rp_corporation_discipline.reason / details
const REASON_MAX = 64;
const DETAILS_MAX = 255;

export const CorpIssueView: FC<CorpIssueViewProps> = props =>
{
    const { request = null, onClose = null } = props;
    const kind = request.kind;
    const [ discipline, setDiscipline ] = useState<CorpPanelDiscipline>(null);
    const [ userId, setUserId ] = useState(request.userId);
    const [ preset, setPreset ] = useState(REASONS[kind][0]);
    const [ custom, setCustom ] = useState('');
    const [ details, setDetails ] = useState('');
    const [ notify, setNotify ] = useState(true);
    const [ sending, setSending ] = useState(false);
    const [ result, setResult ] = useState<CorpPanelResult>(null);

    // This week's counts, whatever week the page behind is showing.
    useMessageEvent<RpCorpPanelDisciplineEvent>(RpCorpPanelDisciplineEvent, event =>
    {
        const next = event.getParser().discipline;

        if(next.weeksAgo === 0) setDiscipline(next);
    });

    useMessageEvent<RpCorpPanelResultEvent>(RpCorpPanelResultEvent, event =>
    {
        const next = event.getParser().result;

        if(!sending || (next.action !== CorpDisciplineAction.Issue)) return;

        setSending(false);
        setResult(next);
    });

    useEffect(() =>
    {
        SendMessageComposer(new RpCorpPanelActionComposer(CorpPanelAction.Discipline, 0));
    }, []);

    const people = (discipline?.people ?? []).filter(person => person.canDiscipline);
    const target = people.find(person => (person.userId === userId)) ?? null;
    const perStrike = (discipline?.warningsPerStrike ?? 3);
    const forReview = (discipline?.strikesForReview ?? 3);
    const reason = ((preset === OTHER) ? custom.trim() : preset);
    const isWarning = (kind === 'warning');

    // What this one will do, from this week's counts.
    let effect: { tone: 'quiet' | 'warn' | 'bad', text: string } = null;

    if(target)
    {
        const warnings = (target.warnings + (isWarning ? 1 : 0));
        const addsStrike = (isWarning && ((warnings % perStrike) === 0));
        const strikes = (target.strikes + ((!isWarning || addsStrike) ? 1 : 0));

        if(addsStrike) effect = { tone: 'bad', text: `This is ${ target.username }'s warning number ${ warnings } this week, so it adds a strike (${ target.strikes } to ${ strikes }).` };
        else if(isWarning) effect = { tone: ((warnings % perStrike) === (perStrike - 1)) ? 'warn' : 'quiet', text: `Warning ${ warnings % perStrike } of ${ perStrike } this week. ${ ((warnings % perStrike) === (perStrike - 1)) ? 'One more adds a strike.' : 'It clears at the weekly reset.' }` };
        else effect = { tone: (strikes >= forReview) ? 'bad' : 'warn', text: `Strike ${ strikes } of ${ forReview } this week.` };

        if((!isWarning || addsStrike) && (strikes >= forReview)) effect = { tone: 'bad', text: `${ effect.text } That puts them up for a dismissal review.` };
    }

    const submit = (event: FormEvent) =>
    {
        event.preventDefault();

        if(!target || !reason || sending) return;

        setSending(true);
        setResult(null);
        SendMessageComposer(new RpCorpPanelDisciplineComposer(CorpDisciplineAction.Issue, target.userId, kind, reason.slice(0, REASON_MAX), details.trim().slice(0, DETAILS_MAX), notify));
    }

    const again = () =>
    {
        setResult(null);
        setUserId(0);
        setPreset(REASONS[kind][0]);
        setCustom('');
        setDetails('');
        SendMessageComposer(new RpCorpPanelActionComposer(CorpPanelAction.Discipline, 0));
    }

    const done = (result?.ok ?? false);

    return (
        <div className="corp-scrim" onMouseDown={ event => ((event.target === event.currentTarget) && onClose()) }>
            <form className="corp-dialog" role="dialog" aria-modal="true" aria-labelledby="corp-issue-title" onSubmit={ submit }>
                <div className="corp-dialog-head">
                    <h3 id="corp-issue-title">{ isWarning ? 'Issue a warning' : 'Issue a strike' }</h3>
                    <button type="button" className="corp-icon-button" aria-label="Close" onClick={ onClose }>×</button>
                </div>
                { done &&
                    <>
                        <div className="corp-dialog-body corp-dialog-done">
                            <span className="corp-done-mark" aria-hidden="true">✓</span>
                            <b>{ result.message }</b>
                        </div>
                        <div className="corp-dialog-foot">
                            <button type="button" className="mt-ghost" onClick={ again }>Issue another</button>
                            <button type="button" className="mt-chrome" onClick={ onClose }>Done</button>
                        </div>
                    </> }
                { !done &&
                    <>
                        <div className="corp-dialog-body">
                            <label className="corp-field">
                                <span className="mt-label">Employee</span>
                                <select className="form-select form-select-sm" value={ userId } onChange={ event => setUserId(Number(event.target.value)) } disabled={ !discipline }>
                                    <option value={ 0 }>{ discipline ? (people.length ? 'Choose someone' : 'Nobody is ranked below you') : 'Loading…' }</option>
                                    { people.map(person =>
                                        <option key={ person.userId } value={ person.userId }>{ person.username } · { RpRankTitle(person.rankName, person.tier) }</option>) }
                                </select>
                                { target &&
                                    <span className="mt-hint corp-count">
                                        This week: <CorpPips count={ target.warnings % perStrike } of={ perStrike } tone="warn" /> { target.warnings } { (target.warnings === 1) ? 'warning' : 'warnings' },
                                        <CorpPips count={ target.strikes } of={ forReview } tone="bad" /> { target.strikes } { (target.strikes === 1) ? 'strike' : 'strikes' }
                                    </span> }
                            </label>
                            <div className="corp-field">
                                <span className="mt-label" id="corp-issue-reason">Reason</span>
                                <div className="corp-reasons" role="group" aria-labelledby="corp-issue-reason">
                                    { [ ...REASONS[kind], OTHER ].map(option =>
                                        <button key={ option } type="button" aria-pressed={ (option === preset) } className={ `mt-seg-button ${ (option === preset) ? 'is-on' : '' }` } onClick={ () => setPreset(option) }>{ option }</button>) }
                                </div>
                                { (preset === OTHER) &&
                                    <input className="form-control form-control-sm" placeholder="The reason, in a few words" maxLength={ REASON_MAX } value={ custom } onChange={ event => setCustom(event.target.value) } aria-label="Reason" autoFocus /> }
                            </div>
                            <label className="corp-field">
                                <span className="mt-label">What happened</span>
                                <textarea className="form-control form-control-sm" rows={ 3 } maxLength={ DETAILS_MAX } placeholder="A line or two they'll read. Where, when, who saw it." value={ details } onChange={ event => setDetails(event.target.value) } />
                            </label>
                            <label className="corp-check">
                                <input type="checkbox" checked={ notify } onChange={ event => setNotify(event.target.checked) } />
                                <span>Tell them now with the reason, if they&apos;re online</span>
                            </label>
                            { effect && <div className={ `corp-effect is-${ effect.tone }` }>{ effect.text }</div> }
                            { result && !result.ok && <div className="corp-effect is-bad" role="alert">{ result.message }</div> }
                        </div>
                        <div className="corp-dialog-foot">
                            <button type="button" className="mt-ghost" onClick={ onClose }>Cancel</button>
                            <button type="submit" className="mt-chrome" disabled={ !target || !reason || sending }>
                                { sending ? 'Issuing…' : (isWarning ? 'Issue warning' : 'Issue strike') }
                            </button>
                        </div>
                    </> }
            </form>
        </div>
    );
}
