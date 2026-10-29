import { FC, memo, useState } from 'react';
import { HotRoom, RpHotRoomsEvent, SendRpHotRoomsClose } from '../../api/rp-hot-rooms/RpHotRoomsMessages';
import { NitroCardContentView, NitroCardHeaderView, NitroCardView } from '../../common';
import { useMessageEvent } from '../../hooks';

// PixelRP :hotrooms window (the "Hot Rooms" canvas, design A - Twist,
// 2026-10-29): the five busiest rooms, view only. Each row: rank, the
// navigator's player-count badge, the room's name, and for staff its id (the
// server sends 0 to everybody else, so a player's client never has it).
//
// SERVER-OPENED by :hotrooms. While it is up the server sends the list again
// only when it changes; closing it tells the server to stop (emulator HotRooms).

// The navigator's colours for how full a room is (NavigatorSearchResultItemView).
const BadgeClass = (room: HotRoom) =>
{
    const full = (room.maxUsers > 0) ? ((100 * room.users) / room.maxUsers) : 0;

    if(full >= 92) return 'is-full';
    if(full >= 50) return 'is-busy';

    return '';
}

// Each update is a new list, so a row compares what it shows: only a row whose
// room, count or rank changed is drawn again.
const SameRow = (a: { room: HotRoom, rank: number }, b: { room: HotRoom, rank: number }) =>
    (a.rank === b.rank) && (a.room.id === b.room.id) && (a.room.name === b.room.name) && (a.room.users === b.room.users) && (a.room.maxUsers === b.room.maxUsers);

const HotRoomRow: FC<{ room: HotRoom, rank: number }> = memo(function HotRoomRow({ room, rank })
{
    return (
        <div className="hr-row">
            <span className="hr-rank">{ rank }</span>
            <span className={ `hr-count ${ BadgeClass(room) }` }>
                <svg aria-hidden="true" width="8" height="9" viewBox="0 0 8 9" shapeRendering="crispEdges"><rect x="2" y="0" width="4" height="4" fill="currentColor" /><rect x="0" y="5" width="8" height="4" fill="currentColor" /></svg>
                { room.users }
            </span>
            <span className="hr-name">{ room.name }</span>
            { (room.id > 0) && <span className="hr-id">ID { room.id }</span> }
        </div>
    );
}, SameRow);

export const HotRoomsView: FC<{}> = props =>
{
    const [ rooms, setRooms ] = useState<HotRoom[]>(null);

    useMessageEvent<RpHotRoomsEvent>(RpHotRoomsEvent, event =>
    {
        const parser = event.getParser();

        // Only :hotrooms opens the window; an update lands only while it is up.
        if(!parser.open && !rooms) return;

        setRooms(parser.rooms);
    });

    const close = () =>
    {
        setRooms(null);
        SendRpHotRoomsClose();
    }

    if(!rooms) return null;

    return (
        <NitroCardView className="nitro-hot-rooms" theme="primary-slim" uniqueKey="hot-rooms">
            <NitroCardHeaderView headerText="Hot Rooms" onCloseClick={ close } />
            <NitroCardContentView overflow="hidden">
                <div className="hr-list">
                    { rooms.map((room, index) => <HotRoomRow key={ index } room={ room } rank={ index + 1 } />) }
                    { !rooms.length && <div className="hr-empty">Nobody is in a room right now.</div> }
                </div>
            </NitroCardContentView>
        </NitroCardView>
    );
}
