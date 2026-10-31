import { FC } from 'react';
import { LayoutAvatarImageView } from '../../common';

// Shared bits of the Corporation Panel's pages: the UK week labels, shift
// counts, the week switch and the head well.

// A shift is 10 minutes of duty (ShiftManager.PayIntervalSeconds).
export const SHIFT_SECONDS = 600;

export const ShiftsOf = (seconds: number): number => Math.floor(Math.max(0, seconds) / SHIFT_SECONDS);

export const WEEK_LABELS = [ 'This week', 'Last week', '2 weeks ago' ];

export const DAY_NAMES = [ 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun' ];

const ukDate = (unixSeconds: number, options: Intl.DateTimeFormatOptions): string =>
    new Date(unixSeconds * 1000).toLocaleString('en-US', { timeZone: 'Europe/London', ...options });

// The week starts at Sunday 11:59 PM UK, so the Monday it is named for is a
// minute later; it ends the next Sunday at 11:59 PM.
export const WeekRange = (startedAt: number, resetAt: number): string =>
{
    const from = ukDate(startedAt + 60, { month: 'short', day: 'numeric' });
    const to = ukDate(resetAt, { month: 'short', day: 'numeric' });
    const sameMonth = (from.split(' ')[0] === to.split(' ')[0]);

    return `${ from } – ${ sameMonth ? to.split(' ')[1] : to }`;
}

const plural = (count: number, word: string): string => `${ count } ${ word }${ (count === 1) ? '' : 's' }`;

// "in 1 day 11 hours", "in 3 hours", "in 12 minutes"
export const TimeUntil = (unixSeconds: number, nowMs: number): string =>
{
    const minutes = Math.max(0, Math.floor((unixSeconds * 1000 - nowMs) / 60000));
    const days = Math.floor(minutes / 1440);
    const hours = Math.floor((minutes % 1440) / 60);

    if(days > 0) return `in ${ plural(days, 'day') }${ hours ? ` ${ plural(hours, 'hour') }` : '' }`;
    if(hours > 0) return `in ${ plural(hours, 'hour') }`;

    return `in ${ plural(Math.max(1, minutes), 'minute') }`;
}

// The UK day (0 = Monday) a moment falls in, within the week that started at
// startedAt; -1 before it, 7 after it.
export const UkDayIndex = (startedAt: number, nowMs: number): number =>
{
    const days = Math.floor(((nowMs / 1000) - (startedAt + 60)) / 86400);

    return Math.max(-1, Math.min(7, days));
}

export const CorpWeekSwitch: FC<{ weeksAgo: number, onChange: (weeksAgo: number) => void }> = props =>
{
    const { weeksAgo = 0, onChange = null } = props;

    return (
        <div className="mt-seg corp-week-seg" role="group" aria-label="Week">
            { WEEK_LABELS.map((label, index) =>
                <button key={ label } type="button" aria-pressed={ (index === weeksAgo) } className={ `mt-seg-button ${ (index === weeksAgo) ? 'is-on' : '' }` } onClick={ () => onChange(index) }>
                    { label }
                </button>) }
        </div>
    );
}

export const CorpHead: FC<{ look: string, gender: string, size?: 'sm' | 'md' | 'lg' }> = props =>
{
    const { look = '', gender = 'M', size = 'md' } = props;

    return (
        <div className={ `corp-head is-${ size }` } aria-hidden="true">
            { look && <LayoutAvatarImageView figure={ look } gender={ gender } headOnly direction={ 2 } /> }
        </div>
    );
}

export const CorpPresence: FC<{ onDuty: boolean, online: boolean }> = props =>
{
    const { onDuty = false, online = false } = props;
    const label = (onDuty ? 'On duty' : (online ? 'Online' : 'Offline'));

    return <span className={ `corp-dot ${ onDuty ? 'is-duty' : (online ? 'is-online' : '') }` } title={ label } aria-label={ label } role="img" />;
}

const ukDayKey = (unixSeconds: number): string => ukDate(unixSeconds, { year: 'numeric', month: '2-digit', day: '2-digit' });

// When a record was made, in UK time: "Today, 9:14 PM", "Yesterday, 6:02 PM",
// "Thu, 4:18 PM" within the week, "Oct 21" before that.
export const RecordTime = (unixSeconds: number, nowMs: number): string =>
{
    if(!unixSeconds) return '';

    const now = Math.floor(nowMs / 1000);
    const time = ukDate(unixSeconds, { hour: 'numeric', minute: '2-digit' });

    if(ukDayKey(unixSeconds) === ukDayKey(now)) return `Today, ${ time }`;
    if(ukDayKey(unixSeconds) === ukDayKey(now - 86400)) return `Yesterday, ${ time }`;
    if((now - unixSeconds) < (6 * 86400)) return `${ ukDate(unixSeconds, { weekday: 'short' }) }, ${ time }`;

    return ukDate(unixSeconds, { month: 'short', day: 'numeric' });
}

// "Oct 21, 2026" for dates people read rather than compare.
export const LongDate = (unixSeconds: number): string => (unixSeconds ? ukDate(unixSeconds, { month: 'short', day: 'numeric', year: 'numeric' }) : '');

// Filled squares out of a limit: 2 of 3 warnings, 1 of 3 strikes.
export const CorpPips: FC<{ count: number, of: number, tone: 'warn' | 'bad', size?: 'sm' | 'lg' }> = props =>
{
    const { count = 0, of = 3, tone = 'warn', size = 'sm' } = props;
    const label = `${ count } of ${ of }`;

    return (
        <span className={ `corp-pips is-${ size }` } role="img" aria-label={ label } title={ label }>
            { Array.from({ length: Math.max(of, count) }, (_, index) =>
                <span key={ index } className={ `corp-pip ${ (index < count) ? `is-${ tone }` : '' }` } />) }
        </span>
    );
}

// A name that opens the employee's file.
export const CorpName: FC<{ userId: number, name: string, onOpen: (userId: number) => void }> = props =>
{
    const { userId, name, onOpen } = props;

    return <button type="button" className="corp-name-link" onClick={ () => onOpen(userId) }>{ name }</button>;
}
