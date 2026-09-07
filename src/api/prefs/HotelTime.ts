// San Francisco is the hotel's clock. Every in-game time renders in it,
// wherever the player happens to sit.
export const HOTEL_TIMEZONE = 'America/Los_Angeles';

let formatter: Intl.DateTimeFormat = null;

// ms east of UTC for the player's own zone at that instant
const localOffset = (ms: number): number => -(new Date(ms).getTimezoneOffset() * 60000);

// ms east of UTC for the hotel's zone at that instant (PST -8h, PDT -7h)
const hotelOffset = (ms: number): number =>
{
    try
    {
        formatter = (formatter ?? new Intl.DateTimeFormat('en-US', { timeZone: HOTEL_TIMEZONE, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' }));

        const fields: Record<string, number> = {};

        for(const part of formatter.formatToParts(new Date(ms)))
        {
            if(part.type !== 'literal') fields[part.type] = parseInt(part.value);
        }

        const wall = Date.UTC(fields.year, (fields.month - 1), fields.day, (fields.hour % 24), fields.minute, fields.second);

        return (wall - (Math.floor(ms / 1000) * 1000));
    }
    catch(e)
    {
        return localOffset(ms);
    }
}

// A Date whose local getters (getHours, getDate, getDay, toLocaleDateString...)
// read San Francisco wall-clock time for the given instant. Display only:
// its getTime() is shifted, so never send it back to the server.
export const HotelDate = (value: number | Date = Date.now()): Date =>
{
    const ms = ((value instanceof Date) ? value.getTime() : value);
    const shift = hotelOffset(ms);
    const first = (ms + shift - localOffset(ms));

    return new Date(ms + shift - localOffset(first));
}

// The inverse: a wall-clock Date built from hotel components -> the real instant in ms.
export const HotelInstant = (wall: Date): number =>
{
    const wallUtc = (wall.getTime() + localOffset(wall.getTime()));
    const guess = (wallUtc - hotelOffset(wallUtc));

    return (wallUtc - hotelOffset(guess));
}
