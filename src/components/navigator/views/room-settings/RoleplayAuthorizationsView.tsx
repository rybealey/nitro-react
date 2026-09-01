import { RpSetHqRankComposer } from '@nitrots/nitro-renderer';
import { FC } from 'react';
import { GetRoomSession, SendMessageComposer } from '../../../../api';
import { Column, Flex, Text } from '../../../../common';
import { IsRpStaff } from '../../../room/widgets/player-hud/PlayerHudWidgetView';
import { RoomCorpState } from './NavigatorRoomSettingsView';

interface RoleplayAuthorizationsViewProps
{
    roomCorp: RoomCorpState;
    className?: string;
}

export const RoleplayAuthorizationsView: FC<RoleplayAuthorizationsViewProps> = props =>
{
    const { roomCorp = null, className = '' } = props;
    const staff = IsRpStaff(GetRoomSession()?.ownRoomIndex ?? -1);

    if(!roomCorp || (roomCorp.corpId <= 0))
    {
        return (
            <Column gap={ 1 } className={ className }>
                <Text bold>Authorizations</Text>
                <Text className="text-muted">Assign a headquarters first.</Text>
            </Column>
        );
    }

    const toggle = (rankId: number, authorized: boolean) => SendMessageComposer(new RpSetHqRankComposer(rankId, authorized));

    return (
        <Column gap={ 1 } className={ className }>
            <Text bold>Authorizations</Text>
            <Text>Ranks allowed to work at this headquarters.</Text>
            { roomCorp.ranks.map(rank => (
                <Flex key={ rank.rankId } gap={ 1 } alignItems="center">
                    <input type="checkbox" disabled={ !staff } checked={ rank.authorized }
                        onChange={ event => toggle(rank.rankId, event.target.checked) } />
                    <Text>{ rank.rankName }</Text>
                </Flex>
            )) }
            { !staff &&
                <Text small className="text-muted">Only staff can change authorizations.</Text> }
        </Column>
    );
}
