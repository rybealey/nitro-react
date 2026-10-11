import { FC, useEffect, useRef, useState } from 'react';
import { CreateLinkEvent, SendMessageComposer } from '../../../api';
import { ResolveRpItem } from '../../../api/rp-inventory/RpItems';
import { CityTradeRow, RpCityTradesComposer, RpCityTradesPageEvent } from '../../../api/rp-city/RpCityMessages';
import { useMessageEvent } from '../../../hooks';

// The City Panel's Economy > Trade History: every completed backpack trade,
// newest first (emulator CityTrades, rp_trades). Read only; search narrows it
// to players, fifty at a time with more on request.

const SEARCH_DELAY_MS = 300;

const when = (seconds: number) => new Date(seconds * 1000).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

const gave = (items: { item: string, count: number }[]) =>
    items.length ? items.map(entry => `${ entry.count } × ${ ResolveRpItem(entry.item)?.name ?? entry.item }`).join(', ') : 'nothing';

export const CityTradesView: FC<{}> = props =>
{
    const [ query, setQuery ] = useState('');
    const [ rows, setRows ] = useState<CityTradeRow[]>([]);
    const [ more, setMore ] = useState(false);
    const [ loading, setLoading ] = useState(true);
    // The search the rows on screen belong to: a late page from an older one
    // is dropped rather than mixed in.
    const asked = useRef('');

    const request = (offset: number) =>
    {
        asked.current = query.trim();
        setLoading(true);
        SendMessageComposer(new RpCityTradesComposer(query.trim(), offset));
    }

    useEffect(() =>
    {
        const timeout = setTimeout(() => request(0), (query ? SEARCH_DELAY_MS : 0));

        return () => clearTimeout(timeout);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ query ]);

    useMessageEvent<RpCityTradesPageEvent>(RpCityTradesPageEvent, event =>
    {
        const parser = event.getParser();

        if(asked.current !== query.trim()) return;

        setMore(parser.more);
        setRows(prev => ((parser.offset === 0) ? parser.rows : [ ...prev, ...parser.rows ]));
        setLoading(false);
    });

    const player = (id: number, name: string) =>
        <button type="button" className="city-ledger-player" title={ `Open ${ name }'s card` } onClick={ () => CreateLinkEvent(`city-panel/player/${ id }`) }>{ name }</button>;

    return (
        <div className="city-ledger">
            <div className="city-ledger-tools">
                <input className="form-control form-control-sm" type="search" placeholder="Search by player" aria-label="Search trades by player" value={ query } maxLength={ 32 } onChange={ event => setQuery(event.target.value) } />
                <button type="button" className="mt-chrome" onClick={ () => request(0) }>Refresh</button>
            </div>
            <div className="mt-card city-ledger-table">
                <div className="city-trades-row city-ledger-head" role="row">
                    <span>When</span>
                    <span>Player</span>
                    <span>Gave</span>
                    <span>Player</span>
                    <span>Gave</span>
                    <span>Room</span>
                </div>
                <div className="city-ledger-rows">
                    { rows.map(row =>
                        <div key={ row.id } className="city-trades-row" role="row">
                            <span className="mt-muted city-mono">{ when(row.createdAt) }</span>
                            { player(row.userA, row.nameA) }
                            <span className="city-ledger-what" title={ gave(row.gaveA) }>{ gave(row.gaveA) }</span>
                            { player(row.userB, row.nameB) }
                            <span className="city-ledger-what" title={ gave(row.gaveB) }>{ gave(row.gaveB) }</span>
                            <span className="city-ledger-what mt-muted" title={ row.roomName }>{ row.roomName || '–' }</span>
                        </div>) }
                    { (!rows.length && !loading) && <div className="mt-empty">{ query.trim() ? 'No trades for that player.' : 'No trades yet.' }</div> }
                    { more && <button type="button" className="mt-chrome city-ledger-more" disabled={ loading } onClick={ () => request(rows.length) }>{ loading ? 'Loading…' : 'Load more' }</button> }
                </div>
            </div>
        </div>
    );
}
