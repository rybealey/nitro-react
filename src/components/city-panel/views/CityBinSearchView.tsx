import { FC, useEffect, useState } from 'react';
import { SendMessageComposer } from '../../../api';
import { CityBinReward, CityBinRewardOption, CityCapability, RpCityBinRewardDeleteComposer, RpCityBinRewardsComposer, RpCityBinRewardsEvent, RpCityBinRewardSaveComposer } from '../../../api/rp-city/RpCityMessages';
import { useMessageEvent } from '../../../hooks';
import { CityPanelContext } from '../CityPanelView';
import { Amount } from './CityCorporationsView';

// The City Panel's Economy > Bin Search view: what searching a bin can turn
// up. Emulator: BinRewards, BinSearch.
//
// A search picks one row, each row's chance being its weight over the total,
// and pays an amount between its min and max - coins, a backpack item, or
// nothing. Read fresh on every search, so a change counts from the next one.

const COINS = 'coins';
const NOTHING = 'nothing';
const MAX_WEIGHT = 1000;
const MAX_COINS = 10000;
const MAX_ITEMS = 10;

// What a new row, or a row switched to another reward, starts out as.
const DEFAULT_WEIGHT = 10;
const defaultRange = (key: string): [ number, number ] => ((key === COINS) ? [ 3, 20 ] : (key === NOTHING) ? [ 0, 0 ] : [ 1, 1 ]);
const maxAmount = (key: string) => ((key === COINS) ? MAX_COINS : MAX_ITEMS);

export const CityBinSearchView: FC<{ context: CityPanelContext }> = props =>
{
    const { context } = props;
    const [ rewards, setRewards ] = useState<CityBinReward[]>([]);
    const [ options, setOptions ] = useState<CityBinRewardOption[]>([]);
    const [ adding, setAdding ] = useState('');
    const [ notice, setNotice ] = useState('');

    useEffect(() => SendMessageComposer(new RpCityBinRewardsComposer()), []);

    useMessageEvent<RpCityBinRewardsEvent>(RpCityBinRewardsEvent, event =>
    {
        const parser = event.getParser();

        setRewards(parser.rewards);
        setOptions(parser.options);

        if(parser.notice) setNotice(parser.notice);
    });

    const canEconomy = ((context.capabilities & CityCapability.Economy) === CityCapability.Economy);
    const total = rewards.reduce((sum, reward) => (sum + Math.max(0, reward.weight)), 0);
    const chance = (weight: number) => (total > 0 ? `${ Math.round((Math.max(0, weight) / total) * 100) }%` : '-');
    const nameOf = (key: string) => (options.find(option => (option.key === key))?.name ?? key);
    const addKey = adding || (options.length ? options[0].key : '');

    const save = (reward: CityBinReward, changes: Partial<CityBinReward>) =>
    {
        const next = { ...reward, ...changes };

        SendMessageComposer(new RpCityBinRewardSaveComposer(next.id, next.key, next.weight, next.min, next.max));
    }

    const changeKey = (reward: CityBinReward, key: string) =>
    {
        const [ min, max ] = defaultRange(key);

        save(reward, { key, min, max });
    }

    const add = () =>
    {
        if(!addKey) return;

        const [ min, max ] = defaultRange(addKey);

        SendMessageComposer(new RpCityBinRewardSaveComposer(0, addKey, DEFAULT_WEIGHT, min, max));
    }

    return (
        <div className="city-bins">
            { notice && <div className="city-notice" role="status">{ notice }</div> }
            <section className="mt-card mt-panel">
                <div className="city-world-line">
                    <span className="mt-label">What a bin search finds</span>
                    <span className="mt-muted city-small">one per search</span>
                </div>
                <div className="city-bin-row city-bin-head mt-muted">
                    <span>Reward</span>
                    <span>Weight</span>
                    <span>Chance</span>
                    <span>Min</span>
                    <span>Max</span>
                    <span />
                </div>
                <div className="city-list">
                    { rewards.map(reward =>
                        <div key={ reward.id } className="city-bin-row">
                            <select className="form-select form-select-sm" aria-label="Reward" value={ reward.key } disabled={ !canEconomy } onChange={ event => changeKey(reward, event.target.value) }>
                                { !options.some(option => (option.key === reward.key)) && <option value={ reward.key }>{ reward.key }</option> }
                                { options.map(option => <option key={ option.key } value={ option.key }>{ option.name }</option>) }
                            </select>
                            <Amount value={ reward.weight } label={ `${ nameOf(reward.key) } weight` } disabled={ !canEconomy } max={ MAX_WEIGHT } onSave={ weight => save(reward, { weight }) } />
                            <span className="city-bin-chance city-mono">{ chance(reward.weight) }</span>
                            { (reward.key === NOTHING)
                                ? <><span className="city-bin-none mt-muted">-</span><span className="city-bin-none mt-muted">-</span></>
                                : <>
                                    <Amount value={ reward.min } label={ `${ nameOf(reward.key) } least` } disabled={ !canEconomy } max={ maxAmount(reward.key) } onSave={ min => save(reward, { min, max: Math.max(min, reward.max) }) } />
                                    <Amount value={ reward.max } label={ `${ nameOf(reward.key) } most` } disabled={ !canEconomy } max={ maxAmount(reward.key) } onSave={ max => save(reward, { max, min: Math.min(max, reward.min) }) } />
                                </> }
                            <button type="button" className="mt-chrome mt-small city-bin-remove" aria-label={ `Remove ${ nameOf(reward.key) }` } title="Remove" disabled={ !canEconomy }
                                onClick={ () => SendMessageComposer(new RpCityBinRewardDeleteComposer(reward.id)) }>×</button>
                        </div>) }
                    { !rewards.length && <div className="mt-empty">Nothing in the bins - every search finds nothing.</div> }
                </div>
                <div className="city-bin-add">
                    <select className="form-select form-select-sm" aria-label="Reward to add" value={ addKey } disabled={ !canEconomy } onChange={ event => setAdding(event.target.value) }>
                        { options.map(option => <option key={ option.key } value={ option.key }>{ option.name }</option>) }
                    </select>
                    <button type="button" className="mt-chrome mt-small" disabled={ !canEconomy || !addKey } onClick={ add }>Add reward</button>
                </div>
                <span className="mt-hint">Chance is a row&apos;s weight out of the total. Coins and items pay between Min and Max. Only bins in PixelRP rooms can be searched; a searched bin stays empty for 15 minutes, and each account can search 5 bins every 24 hours.</span>
            </section>
        </div>
    );
}
