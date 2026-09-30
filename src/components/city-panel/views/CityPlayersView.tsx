import { FC, useEffect, useMemo, useState } from 'react';
import { CreateLinkEvent, SendMessageComposer } from '../../../api';
import { CityAction, CityBackpackEntry, CityBackpackOp, CityCapability, CityPlayerCard, CityPlayerFilter, CityPlayerFlag, CityPlayerRow, RpCityBackpackComposer, RpCityPlayerActionComposer, RpCityPlayerCardEvent, RpCityPlayerComposer, RpCitySearchComposer, RpCitySearchResultEvent } from '../../../api/rp-city/RpCityMessages';
import { ResolveRpItem } from '../../../api/rp-inventory/RpItems';
import { LayoutAvatarImageView } from '../../../common';
import { useMessageEvent } from '../../../hooks';
import { CityPanelContext } from '../CityPanelView';

// The City Panel's Players tab: search anyone (online or not), open their
// card - stats, record, job, coins - act on them, and see and change their
// backpack. Every change comes back as a fresh card, so what the panel shows
// is what is true now.

const FILTERS: [ string, number ][] = [
    [ 'All', CityPlayerFilter.All ],
    [ 'Online', CityPlayerFilter.Online ],
    [ 'Wanted', CityPlayerFilter.Wanted ],
    [ 'In jail', CityPlayerFilter.Jailed ]
];

const SEARCH_DEBOUNCE_MS = 250;
const WEAPON_SLOT = 101;
const CARRY_SLOTS = [ 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12 ];

const has = (capabilities: number, capability: number) => ((capabilities & capability) === capability);

const clock = (seconds: number) => `${ Math.floor(seconds / 60) }:${ String(seconds % 60).padStart(2, '0') }`;

const Bar: FC<{ label: string, value: number, max: number, kind: string }> = ({ label, value, max, kind }) =>
{
    const width = ((max > 0) ? Math.max(0, Math.min(100, (value / max) * 100)) : 0);

    return (
        <div className="city-bar">
            <div className="city-bar-head"><span>{ label }</span><b>{ (max > 0) ? `${ value }/${ max }` : value }</b></div>
            <div className="city-bar-track"><div className={ `city-bar-fill is-${ kind }` } style={ { width: `${ width }%` } } /></div>
        </div>
    );
}

