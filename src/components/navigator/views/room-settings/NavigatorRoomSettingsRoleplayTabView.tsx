import { FC, useState } from 'react';
import { IRoomData, SendMessageComposer } from '../../../../api';
import { ROOM_ZONE_SAFE, ROOM_ZONE_TURF, ROOM_ZONE_UNSAFE, RpRoomZoneTypeSaveComposer } from '../../../../api/rp-turf/RpTurfMessages';
import { Column, Text } from '../../../../common';
import { RoomCorpState, RoomTurfState } from './NavigatorRoomSettingsView';
import { RoleplayAuthorizationsView } from './RoleplayAuthorizationsView';
import { RoleplayEmergenciesView } from './RoleplayEmergenciesView';
import { RoleplayHeadquartersView } from './RoleplayHeadquartersView';

// PixelRP roleplay room settings, laid out like the Settings window: a
// left rail of page links under eyebrow headers (shared prp-subnav-*
// classes) so future roleplay options have an obvious home.
//
// Zone Type: safe zones freeze the passive countdown for everyone in the
// room (enforced server-side); the value arrives via RpRoomZoneEvent
// alongside the stock settings data and is held by the parent so it
// survives tab switches.
//
// Corporations pages are nav scaffolding for now - the links exist so
// room-corp settings have their home; each lands on a placeholder until
// its feature ships.
const GENERAL_PAGES: string[] = [ 'Zoning' ];
const CORPORATION_PAGES: string[] = [ 'Headquarters', 'Authorizations', 'Emergencies' ];

interface NavigatorRoomSettingsRoleplayTabViewProps
{
    roomData: IRoomData;
    isSafeZone: boolean;
    setIsSafeZone: (value: boolean) => void;
    turf: RoomTurfState;
    setTurf: (value: RoomTurfState) => void;
    roomCorp: RoomCorpState;
    setRoomCorp: (value: RoomCorpState) => void;
}

export const NavigatorRoomSettingsRoleplayTabView: FC<NavigatorRoomSettingsRoleplayTabViewProps> = props =>
{
    const { roomData = null, isSafeZone = false, setIsSafeZone = null, turf = null, setTurf = null, roomCorp = null, setRoomCorp = null } = props;
    const [ activePage, setActivePage ] = useState<string>(GENERAL_PAGES[0]);

    // Safe, Unsafe or Turf. A turf is an unsafe room a gang can claim, so it
    // saves as unsafe with the turf flag on (RpRoomZoneTypeSaveEvent); the
    // server answers with both zone packets, which settle the owner line.
    const saveZone = (value: string) =>
    {
        const zone = ((value === 'safe') ? ROOM_ZONE_SAFE : (value === 'turf') ? ROOM_ZONE_TURF : ROOM_ZONE_UNSAFE);

        setIsSafeZone(zone === ROOM_ZONE_SAFE);
        setTurf({ isTurf: (zone === ROOM_ZONE_TURF), ownerName: ((zone === ROOM_ZONE_TURF) ? (turf?.ownerName ?? '') : '') });
        SendMessageComposer(new RpRoomZoneTypeSaveComposer(zone));
    }

    return (
        <div className="prp-subnav-layout">
            <div className="prp-subnav">
                <div className="prp-subnav-eyebrow">General</div>
                { GENERAL_PAGES.map(page => (
                    <div key={ page }
                        className={ `prp-subnav-item ${ (activePage === page) ? 'is-active' : '' }` }
                        onClick={ () => setActivePage(page) }>
                        { page }
                    </div>
                )) }
                <div className="prp-subnav-eyebrow">Corporations</div>
                { CORPORATION_PAGES.map(page => (
                    <div key={ page }
                        className={ `prp-subnav-item ${ (activePage === page) ? 'is-active' : '' }` }
                        onClick={ () => setActivePage(page) }>
                        { page }
                    </div>
                )) }
            </div>
            { (activePage === 'Zoning') &&
                <Column gap={ 1 } className="prp-subnav-page">
                    <Text bold>Zone Type</Text>
                    <Text>Safe zones pause every visitor&apos;s passive countdown - time only ticks in unsafe rooms. A turf plays as an unsafe room that a gang can claim with :claim; its group furni shows the gang&apos;s colours.</Text>
                    <select className="form-select form-select-sm" value={ turf?.isTurf ? 'turf' : (isSafeZone ? 'safe' : 'unsafe') } onChange={ event => saveZone(event.target.value) }>
                        <option value="safe">Safe</option>
                        <option value="unsafe">Unsafe</option>
                        <option value="turf">Turf</option>
                    </select>
                    { turf?.isTurf &&
                        <Text small>{ turf.ownerName ? `Held by ${ turf.ownerName }` : 'Unclaimed' }</Text> }
                </Column> }
            { (activePage === 'Headquarters') &&
                <RoleplayHeadquartersView roomId={ roomData.roomId } roomCorp={ roomCorp } className="prp-subnav-page" /> }
            { (activePage === 'Authorizations') &&
                <RoleplayAuthorizationsView roomId={ roomData.roomId } roomCorp={ roomCorp } className="prp-subnav-page" /> }
            { (activePage === 'Emergencies') &&
                <RoleplayEmergenciesView roomId={ roomData.roomId } roomCorp={ roomCorp } className="prp-subnav-page" /> }
        </div>
    );
}
