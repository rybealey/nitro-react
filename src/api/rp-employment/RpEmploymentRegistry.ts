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

export const RpTierNumeral = (tier: number): string => (CORP_TIER_NUMERALS[Math.min(Math.max(tier, 1), CORP_TIER_NUMERALS.length) - 1]);
