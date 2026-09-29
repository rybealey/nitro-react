// PixelRP: 10 to 200 visitors in tens - the server clamps to the same range
// (emulator RoomLimits), and 200 is every room's default
export const MAX_ROOM_VISITORS = 200;

const BuildMaxVisitorsList = () =>
{
    const list: number[] = [];

    for(let i = 10; i <= MAX_ROOM_VISITORS; i = i + 10) list.push(i);

    return list;
}

export const GetMaxVisitorsList = BuildMaxVisitorsList();
