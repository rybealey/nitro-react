import { RpCorpsEvent, RpGetCorpsComposer, RpSetRoomCorpComposer } from '@nitrots/nitro-renderer';
import { FC, useEffect, useState } from 'react';
import { GetRoomSession, SendMessageComposer } from '../../../../api';
import { Column, Text } from '../../../../common';
import { useMessageEvent } from '../../../../hooks';
import { IsRpStaff } from '../../../room/widgets/player-hud/PlayerHudWidgetView';
import { RoomCorpState } from './NavigatorRoomSettingsView';

interface RoleplayHeadquartersViewProps
{
    roomId: number;
    roomCorp: RoomCorpState;
    className?: string;
}

export const RoleplayHeadquartersView: FC<RoleplayHeadquartersViewProps> = props =>
{
    const { roomId, roomCorp = null, className = '' } = props;
    const [ corps, setCorps ] = useState<{ id: number; name: string }[]>([]);
    const staff = IsRpStaff(GetRoomSession()?.ownRoomIndex ?? -1);

    useMessageEvent<RpCorpsEvent>(RpCorpsEvent, event =>
    {
        const parser = event.getParser();

        if(!parser) return;

        setCorps(parser.corps.map(corp => ({ id: corp.id, name: corp.name })));
    });

    useEffect(() =>
    {
        SendMessageComposer(new RpGetCorpsComposer());
    }, []);

    const onChange = (value: string) => SendMessageComposer(new RpSetRoomCorpComposer(roomId, parseInt(value)));

    return (
        <Column gap={ 1 } className={ className }>
            <Text bold>Headquarters</Text>
            <Text>Assign this room as a corporation&apos;s headquarters. Its employees can then work here.</Text>
            <select className="form-select form-select-sm" disabled={ !staff }
                value={ roomCorp ? roomCorp.corpId : 0 } onChange={ event => onChange(event.target.value) }>
                <option value={ 0 }>None</option>
                { corps.map(corp => (
                    <option key={ corp.id } value={ corp.id }>{ corp.name }</option>
                )) }
            </select>
            { !staff &&
                <Text small className="text-muted">Only staff can set a headquarters.</Text> }
        </Column>
    );
}
