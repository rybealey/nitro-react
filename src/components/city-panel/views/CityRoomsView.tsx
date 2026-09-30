import { FC, useEffect, useState } from 'react';
import { CreateLinkEvent, SendMessageComposer, TryVisitRoom } from '../../../api';
import { CityRoomFilter, CityRoomRow, RpCityRoomListEvent, RpCityRoomsComposer } from '../../../api/rp-city/RpCityMessages';
import { useMessageEvent } from '../../../hooks';

// The City Panel's Rooms & Zones tab: every room at a glance - zone, turf
// holder, police setup, who is in it. Zone, jail tag and turf are edited in
// the Room Tool, which already does it; each row opens it.

const FILTERS: [ string, number ][] = [
    [ 'All', CityRoomFilter.All ],
    [ 'Turf', CityRoomFilter.Turf ],
    [ 'Police', CityRoomFilter.Police ],
    [ 'Occupied', CityRoomFilter.Occupied ]
];

const ZONES = [ { label: 'Unsafe', cls: 'is-unsafe' }, { label: 'Safe', cls: 'is-safe' }, { label: 'Turf', cls: 'is-turf' } ];

const SEARCH_DEBOUNCE_MS = 250;

const police = (row: CityRoomRow) =>
{
    const parts: string[] = [];

    if(row.jailRoom) parts.push('Jail');
    if(row.arrestPoints > 0) parts.push(`${ row.arrestPoints } arrest ${ (row.arrestPoints === 1) ? 'point' : 'points' }`);

    return (parts.length ? parts.join(' · ') : '-');
}

export const CityRoomsView: FC<{}> = props =>
{
    const [ query, setQuery ] = useState('');
    const [ filter, setFilter ] = useState(CityRoomFilter.All);
    const [ rows, setRows ] = useState<CityRoomRow[]>([]);

    useEffect(() =>
    {
        const timer = setTimeout(() => SendMessageComposer(new RpCityRoomsComposer(query, filter)), SEARCH_DEBOUNCE_MS);

        return () => clearTimeout(timer);
    }, [ query, filter ]);

    useMessageEvent<RpCityRoomListEvent>(RpCityRoomListEvent, event => setRows(event.getParser().rows));

    return (
        <div className="city-rooms">
            <div className="city-rooms-bar">
                <input className="form-control form-control-sm" type="search" placeholder="Room name or #id" aria-label="Search rooms" value={ query } maxLength={ 50 } onChange={ event => setQuery(event.target.value) } />
                <div className="mt-seg city-seg-4" role="group" aria-label="Filter rooms">
                    { FILTERS.map(([ label, value ]) =>
                        <button key={ value } type="button" className={ `mt-seg-button${ (filter === value) ? ' is-on' : '' }` } aria-pressed={ (filter === value) } onClick={ () => setFilter(value) }>{ label }</button>) }
                </div>
            </div>
            <div className="mt-card city-table">
                <div className="city-row is-head">
                    <span>Room</span><span>Zone</span><span>Turf held by</span><span>Police</span><span>Visitors</span><span />
                </div>
                { !rows.length && <div className="mt-empty">No rooms found.</div> }
                { rows.map(row =>
                    <div key={ row.id } className="city-row">
                        <span className="city-room-name"><b>{ row.name }</b><span className="mt-muted">#{ row.id }</span></span>
                        <span className="city-zone"><span className={ `mt-zone-dot ${ ZONES[row.zone]?.cls ?? '' }` } />{ ZONES[row.zone]?.label ?? '-' }</span>
                        <span>{ (row.zone === 2) ? (row.turfHolder || 'Unclaimed') : '-' }</span>
                        <span>{ police(row) }</span>
                        <span className="city-mono">{ row.usersNow }/{ row.usersMax }</span>
                        <span className="city-row-actions">
                            <button type="button" className="mt-chrome mt-small" onClick={ () => TryVisitRoom(row.id) }>Go</button>
                            <button type="button" className="mt-chrome mt-small" onClick={ () => CreateLinkEvent(`mod-tools/open-room-info/${ row.id }`) }>Room Tool</button>
                        </span>
                    </div>) }
            </div>
            <span className="mt-hint">Zone type, the jail tag and turf ownership are changed in the Room Tool.</span>
        </div>
    );
}
