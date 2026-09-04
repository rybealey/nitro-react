// PixelRP: client-side employment cache, keyed by user id. Fed by
// RpUserCorpEvent (room entry for everyone present, profile opens, and
// real-time hire broadcasts). corpId 0 clears.
export interface RpEmployment
{
    corpId: number;
    badge: string;
    corpName: string;
    rankName: string;
    tier: number;
    shiftSeconds: number;
    shiftSecondsWeek: number;
    onDuty: boolean;
    // client timestamp (Date.now()) of the packet this employment came from;
    // an on-duty employee's live counters tick forward from here
    receivedAt: number;
}

export const DEFAULT_CORP_BADGE: string = 'NPH17';
export const CORP_TIER_NUMERALS: string[] = [ 'I', 'II', 'III', 'IV', 'V' ];

const employmentByUserId: Map<number, RpEmployment> = new Map();

export const SetRpEmployment = (userId: number, employment: RpEmployment): void =>
{
    if(!employment || !employment.corpId)
    {
        employmentByUserId.delete(userId);

        return;
    }

    employmentByUserId.set(userId, employment);
}

export const GetRpEmployment = (userId: number): RpEmployment => (employmentByUserId.get(userId) ?? null);

// tier 0 = a no-tier leadership rank (top three of any corp): no numeral
export const RpTierNumeral = (tier: number): string => ((tier < 1) ? '' : CORP_TIER_NUMERALS[Math.min(tier, CORP_TIER_NUMERALS.length) - 1]);

// "Cadet II", or just "Captain" for no-tier leadership ranks
export const RpRankTitle = (rankName: string, tier: number): string => [ rankName, RpTierNumeral(tier) ].filter(Boolean).join(' ');

// Shift counts render as FULL SHIFTS completed - 1 shift = 10 minutes of
// working time; partial shifts don't count until they finish.
export const FormatShifts = (seconds: number): string => `${ Math.floor(seconds / 600) }`;

// Coarse "last seen" label from a unix-SECONDS timestamp. Deliberately
// coarse: the roster refreshes on a 60s tick, so anything finer would sit
// visibly stale between ticks. `nowMs` is passed in (rather than read from
// Date.now() here) so a caller already driving a render tick stays in step
// with it.
//   0 timestamp -> 'Never' (never logged out, or a pre-migration row)
//   future/clock skew -> clamped to 'Just now'
export const FormatLastOnline = (unixSeconds: number, nowMs: number): string =>
{
    if(!unixSeconds || (unixSeconds < 0)) return 'Never';

    const seconds = Math.floor((nowMs / 1000) - unixSeconds);

    if(seconds < 60) return 'Just now';

    const minutes = Math.floor(seconds / 60);

    if(minutes < 60) return `${ minutes }m ago`;

    const hours = Math.floor(minutes / 60);

    if(hours < 24) return `${ hours }h ago`;

    const days = Math.floor(hours / 24);

    if(days < 7) return `${ days }d ago`;

    const weeks = Math.floor(days / 7);

    if(weeks < 5) return `${ weeks }w ago`;

    const months = Math.floor(days / 30);

    if(months < 12) return `${ months }mo ago`;

    return `${ Math.floor(days / 365) }y ago`;
}
