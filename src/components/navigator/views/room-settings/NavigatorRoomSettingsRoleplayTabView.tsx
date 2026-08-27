import { RpRoomZoneSaveComposer } from '@nitrots/nitro-renderer';
import { FC } from 'react';
import { IRoomData, SendMessageComposer } from '../../../../api';
import { Column, Text } from '../../../../common';

// PixelRP roleplay room settings. Zone Type: safe zones freeze the passive
// countdown for everyone in the room (enforced server-side); the value
// arrives via RpRoomZoneEvent alongside the stock settings data and is
// held by the parent so it survives tab switches.
interface NavigatorRoomSettingsRoleplayTabViewProps
{
    roomData: IRoomData;
    isSafeZone: boolean;
    setIsSafeZone: (value: boolean) => void;
}

export const NavigatorRoomSettingsRoleplayTabView: FC<NavigatorRoomSettingsRoleplayTabViewProps> = props =>
{
    const { roomData = null, isSafeZone = false, setIsSafeZone = null } = props;

    const saveZone = (value: string) =>
    {
        const safe = (value === 'safe');

        setIsSafeZone(safe);
        SendMessageComposer(new RpRoomZoneSaveComposer(safe));
    }

    return (
        <Column gap={ 1 }>
            <Text bold>Zone Type</Text>
            <Text>Safe zones pause every visitor&apos;s passive countdown - time only ticks in unsafe rooms.</Text>
            <select className="form-select form-select-sm" value={ isSafeZone ? 'safe' : 'unsafe' } onChange={ event => saveZone(event.target.value) }>
                <option value="safe">Safe</option>
                <option value="unsafe">Unsafe</option>
            </select>
        </Column>
    );
}
