import { RpRoomZoneSaveComposer } from '@nitrots/nitro-renderer';
import { FC, useState } from 'react';
import { IRoomData, SendMessageComposer } from '../../../../api';
import { Column, Text } from '../../../../common';
import { RoomCorpState } from './NavigatorRoomSettingsView';
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
    roomCorp: RoomCorpState;
    setRoomCorp: (value: RoomCorpState) => void;
}

export const NavigatorRoomSettingsRoleplayTabView: FC<NavigatorRoomSettingsRoleplayTabViewProps> = props =>
{
    const { roomData = null, isSafeZone = false, setIsSafeZone = null, roomCorp = null, setRoomCorp = null } = props;
    const [ activePage, setActivePage ] = useState<string>(GENERAL_PAGES[0]);

    const saveZone = (value: string) =>
    {
        const safe = (value === 'safe');

        setIsSafeZone(safe);
        SendMessageComposer(new RpRoomZoneSaveComposer(safe));
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
                    <Text>Safe zones pause every visitor&apos;s passive countdown - time only ticks in unsafe rooms.</Text>
                    <select className="form-select form-select-sm" value={ isSafeZone ? 'safe' : 'unsafe' } onChange={ event => saveZone(event.target.value) }>
                        <option value="safe">Safe</option>
                        <option value="unsafe">Unsafe</option>
                    </select>
                </Column> }
            { (activePage === 'Headquarters') &&
                <RoleplayHeadquartersView roomCorp={ roomCorp } className="prp-subnav-page" /> }
            { (activePage === 'Authorizations') &&
                <RoleplayAuthorizationsView roomCorp={ roomCorp } className="prp-subnav-page" /> }
            { (activePage === 'Emergencies') &&
                <RoleplayEmergenciesView roomCorp={ roomCorp } className="prp-subnav-page" /> }
        </div>
    );
}
