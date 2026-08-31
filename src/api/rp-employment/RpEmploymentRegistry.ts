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

// "47m" under an hour, then "12h 3m" - minutes granularity everywhere
export const FormatShiftTime = (seconds: number): string =>
{
    const minutes = Math.floor(seconds / 60);

    if(minutes < 60) return `${ minutes }m`;

    return `${ Math.floor(minutes / 60) }h ${ minutes % 60 }m`;
}
