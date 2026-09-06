import { CreateLinkEvent, GetRoomSession, GetSessionDataManager, OwnMotto } from '..';
import { GetFriendById } from '../friends';
import { ResolveRpStaff } from './RpStaffFlag';
import { RpProfileState } from '../../components/rp-profile/RpProfileState';

// PixelRP: the vanilla extended-profile window is retired. Every profile
// opener in the client (avatar menus, infostand, phone, group members,
// camera photos, toolbar me-menu, relationships) funnels through this
// helper, so all of them now open the RP profile instead. The user is
// resolved from the current room when possible, then from the friends
// list (phone contacts live outside the room); the extended-profile
// packet is no longer requested.
export function GetUserProfile(userId: number): void
{
    const sessionData = GetSessionDataManager();
    const userData = (GetRoomSession()?.userDataManager?.getUserData(userId) ?? null);
    const friend = GetFriendById(userId);

    // Whoever we resolve, the profile is THIS user's: the id drives the live
    // employment, gang and birthday lookups, and nothing from the last opened
    // profile may linger (the HUD openers set all of these too).
    RpProfileState.userId = userId;
    RpProfileState.employment = null;
    RpProfileState.staff = false;

    if(userData)
    {
        RpProfileState.name = userData.name;
        RpProfileState.figure = userData.figure;
        RpProfileState.motto = (userData.custom ?? '');
        // resolved from the current room, so they're in the hotel right now
        RpProfileState.online = true;
        RpProfileState.staff = ResolveRpStaff(userData.roomIndex);
    }
    else if(sessionData && (userId === sessionData.userId))
    {
        RpProfileState.name = (sessionData.userName ?? '');
        RpProfileState.figure = (sessionData.figure ?? '');
        // SessionDataManager has no motto - the login UserInfoEvent's value
        // is cached in OwnMotto (useSessionInfo).
        RpProfileState.motto = OwnMotto.value;
        RpProfileState.online = true;
        RpProfileState.staff = ResolveRpStaff(GetRoomSession()?.ownRoomIndex ?? -1);
    }
    else if(friend)
    {
        RpProfileState.name = (friend.name ?? '');
        RpProfileState.figure = (friend.figure ?? '');
        RpProfileState.motto = (friend.motto ?? '');
        RpProfileState.online = !!friend.online;
    }
    else
    {
        // not resolvable client-side yet (stranger outside the room) — the
        // shell opens anyway; live lookups arrive with the profile data wiring
        RpProfileState.name = 'Unknown';
        RpProfileState.figure = '';
        RpProfileState.motto = '';
        RpProfileState.online = false;
    }

    CreateLinkEvent('rp-profile/show');
}
