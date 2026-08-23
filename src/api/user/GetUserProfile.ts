import { CreateLinkEvent, GetRoomSession, GetSessionDataManager } from '..';
import { RpProfileState } from '../../components/rp-profile/RpProfileState';

// PixelRP: the vanilla extended-profile window is retired. Every profile
// opener in the client (avatar menus, infostand, friends/messenger, group
// members, camera photos, toolbar me-menu, relationships) funnels through
// this helper, so all of them now open the RP profile instead. The user is
// resolved from the current room when possible; the extended-profile
// packet is no longer requested.
export function GetUserProfile(userId: number): void
{
    const sessionData = GetSessionDataManager();
    const userData = (GetRoomSession()?.userDataManager?.getUserData(userId) ?? null);

    if(userData)
    {
        RpProfileState.name = userData.name;
        RpProfileState.figure = userData.figure;
        RpProfileState.motto = (userData.custom ?? '');
    }
    else if(sessionData && (userId === sessionData.userId))
    {
        RpProfileState.name = (sessionData.userName ?? '');
        RpProfileState.figure = (sessionData.figure ?? '');
        RpProfileState.motto = (sessionData.motto ?? '');
    }
    else
    {
        // not resolvable client-side yet (user outside the room) — the shell
        // opens anyway; live lookups arrive with the profile data wiring
        RpProfileState.name = 'Unknown';
        RpProfileState.figure = '';
        RpProfileState.motto = '';
    }

    CreateLinkEvent('rp-profile/show');
}
