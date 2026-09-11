import { FC, Fragment, useEffect, useMemo, useState } from 'react';
import { GetRpBankAccounts, GetRpBankLedger, IsRpBankLedgerLoaded, RpBankEntry, SendRpGetBankAccounts, SendRpGetBankLedger, SubscribeRpBankAccounts, SubscribeRpBankLedger } from '../../api/rp-phone/RpBankMessages';
import { LayoutCurrencyIcon } from '../../common';
import { PhoneIcon } from './PhoneIcon';

// Mercury: the phone's banking app.
//
// The Wallet holds the CARD - the thing you carry, beside your Resident ID.
// Mercury holds the ACCOUNT: both balances, and every movement through either
// of them. That split is why this is a separate app rather than another card
// in the Wallet, and why the panel here borrows the card's navy and guilloche
// but not its holo edge, which is the tell that says "you carry this one".
//
// One read, both accounts. Switching between checking and savings and
// filtering by kind are instant local decisions - asking the server again for
// each would make a toggle feel like a page load.

interface PhoneMercuryViewProps
{
    onBack: () => void;
}

// Matches the emulator's accrual tick, same as the Wallet's card.
const POLL_MS = 60000;

type Filter = 'all' | 'wages' | 'interest' | 'transfer' | 'cash';

const FILTERS: [ Filter, string ][] = [
    [ 'all', 'All' ], [ 'wages', 'Pay' ], [ 'interest', 'Interest' ],
    [ 'transfer', 'Transfers' ], [ 'cash', 'Cash' ]
];

// How each kind reads. One table so a row, its receipt and anything later can
// never describe the same movement differently.
//
// `tone` decides the colour: in and out are the money you earned and spent, but
// a TRANSFER is the same money in the same hands, so it is neither - a green +
// on it would be the app telling you that you got richer by moving it.
const KINDS: { [key: string]: { title: string; tone: 'in' | 'out' | 'flat'; mark: string }} = {
    wages: { title: 'Shift pay', tone: 'in', mark: 'briefcase' },
    interest: { title: 'Interest', tone: 'in', mark: 'percent' },
    deposit: { title: 'Cash Deposit', tone: 'in', mark: 'arrow-down-to-line' },
    withdraw: { title: 'Cash Withdrawal', tone: 'out', mark: 'arrow-up-from-line' },
    transfer_in: { title: 'Transfer', tone: 'flat', mark: 'right-left' },
    transfer_out: { title: 'Transfer', tone: 'flat', mark: 'right-left' },
    open: { title: 'Account opened', tone: 'flat', mark: 'circle-plus' }
};

const FALLBACK = { title: 'Movement', tone: 'flat' as const, mark: 'circle-plus' };

const Money = (value: number): string => Math.abs(value || 0).toLocaleString('en-US');

const Signed = (value: number): string =>
{
    if(!value) return '0';

    return ((value > 0) ? '+' : '-') + Money(value);
}

// Day headers a player actually thinks in. Anything older than yesterday gets
// its date, because "3 days ago" makes you do the arithmetic yourself.
const DayLabel = (createdAt: number): string =>
{
    const then = new Date(createdAt * 1000);
    const now = new Date();
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const stamp = new Date(then.getFullYear(), then.getMonth(), then.getDate()).getTime();
    const days = Math.round((midnight - stamp) / 86400000);

    if(days <= 0) return 'Today';
    if(days === 1) return 'Yesterday';

    return then.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
}

const Clock = (createdAt: number): string =>
    new Date(createdAt * 1000).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });

const NextInterest = (seconds: number): string =>
{
    if(seconds <= 0) return 'due now';

    const minutes = Math.ceil(seconds / 60);

    return (minutes >= 60) ? `in ${ Math.floor(minutes / 60) }h ${ minutes % 60 }m` : `in ${ minutes }m`;
}

