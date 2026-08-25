import { MessengerFriend } from './MessengerFriend';

// Module-level mirror of the friends list so plain (non-hook) helpers like
// GetUserProfile can resolve a friend's name/figure/motto when the user
// isn't in the current room. useFriends keeps it in sync.

const FRIENDS_BY_ID: Map<number, MessengerFriend> = new Map();

export const UpdateFriendLookup = (friends: MessengerFriend[]): void =>
{
    FRIENDS_BY_ID.clear();

    for(const friend of friends)
    {
        if(friend && (friend.id > 0)) FRIENDS_BY_ID.set(friend.id, friend);
    }
}

export const GetFriendById = (userId: number): MessengerFriend =>
{
    return (FRIENDS_BY_ID.get(userId) ?? null);
}