export const CityPlayersView: FC<{ context: CityPanelContext, openPlayerId: number, onOpened: () => void }> = props =>
{
    const { context, openPlayerId, onOpened } = props;
    const [ query, setQuery ] = useState('');
    const [ filter, setFilter ] = useState(CityPlayerFilter.Online);
    const [ rows, setRows ] = useState<CityPlayerRow[]>([]);
    const [ card, setCard ] = useState<CityPlayerCard>(null);
    const [ notice, setNotice ] = useState('');
    const [ selectedSlot, setSelectedSlot ] = useState(0);
    const [ giveItem, setGiveItem ] = useState('');
    const [ balance, setBalance ] = useState('');
    const [ confirmKill, setConfirmKill ] = useState(false);

    useEffect(() =>
    {
        const timer = setTimeout(() => SendMessageComposer(new RpCitySearchComposer(query, filter)), SEARCH_DEBOUNCE_MS);

        return () => clearTimeout(timer);
    }, [ query, filter ]);

    useEffect(() =>
    {
        if(!openPlayerId) return;

        SendMessageComposer(new RpCityPlayerComposer(openPlayerId));
        onOpened();
    }, [ openPlayerId, onOpened ]);

    useMessageEvent<RpCitySearchResultEvent>(RpCitySearchResultEvent, event => setRows(event.getParser().rows));

    useMessageEvent<RpCityPlayerCardEvent>(RpCityPlayerCardEvent, event =>
    {
        const parser = event.getParser();

        if(!parser.card) return;

        setCard(prev =>
        {
            // A different player: start their card from nothing selected.
            if(!prev || (prev.id !== parser.card.id))
            {
                setSelectedSlot(0);
                setConfirmKill(false);
                setBalance('');
            }

            return parser.card;
        });
        setNotice(parser.notice);
    });

    const open = (userId: number) =>
    {
        setNotice('');
        SendMessageComposer(new RpCityPlayerComposer(userId));
    }

    const act = (action: number, amount = 0) =>
    {
        if(!card) return;

        setConfirmKill(false);
        SendMessageComposer(new RpCityPlayerActionComposer(card.id, action, amount));
    }

    const backpack = (op: number, slot: number, item = '', count = 0) =>
    {
        if(!card) return;

        SendMessageComposer(new RpCityBackpackComposer(card.id, op, slot, item, count));
    }

    const bySlot = useMemo(() =>
    {
        const map = new Map<number, CityBackpackEntry>();

        if(card) for(const entry of card.backpack) map.set(entry.slot, entry);

        return map;
    }, [ card ]);

    const selected = bySlot.get(selectedSlot);
    const canBackpack = has(context.capabilities, CityCapability.Backpack);
    const balanceAmount = Math.trunc(Number(balance));

    const slotView = (slot: number, locked: boolean) =>
    {
        const entry = bySlot.get(slot);
        const meta = (entry ? ResolveRpItem(entry.item) : null);
        const label = (entry ? `${ meta?.name ?? entry.item }${ (entry.count > 1) ? ` ×${ entry.count }` : '' }` : (locked ? 'Locked (VIP)' : 'Empty'));

        return (
            <button key={ slot } type="button" title={ label } aria-label={ label } disabled={ !entry }
                className={ `city-slot${ entry ? ' has-item' : '' }${ locked ? ' is-locked' : '' }${ (selectedSlot === slot) ? ' is-selected' : '' }` }
                onClick={ () => setSelectedSlot(prev => ((prev === slot) ? 0 : slot)) }>
                { entry &&
                    <>
                        <div className={ `rp-inventory-item ${ meta?.cls ?? '' }` } style={ meta?.iconUrl ? { backgroundImage: `url(${ meta.iconUrl })` } : undefined } />
                        { (entry.count > 1) && <span className="city-slot-count">{ entry.count }</span> }
                    </> }
            </button>
        );
    }

    return (
        <div className="city-players">
            <div className="city-players-list">
                <input className="form-control form-control-sm" type="search" placeholder="Search by name" aria-label="Search players" value={ query } maxLength={ 32 } onChange={ event => setQuery(event.target.value) } />
                <div className="mt-seg city-seg-4" role="group" aria-label="Filter players">
                    { FILTERS.map(([ label, value ]) =>
                        <button key={ value } type="button" className={ `mt-seg-button${ (filter === value) ? ' is-on' : '' }` } aria-pressed={ (filter === value) } onClick={ () => setFilter(value) }>{ label }</button>) }
                </div>
                <div className="mt-card city-results">
                    { !rows.length && <div className="mt-empty">No players found.</div> }
                    { rows.map(row =>
                        <button key={ row.id } type="button" className={ `city-result${ (card?.id === row.id) ? ' is-active' : '' }` } onClick={ () => open(row.id) }>
                            <div className="city-result-head">
                                <LayoutAvatarImageView figure={ row.look } gender={ row.gender } headOnly direction={ 2 } />
                            </div>
                            <div className="city-result-text">
                                <b>{ row.username }</b>
                                <span className="mt-muted">{ row.where }</span>
                            </div>
                            <span className={ `mt-dot${ row.online ? ' is-online' : '' }` } />
                            { has(row.flags, CityPlayerFlag.Wanted) && <span className="city-flag is-wanted" title="Wanted">W</span> }
                            { has(row.flags, CityPlayerFlag.Jailed) && <span className="city-flag is-jailed" title="In jail">J</span> }
                        </button>) }
                </div>
            </div>
            <div className="city-players-card">
                { !card && <div className="mt-empty">Pick a player to see their card.</div> }
                { card &&
                    <>
                        <div className="mt-card city-card">
                            <div className="city-card-figure">
                                <LayoutAvatarImageView figure={ card.look } gender={ card.gender } direction={ 2 } />
                            </div>
                            <div className="city-card-body">
                                <div className="city-card-title">
                                    <b>{ card.username }</b>
                                    <span className="mt-muted">#{ card.id }</span>
                                    <span className={ `mt-dot${ card.online ? ' is-online' : '' }` } title={ card.online ? 'Online' : 'Offline' } />
                                    { (card.openCharges > 0) && <span className="city-chip is-wanted">Wanted · { card.openCharges } { (card.openCharges === 1) ? 'charge' : 'charges' }</span> }
                                    { (card.jailSecondsLeft > 0) && <span className="city-chip is-jailed">Jailed · { clock(card.jailSecondsLeft) } left</span> }
                                    { card.cuffed && <span className="city-chip is-cuffed">Cuffed</span> }
                                    { card.onDuty && <span className="city-chip is-duty">On duty</span> }
                                    { card.gang && <span className="city-chip is-gang">{ card.gang }</span> }
                                </div>
                                <span className="mt-muted">{ card.job || 'Unemployed' } · { card.online ? `in ${ card.where }` : 'offline' } · { card.credits.toLocaleString() } coins</span>
                                <div className="city-bars">
                                    <Bar label="Health" value={ card.health } max={ card.healthMax } kind="hp" />
                                    <Bar label="Energy" value={ card.energy } max={ card.energyMax } kind="en" />
                                    <Bar label="Aggression" value={ card.aggression } max={ 100 } kind="agg" />
                                </div>
                            </div>
                        </div>
                        { notice && <div className="city-notice" role="status">{ notice }</div> }
                        <div className="city-actions">
                            <button type="button" className="mt-chrome" disabled={ !has(context.capabilities, CityCapability.Restore) } onClick={ () => act(CityAction.Restore) }>Restore</button>
                            <button type="button" className="mt-chrome" disabled={ !card.online || !has(context.capabilities, CityCapability.Summon) } onClick={ () => act(CityAction.Summon) }>Summon here</button>
                            <button type="button" className="mt-chrome" disabled={ !card.online || !has(context.capabilities, CityCapability.GoTo) } onClick={ () => act(CityAction.GoTo) }>Go to them</button>
                            <button type="button" className="mt-chrome" onClick={ () => CreateLinkEvent(`mod-tools/open-user-info/${ card.id }`) }>Mod Tools</button>
                            <button type="button" className="mt-chrome" disabled={ (card.jailSecondsLeft <= 0) || !has(context.capabilities, CityCapability.Justice) } onClick={ () => act(CityAction.Release) }>Release from jail</button>
                            <button type="button" className="mt-chrome" disabled={ (card.openCharges <= 0) || !has(context.capabilities, CityCapability.Justice) } onClick={ () => act(CityAction.ClearCharges) }>Clear charges</button>
                            <button type="button" className="mt-danger" disabled={ !card.online || !has(context.capabilities, CityCapability.Kill) } onClick={ () => (confirmKill ? act(CityAction.Kill) : setConfirmKill(true)) }>{ confirmKill ? 'Confirm knock out' : 'Knock out' }</button>
                            <div className="city-balance">
                                <input className="form-control form-control-sm" type="number" placeholder="± coins" aria-label="Coins to add or take" value={ balance } disabled={ !has(context.capabilities, CityCapability.Balance) } onChange={ event => setBalance(event.target.value) } />
                                <button type="button" className="mt-chrome" disabled={ !has(context.capabilities, CityCapability.Balance) || !balanceAmount } onClick={ () => 
                                {
                                    act(CityAction.AdjustBalance, balanceAmount); setBalance(''); 
                                } }>Apply</button>
                            </div>
                        </div>
                        <div className="mt-card mt-panel city-backpack">
                            <div className="city-backpack-head">
                                <span className="mt-label">Backpack <span className="mt-label-note">· { card.backpack.filter(entry => (entry.slot !== WEAPON_SLOT)).length } of { card.unlockedSlots } slots</span></span>
                                { canBackpack &&
                                    <div className="city-give">
                                        <select className="form-select form-select-sm" aria-label="Item to give" value={ giveItem } onChange={ event => setGiveItem(event.target.value) }>
                                            <option value="">Give an item…</option>
                                            { context.items.map(item => <option key={ item.key } value={ item.key }>{ item.name }</option>) }
                                        </select>
                                        <button type="button" className="mt-chrome mt-small" disabled={ !giveItem } onClick={ () => backpack(CityBackpackOp.Give, 0, giveItem) }>Give</button>
                                    </div> }
                            </div>
                            <div className="city-backpack-body">
                                <div className="city-weapon">
                                    <span className="mt-label">Weapon</span>
                                    { slotView(WEAPON_SLOT, false) }
                                </div>
                                <div className="city-slots">
                                    { CARRY_SLOTS.map(slot => slotView(slot, (slot > card.unlockedSlots) && !bySlot.has(slot))) }
                                </div>
                            </div>
                            { selected && canBackpack &&
                                <div className="city-slot-edit">
                                    <b>{ ResolveRpItem(selected.item)?.name ?? selected.item }</b>
                                    <span className="mt-muted">× { selected.count }</span>
                                    <div className="city-stepper">
                                        <button type="button" className="mt-chrome mt-small" aria-label="One fewer" onClick={ () => backpack(CityBackpackOp.SetCount, selectedSlot, '', selected.count - 1) }>−</button>
                                        <button type="button" className="mt-chrome mt-small" aria-label="One more" onClick={ () => backpack(CityBackpackOp.SetCount, selectedSlot, '', selected.count + 1) }>+</button>
                                    </div>
                                    <button type="button" className="mt-danger mt-small" onClick={ () => 
                                    {
                                        backpack(CityBackpackOp.Remove, selectedSlot); setSelectedSlot(0); 
                                    } }>Take it</button>
                                </div> }
                            <span className="mt-hint">Changes reach their backpack at once. Weapons never stack, a player holds one pair of handcuffs at most, and a stack stops at 10.</span>
                        </div>
                    </> }
            </div>
        </div>
    );
}
