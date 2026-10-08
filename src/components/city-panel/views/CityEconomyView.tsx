import { FC, useEffect, useState } from 'react';
import { SendMessageComposer } from '../../../api';
import { CityCapability, CityEconomyCorp, CityServicePrice, RpCityClockOutComposer, RpCityEconomyComposer, RpCityEconomyStateEvent, RpCityPaySaveComposer, RpCityPriceSaveComposer } from '../../../api/rp-city/RpCityMessages';
import { useMessageEvent } from '../../../hooks';
import { CityPanelContext } from '../CityPanelView';

// The City Panel's Economy tab: what each rank of every corporation is paid,
// who is on shift right now, and what the city's services cost. Emulator:
// CityEconomy, ServicePrices.
//
// A service price is set here ahead of its billing: each corporation starts
// charging its price when that billing ships. Until then it is only a number.

const has = (capabilities: number, capability: number) => ((capabilities & capability) === capability);

const REFRESH_MS = 15000;

// A number field that saves when it loses focus or Enter is pressed, and only
// when the value actually changed.
const Amount: FC<{ value: number, label: string, disabled: boolean, max: number, onSave: (value: number) => void }> = props =>
{
    const { value, label, disabled, max, onSave } = props;
    const [ text, setText ] = useState(String(value));

    useEffect(() => setText(String(value)), [ value ]);

    const commit = () =>
    {
        const next = Math.max(0, Math.min(max, Math.trunc(Number(text))));

        if(!Number.isFinite(next) || (next === value))
        {
            setText(String(value));

            return;
        }

        onSave(next);
    }

    return (
        <input className="form-control form-control-sm city-amount city-mono" type="number" min={ 0 } max={ max } aria-label={ label } value={ text } disabled={ disabled }
            onChange={ event => setText(event.target.value) } onBlur={ commit } onKeyDown={ event => (event.key === 'Enter') && (event.target as HTMLInputElement).blur() } />
    );
}

export const CityEconomyView: FC<{ context: CityPanelContext }> = props =>
{
    const { context } = props;
    const [ corps, setCorps ] = useState<CityEconomyCorp[]>([]);
    const [ prices, setPrices ] = useState<CityServicePrice[]>([]);
    const [ corpId, setCorpId ] = useState(0);
    const [ notice, setNotice ] = useState('');

    useEffect(() =>
    {
        SendMessageComposer(new RpCityEconomyComposer());

        // Who is on shift changes by the minute; the rest only when staff edit it.
        const interval = setInterval(() => SendMessageComposer(new RpCityEconomyComposer()), REFRESH_MS);

        return () => clearInterval(interval);
    }, []);

    useMessageEvent<RpCityEconomyStateEvent>(RpCityEconomyStateEvent, event =>
    {
        const parser = event.getParser();

        setCorps(parser.corps);
        setPrices(parser.prices);
        setCorpId(prev => (prev || (parser.corps.length ? parser.corps[0].id : 0)));

        if(parser.notice) setNotice(parser.notice);
    });

    const canEconomy = has(context.capabilities, CityCapability.Economy);
    const canShifts = has(context.capabilities, CityCapability.Shifts);
    const corp = corps.find(entry => (entry.id === corpId)) ?? null;
    // Everything on the right follows the corporation picked on the left.
    const corpPrices = prices.filter(price => (price.corporationId === corpId));

    return (
        <div className="city-economy">
            <div className="city-economy-corps">
                <span className="mt-label">Corporation</span>
                <div className="mt-card city-economy-corp-list" role="listbox" aria-label="Corporation">
                    { corps.map(entry =>
                        <button key={ entry.id } type="button" role="option" aria-selected={ (entry.id === corpId) } className={ `city-economy-corp${ (entry.id === corpId) ? ' is-active' : '' }` } onClick={ () => setCorpId(entry.id) }>
                            <span className="city-economy-corp-name">{ entry.name }</span>
                            { (entry.onShift.length > 0) && <span className="city-economy-badge" title={ `${ entry.onShift.length } on shift` }>{ entry.onShift.length }</span> }
                        </button>) }
                    { !corps.length && <div className="mt-empty">No corporations.</div> }
                </div>
                <span className="mt-hint">The number is how many are on shift now.</span>
            </div>
            <div className="city-economy-main">
                { notice && <div className="city-notice" role="status">{ notice }</div> }
                { !corp && <div className="mt-empty">Pick a corporation.</div> }
                { corp &&
                    <div className="city-economy-grid">
                        <section className="mt-card mt-panel">
                            <div className="city-world-line">
                                <span className="mt-label">Pay by rank</span>
                                <span className="mt-muted city-small">coins per 10 minutes on shift</span>
                            </div>
                            <div className="city-list">
                                { corp.ranks.map(rank =>
                                    <div key={ rank.id } className="city-list-row">
                                        <span>{ rank.name }</span>
                                        <Amount value={ rank.pay } label={ `${ rank.name } pay` } disabled={ !canEconomy } max={ 10000 } onSave={ pay => SendMessageComposer(new RpCityPaySaveComposer(rank.id, pay)) } />
                                    </div>) }
                                { !corp.ranks.length && <div className="mt-empty">No ranks.</div> }
                            </div>
                            <span className="mt-hint">Everyone on duty at a rank is paid the new figure from their next payday.</span>
                        </section>
                        <div className="city-economy-column">
                            <section className="mt-card mt-panel">
                                <span className="mt-label">On shift now</span>
                                { !corp.onShift.length && <div className="mt-empty">Nobody is clocked in.</div> }
                                { (corp.onShift.length > 0) &&
                                    <div className="city-list">
                                        { corp.onShift.map(worker =>
                                            <div key={ worker.userId } className="city-list-row">
                                                <span>{ worker.username } <span className="mt-muted">· { worker.rankName }</span></span>
                                                <button type="button" className="mt-chrome mt-small" disabled={ !canShifts } onClick={ () => SendMessageComposer(new RpCityClockOutComposer(worker.userId)) }>Clock out</button>
                                            </div>) }
                                    </div> }
                            </section>
                            <section className="mt-card mt-panel">
                                <span className="mt-label">Service prices</span>
                                <div className="city-list">
                                    { corpPrices.map(price =>
                                        <div key={ price.key } className="city-list-row">
                                            <span className="city-price-name">{ price.name }</span>
                                            <Amount value={ price.price } label={ `${ price.name } price` } disabled={ !canEconomy } max={ 100000 } onSave={ value => SendMessageComposer(new RpCityPriceSaveComposer(price.key, value)) } />
                                        </div>) }
                                    { !corpPrices.length && <div className="mt-empty">No services priced yet.</div> }
                                </div>
                                <span className="mt-hint">In coins. Charged once the corporation&apos;s billing ships.</span>
                            </section>
                        </div>
                    </div> }
            </div>
        </div>
    );
}
