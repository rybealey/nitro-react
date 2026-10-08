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
    const onShift = corps.filter(entry => entry.onShift.length);
    // Prices follow the corporation picked above: each lists only its own.
    const corpPrices = prices.filter(price => (price.corporationId === corpId));

    return (
        <div className="city-economy">
            { notice && <div className="city-notice" role="status">{ notice }</div> }
            <div className="city-economy-grid">
                <section className="mt-card mt-panel">
                    <div className="city-world-line">
                        <span className="mt-label">Pay by rank</span>
                        <span className="mt-muted city-small">coins per 10 minutes on shift</span>
                    </div>
                    <select className="form-select form-select-sm" aria-label="Corporation" value={ corpId } onChange={ event => setCorpId(Number(event.target.value)) }>
                        { corps.map(entry => <option key={ entry.id } value={ entry.id }>{ entry.name }</option>) }
                    </select>
                    <div className="city-list">
                        { corp && corp.ranks.map(rank =>
                            <div key={ rank.id } className="city-list-row">
                                <span>{ rank.name }</span>
                                <Amount value={ rank.pay } label={ `${ rank.name } pay` } disabled={ !canEconomy } max={ 10000 } onSave={ pay => SendMessageComposer(new RpCityPaySaveComposer(rank.id, pay)) } />
                            </div>) }
                        { corp && !corp.ranks.length && <div className="mt-empty">No ranks.</div> }
                    </div>
                    <span className="mt-hint">Everyone on duty at a rank is paid the new figure from their next payday.</span>
                </section>
                <div className="city-economy-column">
                    <section className="mt-card mt-panel">
                        <span className="mt-label">On shift now</span>
                        { !onShift.length && <div className="mt-empty">Nobody is clocked in.</div> }
                        { onShift.map(entry =>
                            <div key={ entry.id } className="city-shift-corp">
                                <b>{ entry.name }</b>
                                { entry.onShift.map(worker =>
                                    <div key={ worker.userId } className="city-list-row">
                                        <span>{ worker.username } <span className="mt-muted">· { worker.rankName }</span></span>
                                        <button type="button" className="mt-chrome mt-small" disabled={ !canShifts } onClick={ () => SendMessageComposer(new RpCityClockOutComposer(worker.userId)) }>Clock out</button>
                                    </div>) }
                            </div>) }
                    </section>
                    <section className="mt-card mt-panel">
                        <span className="mt-label">Service prices{ corp && <span className="mt-label-note"> · { corp.name }</span> }</span>
                        <div className="city-list">
                            { corpPrices.map(price =>
                                <div key={ price.key } className="city-list-row">
                                    <span className="city-price-name">{ price.name }</span>
                                    <Amount value={ price.price } label={ `${ price.name } price` } disabled={ !canEconomy } max={ 100000 } onSave={ value => SendMessageComposer(new RpCityPriceSaveComposer(price.key, value)) } />
                                </div>) }
                            { !corpPrices.length && <div className="mt-empty">{ corp ? `${ corp.name } has no services priced yet.` : 'No services yet.' }</div> }
                        </div>
                        <span className="mt-hint">In coins. Each corporation starts charging its price when its billing ships.</span>
                    </section>
                </div>
            </div>
        </div>
    );
}
