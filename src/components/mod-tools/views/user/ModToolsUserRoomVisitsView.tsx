import { GetRoomVisitsMessageComposer, RoomVisitsData, RoomVisitsEvent } from '@nitrots/nitro-renderer';
import { FC, useEffect, useState } from 'react';
import { SendMessageComposer, TryVisitRoom } from '../../../../api';
import { useMessageEvent } from '../../../../hooks';

interface ModToolsUserRoomVisitsViewProps
{
    userId: number;
    // called once the action has gone out (the User window keeps the tab open)
    onCloseClick?: () => void;
}

export const ModToolsUserRoomVisitsView: FC<ModToolsUserRoomVisitsViewProps> = props =>
{
    const { userId = null, onCloseClick = null } = props;
    const [ roomVisitData, setRoomVisitData ] = useState<RoomVisitsData>(null);

    useMessageEvent<RoomVisitsEvent>(RoomVisitsEvent, event =>
    {
        const parser = event.getParser();

        if(parser.data.userId !== userId) return;

        setRoomVisitData(parser.data);
    });

    useEffect(() =>
    {
        SendMessageComposer(new GetRoomVisitsMessageComposer(userId));
    }, [ userId ]);

    if(!userId) return null;

    return (
        <>
            <div className="mt-label mt-visits-head"><span>Time</span><span>Room</span><span /></div>
            <div className="mt-card mt-visits">
                { !(roomVisitData?.rooms?.length) &&
                    <div className="mt-line mt-muted">No room visits yet.</div> }
                { (roomVisitData?.rooms ?? []).map((row, index) => (
                    <div key={ index } className="mt-visit">
                        <span className="mt-muted mt-time">{ row.enterHour.toString().padStart(2, '0') }:{ row.enterMinute.toString().padStart(2, '0') }</span>
                        <span className="mt-visit-room">{ row.roomName }</span>
                        <span className="mt-link" onClick={ event => TryVisitRoom(row.roomId) }>Visit</span>
                    </div>
                )) }
            </div>
        </>
    );
}
