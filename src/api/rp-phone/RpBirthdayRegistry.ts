// Birthdays by user id, fed by RpBirthdayEvent (the profile's lookups and the
// phone's own). Month/day only.
export interface RpBirthday
{
    month: number;
    day: number;
}

const MONTHS: string[] = [ 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December' ];

const birthdays: Map<number, RpBirthday> = new Map();

export const SetRpBirthday = (userId: number, month: number, day: number) =>
{
    if(!month || !day) birthdays.delete(userId);
    else birthdays.set(userId, { month, day });
}

export const GetRpBirthday = (userId: number): RpBirthday => (birthdays.get(userId) ?? null);

// "14 March"
export const FormatBirthday = (month: number, day: number): string => (((month >= 1) && (month <= 12) && (day >= 1)) ? `${ day } ${ MONTHS[month - 1] }` : '');
