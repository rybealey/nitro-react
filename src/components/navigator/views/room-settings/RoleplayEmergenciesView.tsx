import { RpSetEmergencyComposer } from '@nitrots/nitro-renderer';
import { FC } from 'react';
import { SendMessageComposer } from '../../../../api';
import { Column, Flex, Text } from '../../../../common';
import { RoomCorpState } from './NavigatorRoomSettingsView';

interface RoleplayEmergenciesViewProps
{
    roomId: number;
    roomCorp: RoomCorpState;
    className?: string;
}

export const RoleplayEmergenciesView: FC<RoleplayEmergenciesViewProps> = props =>
{
    const { roomId, roomCorp = null, className = '' } = props;

    const set = (category: number, enabled: boolean) => SendMessageComposer(new RpSetEmergencyComposer(roomId, category, enabled));

    const medical = roomCorp ? roomCorp.allowMedical : true;
    const police = roomCorp ? roomCorp.allowPolice : true;

    return (
        <Column gap={ 1 } className={ className }>
            <Text bold>Emergencies</Text>
            <Text>Which outside services may keep working in this room when it isn&apos;t their headquarters. They still clock in at their own headquarters first.</Text>
            <Flex gap={ 1 } alignItems="center">
                <input type="checkbox" checked={ medical } onChange={ event => set(0, event.target.checked) } />
                <Text>Medical</Text>
            </Flex>
            <Flex gap={ 1 } alignItems="center">
                <input type="checkbox" checked={ police } onChange={ event => set(1, event.target.checked) } />
                <Text>Police</Text>
            </Flex>
        </Column>
    );
}
