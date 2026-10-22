// pixelrp: friends who have just logged in, by user id, with when. The green
// friend tag over a name shows once, on a friend's first appearance after
// logging in - not every time they or you walk into a room (Twist,
// 2026-10-22). The server tells friends someone is online as they log in,
// before they are sent to a room, so the note is always there first.

// Long enough for a slow device to load the hotel and its first room.
const LOGIN_TAG_WINDOW_MS = 60000;

const LOGGED_IN_AT: Map<number, number> = new Map();

export const NoteFriendLogin = (userId: number): void =>
{
    LOGGED_IN_AT.set(userId, Date.now());
}

// True once per login, and only inside the window - so a friend who logged
// in somewhere else an hour ago gets no tag when they walk in now.
export const TakeFriendLogin = (userId: number): boolean =>
{
    const loggedInAt = LOGGED_IN_AT.get(userId);

    if(loggedInAt === undefined) return false;

    LOGGED_IN_AT.delete(userId);

    return ((Date.now() - loggedInAt) <= LOGIN_TAG_WINDOW_MS);
}
