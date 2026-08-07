import { FC } from 'react';
import { useFriends } from '../../hooks';
import { FriendsListView } from './views/friends-list/FriendsListView';
import { FriendsMessengerView } from './views/messenger/FriendsMessengerView';

export const FriendsView: FC<{}> = props =>
{
    const { settings = null } = useFriends();

    if(!settings) return null;

    // pixelrp: the toolbar "Find new friends" friend bar is intentionally not
    // rendered (see the removed #toolbar-friend-bar-container in ToolbarView).
    return (
        <>
            <FriendsListView />
            <FriendsMessengerView />
        </>
    );
}
