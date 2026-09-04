// Shapes of the gang detail packets (RpGangDetailEvent / RpGangInvitesEvent)
// and the permission bits the emulator's GangManager hands out. The leader
// holds every bit; Administrator implies invite + kick and unlocks the role
// and member management on the Manage tab.
export const GANG_PERM_INVITE = 1;
export const GANG_PERM_KICK = 2;
export const GANG_PERM_BANK = 4;
export const GANG_PERM_ADMIN = 8;
export const GANG_PERM_LEADER = 16;

export const GANG_ROLE_NAME_MAX_LENGTH = 29;

export interface GangRole
{
    id: number;
    name: string;
    order: number;
    flags: number;
}

export interface GangMember
{
    userId: number;
    username: string;
    figure: string;
    // 0 = plain Member (no custom role)
    roleId: number;
    online: boolean;
    joinedAt: number;
}

export interface GangInvite
{
    userId: number;
    username: string;
    figure: string;
    invitedBy: string;
    expiresAt: number;
}

export interface GangIncomingInvite
{
    gangId: number;
    name: string;
    colourA: string;
    colourB: string;
    invitedBy: string;
    expiresAt: number;
}

export interface GangDetail
{
    gangId: number;
    name: string;
    colourA: string;
    colourB: string;
    ownerId: number;
    ownerName: string;
    level: number;
    xp: number;
    xpCap: number;
    createdAt: number;
    // the VIEWER's GANG_PERM_* bits
    permissions: number;
    roles: GangRole[];
    members: GangMember[];
    invites: GangInvite[];
    inviteHours: number;
}

export const HasGangPermission = (permissions: number, bit: number): boolean => ((permissions & bit) !== 0);

// "14h 26m" with more than an hour left, "26m 07s" under it, "expired" at zero
export const FormatGangCountdown = (expiresAt: number, nowSeconds: number): string =>
{
    const remaining = Math.max(0, (expiresAt - nowSeconds));

    if(remaining <= 0) return 'expired';

    const hours = Math.floor(remaining / 3600);
    const minutes = Math.floor((remaining % 3600) / 60);
    const seconds = (remaining % 60);

    if(hours > 0) return `${ hours }h ${ minutes }m`;

    return `${ minutes }m ${ seconds.toString().padStart(2, '0') }s`;
}

// "4 Sep", or "4 Sep 2025" once the year differs from the current one
export const FormatGangDate = (unixSeconds: number): string =>
{
    if(!unixSeconds) return '';

    const date = new Date(unixSeconds * 1000);
    const sameYear = (date.getFullYear() === new Date().getFullYear());

    return date.toLocaleDateString('en-GB', sameYear ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' });
}

// the permission chips a role row shows, in a fixed order
export const GangPermissionLabels = (flags: number): string[] =>
{
    const labels: string[] = [];

    if(flags & GANG_PERM_ADMIN) labels.push('Admin');
    if(flags & GANG_PERM_INVITE) labels.push('Invite');
    if(flags & GANG_PERM_KICK) labels.push('Kick');
    if(flags & GANG_PERM_BANK) labels.push('Bank');

    return labels;
}
