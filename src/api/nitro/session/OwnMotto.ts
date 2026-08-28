// The session user's own motto. SessionDataManager never stores the motto,
// but the login UserInfoEvent carries it - useSessionInfo stashes it here so
// plain-module code (GetUserProfile) and the player HUD can read it without
// a hook. Managed server-side by the roleplay systems; refreshed whenever a
// UserInfoEvent arrives.
export const OwnMotto = {
    value: '' as string,
};
