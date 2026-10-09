import { FC, useEffect, useRef, useState } from 'react';
import { CreateLinkEvent, LocalizeFormattedNumber, SendMessageComposer } from '../../../api';
import { CityLedgerFilter, CityLedgerRow, CityLedgerTotals, RpCityLedgerComposer, RpCityLedgerPageEvent } from '../../../api/rp-city/RpCityMessages';
import { useMessageEvent } from '../../../hooks';

// The City Panel's Economy > Global Ledger: every movement of money in the
// city, newest first - coins on hand (emulator CoinLedger) beside the bank's
// checking and savings (rp_bank_transactions). Emulator: CityLedger.
//
// Read only. Search narrows it to players, the filter to one side of the
// money; it reads fifty at a time, with more on request.

const SEARCH_DELAY_MS = 300;

const FILTERS: [ number, string ][] = [
    [ CityLedgerFilter.All, 'All' ],
    [ CityLedgerFilter.Hand, 'On hand' ],
    [ CityLedgerFilter.Bank, 'Bank' ]
];

const ACCOUNTS: Record<string, string> = {
    hand: 'On hand',
    current: 'Checking',
    savings: 'Savings'
};

// BankTransactionKind, read by a person.
const KINDS: Record<string, string> = {
    open: 'Account opened',
    wages: 'Wages',
    interest: 'Interest',
    transfer_in: 'Transfer in',
    transfer_out: 'Transfer out',
    deposit: 'Deposit',
    withdraw: 'Withdrawal',
    pay_out: 'Pixel Cash sent',
    pay_in: 'Pixel Cash received'
};

const when = (seconds: number) => new Date(seconds * 1000).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

const signed = (amount: number) => `${ (amount > 0) ? '+' : (amount < 0) ? '−' : '' }${ LocalizeFormattedNumber(Math.abs(amount)) }`;

export const CityLedgerView: FC<{}> = props =>
{
    const [ query, setQuery ] = useState('');
    const [ filter, setFilter ] = useState(CityLedgerFilter.All);
    const [ rows, setRows ] = useState<CityLedgerRow[]>([]);
    const [ totals, setTotals ] = useState<CityLedgerTotals>(null);
    const [ more, setMore ] = useState(false);
    const [ loading, setLoading ] = useState(true);
    // The search the rows on screen belong to: a late page from an older one
    // is dropped rather than mixed in.
    const asked = useRef('');

    const request = (offset: number) =>
    {
        asked.current = `${ query.trim() }|${ filter }`;
        setLoading(true);
        SendMessageComposer(new RpCityLedgerComposer(query.trim(), filter, offset));
    }

    useEffect(() =>
    {
        const timeout = setTimeout(() => request(0), (query ? SEARCH_DELAY_MS : 0));

        return () => clearTimeout(timeout);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ query, filter ]);

    useMessageEvent<RpCityLedgerPageEvent>(RpCityLedgerPageEvent, event =>
    {
        const parser = event.getParser();

        if(asked.current !== `${ query.trim() }|${ filter }`) return;

        setTotals(parser.totals);
        setMore(parser.more);
        setRows(prev => ((parser.offset === 0) ? parser.rows : [ ...prev, ...parser.rows ]));
        setLoading(false);
    });

    return (
        <div className="city-ledger">
            <div className="mt-chips">
                <div className="mt-chip"><b className="city-mono">{ totals ? LocalizeFormattedNumber(totals.hand) : '–' }</b><span>Coins on hand</span></div>
                <div className="mt-chip"><b className="city-mono">{ totals ? LocalizeFormattedNumber(totals.checking) : '–' }</b><span>In checking</span></div>
                <div className="mt-chip"><b className="city-mono">{ totals ? LocalizeFormattedNumber(totals.savings) : '–' }</b><span>In savings</span></div>
                <div className="mt-chip"><b className="city-mono">{ totals ? LocalizeFormattedNumber(totals.accounts) : '–' }</b><span>Bank accounts</span></div>
            </div>
            <div className="city-ledger-tools">
                <input className="form-control form-control-sm" type="search" placeholder="Search by player" aria-label="Search the ledger by player" value={ query } maxLength={ 32 } onChange={ event => setQuery(event.target.value) } />
                <div className="mt-seg city-seg-3 city-ledger-filter" role="group" aria-label="Show">
                    { FILTERS.map(([ value, label ]) =>
                        <button key={ value } type="button" className={ `mt-seg-button${ (filter === value) ? ' is-on' : '' }` } aria-pressed={ (filter === value) } onClick={ () => setFilter(value) }>{ label }</button>) }
                </div>
                <button type="button" className="mt-chrome" onClick={ () => request(0) }>Refresh</button>
            </div>
            <div className="mt-card city-ledger-table">
                <div className="city-ledger-row city-ledger-head" role="row">
                    <span>When</span>
                    <span>Player</span>
                    <span>Where</span>
                    <span>What</span>
                    <span className="city-ledger-num">Amount</span>
                    <span className="city-ledger-num">Balance</span>
                </div>
                <div className="city-ledger-rows">
                    { rows.map((row, index) =>
                    {
                        const kind = (row.kind ? (KINDS[row.kind] ?? row.kind) : '');
                        const what = ((kind && row.source) ? `${ kind } · ${ row.source }` : (kind || row.source || '–'));

                        return (
                            <div key={ index } className="city-ledger-row" role="row">
                                <span className="mt-muted city-mono">{ when(row.createdAt) }</span>
                                <button type="button" className="city-ledger-player" title={ `Open ${ row.username }'s card` } onClick={ () => CreateLinkEvent(`city-panel/player/${ row.userId }`) }>{ row.username }</button>
                                <span><span className={ `city-ledger-where is-${ row.account }` }>{ ACCOUNTS[row.account] ?? row.account }</span></span>
                                <span className="city-ledger-what" title={ what }>{ what }</span>
                                <span className={ `city-ledger-num city-mono ${ (row.amount < 0) ? 'is-out' : 'is-in' }` }>{ signed(row.amount) }</span>
                                <span className="city-ledger-num city-mono mt-muted">{ LocalizeFormattedNumber(row.balanceAfter) }</span>
                            </div>
                        );
                    }) }
                    { (!rows.length && !loading) && <div className="mt-empty">{ query.trim() ? 'Nothing for that player.' : 'No money has moved yet.' }</div> }
                    { more && <button type="button" className="mt-chrome city-ledger-more" disabled={ loading } onClick={ () => request(rows.length) }>{ loading ? 'Loading…' : 'Load more' }</button> }
                </div>
            </div>
        </div>
    );
}