export const PhoneMercuryView: FC<PhoneMercuryViewProps> = props =>
{
    const { onBack = null } = props;
    const [ bank, setBank ] = useState(() => GetRpBankAccounts());
    const [ entries, setEntries ] = useState<RpBankEntry[]>(() => GetRpBankLedger());
    const [ loaded, setLoaded ] = useState(() => IsRpBankLedgerLoaded());
    const [ savings, setSavings ] = useState(false);
    const [ filter, setFilter ] = useState<Filter>('all');
    const [ openId, setOpenId ] = useState(0);

    useEffect(() => SubscribeRpBankAccounts(() => setBank(GetRpBankAccounts())), []);

    useEffect(() => SubscribeRpBankLedger(() =>
    {
        setEntries(GetRpBankLedger());
        setLoaded(true);
    }), []);

    // A block body, not a concise one: the send returns a boolean and React
    // would take it for a cleanup function.
    useEffect(() =>
    {
        SendRpGetBankAccounts();
        SendRpGetBankLedger();
    }, []);

    // Balances move on the emulator's minute tick; the ledger only gains a row
    // when something actually happens, so both ride the same poll rather than
    // the ledger running on a timer of its own.
    useEffect(() =>
    {
        const timer = setInterval(() =>
        {
            SendRpGetBankAccounts();
            SendRpGetBankLedger();
        }, POLL_MS);

        return () => clearInterval(timer);
    }, []);

    const account = savings ? 'savings' : 'current';

    const visible = useMemo(() => entries.filter(entry =>
    {
        if(entry.account !== account) return false;
        if(filter === 'all') return true;
        if(filter === 'transfer') return (entry.kind.indexOf('transfer') === 0);
        if(filter === 'cash') return ((entry.kind === 'deposit') || (entry.kind === 'withdraw'));

        return (entry.kind === filter);
    }), [ entries, account, filter ]);

    // Grouped by day, in the order they arrived - the server already sorts
    // newest first, so this never re-sorts and never disagrees with it.
    const days = useMemo(() =>
    {
        const out: { label: string; rows: RpBankEntry[] }[] = [];

        visible.forEach(entry =>
        {
            const label = DayLabel(entry.createdAt);
            const last = out[out.length - 1];

            if(last && (last.label === label)) last.rows.push(entry);
            else out.push({ label, rows: [ entry ] });
        });

        return out;
    }, [ visible ]);

    const open = useMemo(() => entries.filter(entry => (entry.id === openId))[0] || null, [ entries, openId ]);

    // Today's movement on the account being shown, from the ledger itself
    // rather than a second figure the server would have to keep in step.
    const todays = useMemo(() =>
    {
        let paid = 0;
        let spent = 0;

        entries.forEach(entry =>
        {
            if((entry.account !== account) || (DayLabel(entry.createdAt) !== 'Today')) return;

            if(entry.amount > 0) paid += entry.amount;
            else spent += entry.amount;
        });

        return { paid, spent };
    }, [ entries, account ]);

    const look = (entry: RpBankEntry) => (KINDS[entry.kind] || FALLBACK);

    // A transfer's direction is derivable from the account it landed in and
    // the sign, so it is derived rather than read off `source` - which said
    // only "transfer" on every row written before this, and would have left
    // the oldest half of everyone's ledger saying nothing at all.
    const subtitle = (entry: RpBankEntry): string =>
    {
        // `source` is free text written by several code paths over time, and
        // the early ones wrote sentence fragments in lower case. Sentence-case
        // it on the way out rather than leaving the oldest rows in anybody's
        // ledger reading like log output.
        if(entry.kind.indexOf('transfer') !== 0)
        {
            const source = (entry.source || '');

            if(!source) return Clock(entry.createdAt);

            return (source.charAt(0).toUpperCase() + source.slice(1));
        }

        const savings = (entry.account === 'savings');

        if(entry.amount >= 0) return savings ? 'From checking' : 'From savings';

        return savings ? 'To checking' : 'To savings';
    };

    const row = (entry: RpBankEntry) =>
    {
        const kind = look(entry);

        return (
            <div key={ entry.id } className="phone-tap phone-merc-row" onClick={ event => setOpenId(entry.id) }>
                <div className={ `phone-merc-mark is-${ kind.tone }` }><PhoneIcon icon={ kind.mark } size={ 16 } /></div>
                <div className="phone-merc-row-body">
                    <div className="phone-merc-row-title">{ kind.title }</div>
                    <div className="phone-merc-row-sub">{ subtitle(entry) }</div>
                </div>
                <div className="phone-merc-row-tail">
                    <div className={ `phone-merc-amount is-${ kind.tone }` }>
                        <LayoutCurrencyIcon type={ -1 } />{ Signed(entry.amount) }
                    </div>
                    { /* The running balance, bare. "left" was wrong on anything paid IN -
                         nothing was taken, so nothing was left. The receipt names it. */ }
                    <div className="phone-merc-after">{ Money(entry.balanceAfter) }</div>
                </div>
            </div>
        );
    };

    return (
        <div className="phone-screen phone-app-screen phone-mercury">
            <div className="phone-app-scroll">
                <div className="phone-app-header">
                    <div className="phone-app-header-lead">
                        <div className="phone-tap phone-thread-back" onClick={ event => (onBack && onBack()) }>
                            <PhoneIcon icon="chevron-left" size={ 24 } />
                        </div>
                        <div>
                            <div className="phone-app-kicker">MERCURY</div>
                            <div className="phone-app-title">Mercury</div>
                        </div>
                    </div>
                </div>
                { !bank.hasAccount &&
                    <div className="phone-merc-blank">
                        <div className="phone-merc-blank-mark"><PhoneIcon icon="right-left" size={ 30 } /></div>
                        <div className="phone-merc-blank-title">Nothing to show yet</div>
                        <div className="phone-merc-blank-body">
                            Mercury reads the accounts you already hold. Open a current and a savings
                            account, and everything that moves through them lands here.
                        </div>
                        <div className="phone-merc-blank-foot">
                            Wages are paid into your current account once you have one. Until then they
                            stay in hand, exactly as they do today.
                        </div>
                    </div> }
                { bank.hasAccount &&
                    <>
                        { /* The phone's two-way pill, straight from Settings > General. */ }
                        <div className="phone-segmented phone-merc-switch">
                            <div className="phone-segmented-thumb" style={ { transform: `translateX(${ savings ? '100%' : '0%' })` } } />
                            <div className={ `phone-tap phone-segmented-option${ savings ? '' : ' is-on' }` }
                                onClick={ event => 
                                {
                                    setSavings(false); setOpenId(0); 
                                } }>Checking</div>
                            <div className={ `phone-tap phone-segmented-option${ savings ? ' is-on' : '' }` }
                                onClick={ event => 
                                {
                                    setSavings(true); setOpenId(0); 
                                } }>Savings</div>
                        </div>
                        <div className="phone-merc-panel">
                            <div className="phone-wallet-field" />
                            <div className={ `phone-merc-panel-rule${ savings ? ' is-savings' : '' }` } />
                            <div className="phone-merc-panel-body">
                                <div className="phone-merc-panel-label">{ savings ? 'SAVINGS' : 'CHECKING' }</div>
                                <div className="phone-merc-balance">
                                    <LayoutCurrencyIcon type={ -1 } />
                                    <span>{ Money(savings ? bank.savings : bank.current) }</span>
                                    { /* The ceiling is on savings, so only savings shows one. A meter
                                         on an account that can never fill would say the wrong thing. */ }
                                    { savings && <em>/ { Money(bank.savingsCap) }</em> }
                                </div>
                                { savings &&
                                    <div className="phone-merc-meter">
                                        <span style={ { width: `${ Math.min(100, bank.savingsCap ? ((bank.savings / bank.savingsCap) * 100) : 0) }%` } } />
                                    </div> }
                                <div className="phone-merc-panel-foot">
                                    { savings &&
                                        <>
                                            <div className="phone-merc-stat">
                                                <div className="phone-merc-stat-label">EARNING</div>
                                                <div className="phone-merc-stat-value is-in">{ (bank.rateBps / 100).toFixed(2) }% / hr</div>
                                            </div>
                                            <div className="phone-merc-stat">
                                                <div className="phone-merc-stat-label">NEXT PAYMENT</div>
                                                <div className="phone-merc-stat-value">{ NextInterest(bank.secondsToInterest) }</div>
                                            </div>
                                        </> }
                                    { !savings &&
                                        <>
                                            <div className="phone-merc-stat">
                                                <div className="phone-merc-stat-label">IN TODAY</div>
                                                <div className="phone-merc-stat-value is-in">{ Signed(todays.paid) }</div>
                                            </div>
                                            <div className="phone-merc-stat">
                                                <div className="phone-merc-stat-label">OUT TODAY</div>
                                                <div className="phone-merc-stat-value is-out">{ Signed(todays.spent) }</div>
                                            </div>
                                        </> }
                                </div>
                            </div>
                        </div>
                        <div className="phone-merc-chips">
                            { FILTERS.map(([ key, label ]) =>
                                <div key={ key } className={ `phone-tap phone-merc-chip${ (filter === key) ? ' is-on' : '' }` }
                                    onClick={ event => 
                                    {
                                        setFilter(key); setOpenId(0); 
                                    } }>{ label }</div>) }
                        </div>
                        { !loaded &&
                            <div className="phone-merc-rows">
                                { [ 0, 1, 2, 3, 4 ].map(index =>
                                    <div key={ index } className="phone-merc-row is-skeleton">
                                        <div className="phone-merc-mark is-skeleton" />
                                        <div className="phone-merc-row-body">
                                            <div className="phone-merc-skel" style={ { width: '68px' } } />
                                            <div className="phone-merc-skel is-sub" style={ { width: '118px' } } />
                                        </div>
                                        <div className="phone-merc-row-tail">
                                            <div className="phone-merc-skel" style={ { width: '52px' } } />
                                            <div className="phone-merc-skel is-sub" style={ { width: '40px' } } />
                                        </div>
                                    </div>) }
                            </div> }
                        { /* A Fragment, not a wrapping div: inside one the eyebrow is a
                             :first-child, and .phone-section-label zeroes its top margin
                             there - which collapsed the gap between the chips and TODAY. */ }
                        { loaded && days.map(day =>
                            <Fragment key={ day.label }>
                                <div className="phone-section-label">{ day.label.toUpperCase() }</div>
                                <div className="phone-merc-rows">{ day.rows.map(entry => row(entry)) }</div>
                            </Fragment>) }
                        { loaded && !days.length &&
                            <div className="phone-list-note phone-merc-none">
                                { (filter === 'all')
                                    ? 'Nothing has moved through this account yet.'
                                    : 'Nothing here under this filter.' }
                            </div> }
                    </> }
                <div className="phone-scroll-spacer" />
            </div>
            { !!open &&
                <>
                    <div className="phone-merc-scrim" onClick={ event => setOpenId(0) } />
                    <div className="phone-merc-sheet">
                        <div className="phone-merc-grab" />
                        <div className="phone-merc-sheet-head">
                            <div className={ `phone-merc-mark is-big is-${ look(open).tone }` }>
                                <PhoneIcon icon={ look(open).mark } size={ 20 } />
                            </div>
                            <div>
                                <div className={ `phone-merc-sheet-amount is-${ look(open).tone }` }>
                                    <LayoutCurrencyIcon type={ -1 } />{ Signed(open.amount) }
                                </div>
                                <div className="phone-merc-sheet-kind">{ look(open).title }</div>
                            </div>
                        </div>
                        <div className="phone-merc-details">
                            <div className="phone-merc-detail">
                                <div className="phone-merc-detail-key">Account</div>
                                <div className="phone-merc-detail-val">{ (open.account === 'savings') ? 'Savings' : 'Checking' }</div>
                            </div>
                            <div className="phone-merc-detail">
                                <div className="phone-merc-detail-key">When</div>
                                <div className="phone-merc-detail-val">{ DayLabel(open.createdAt) }, { Clock(open.createdAt) }</div>
                            </div>
                            <div className="phone-merc-detail">
                                <div className="phone-merc-detail-key">Source</div>
                                <div className="phone-merc-detail-val">{ subtitle(open) }</div>
                            </div>
                            <div className="phone-merc-detail">
                                <div className="phone-merc-detail-key">Balance after</div>
                                { /* The coin, not a trailing "c" - every other figure on
                                     this sheet carries the icon, and "0c" read as a typo. */ }
                                <div className="phone-merc-detail-val is-money">
                                    <LayoutCurrencyIcon type={ -1 } />{ Money(open.balanceAfter) }
                                </div>
                            </div>
                            <div className="phone-merc-detail">
                                <div className="phone-merc-detail-key">Reference</div>
                                <div className="phone-merc-detail-val">MRC-{ open.id }</div>
                            </div>
                        </div>
                        <div className="phone-tap phone-merc-close" onClick={ event => setOpenId(0) }>Done</div>
                    </div>
                </> }
        </div>
    );
}
