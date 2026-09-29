import { ChatRecordData } from '@nitrots/nitro-renderer';
import { FC, useMemo } from 'react';
import { CreateLinkEvent, TryVisitRoom } from '../../../../api';
import { InfiniteScroll } from '../../../../common';
import { useModTools } from '../../../../hooks';
import { ChatlogRecord } from './ChatlogRecord';

interface ChatlogViewProps
{
    records: ChatRecordData[];
}

export const ChatlogView: FC<ChatlogViewProps> = props =>
{
    const { records = null } = props;
    const { openRoomInfo = null } = useModTools();

    const allRecords = useMemo(() =>
    {
        const results: ChatlogRecord[] = [];

        records.forEach(record =>
        {
            results.push({
                isRoomInfo: true,
                roomId: record.roomId,
                roomName: record.roomName
            });

            record.chatlog.forEach(chatlog =>
            {
                results.push({
                    timestamp: chatlog.timestamp,
                    habboId: chatlog.userId,
                    username: chatlog.userName,
                    hasHighlighting: chatlog.hasHighlighting,
                    message: chatlog.message,
                    isRoomInfo: false
                });
            });
        });
        
        return results;
    }, [ records ]);

    // Chatlog (Mod Tools canvas): a grey bar for each room, then time / player
    // / message rows. Kept on InfiniteScroll - a user's log runs long.
    const RoomInfo = (props: { roomId: number, roomName: string }) =>
    {
        return (
            <div className="mt-log-room">
                <span className="mt-log-room-name">{ props.roomName }</span>
                <button type="button" className="mt-chrome mt-small" onClick={ event => TryVisitRoom(props.roomId) }>Visit</button>
                <button type="button" className="mt-chrome mt-small" onClick={ event => openRoomInfo(props.roomId) }>Room tool</button>
            </div>
        );
    }

    return (
        <div className="mt-log">
            <div className="mt-label mt-log-head"><span>Time</span><span>Player</span><span>Message</span></div>
            <div className="mt-card mt-log-body">
                { (records && (records.length > 0)) &&
                    <InfiniteScroll rows={ allRecords } rowRender={ (row: ChatlogRecord) =>
                    {
                        return (
                            <>
                                { row.isRoomInfo &&
                                    <RoomInfo roomId={ row.roomId } roomName={ row.roomName } /> }
                                { !row.isRoomInfo &&
                                    <div className={ `mt-log-row${ row.hasHighlighting ? ' is-highlighted' : '' }` }>
                                        <span className="mt-log-time">{ row.timestamp }</span>
                                        <span className="mt-link mt-log-user" onClick={ event => CreateLinkEvent(`mod-tools/open-user-info/${ row.habboId }`) }>{ row.username }</span>
                                        <span className="mt-log-message">{ row.message }</span>
                                    </div> }
                            </>
                        );
                    } } /> }
            </div>
        </div>
    );
}
