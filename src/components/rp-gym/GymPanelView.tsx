import { FC, useEffect, useState } from 'react';
import { GetGymWorkout, GymMembershipLeft, GymSecondsLeft, SubscribeGym } from '../../api/rp-gym/RpGymMessages';

// PixelRP gym workout panel (emulator GymState) - in the right-hand column,
// under the purse, while you stand on gym equipment. Yours only.
//
// Server-driven, counted locally like the jail countdown: RpGymMessages keeps
// the last send and its receivedAt, and this ticks once a second from it. The
// workout clock stands still while paused; the membership counts down
// whenever you are online, so it always moves. Minutes only for the
// membership, rounded up so it never reads 0 while time is left.

const MAX_LEVEL = 10;

const clock = (seconds: number) =>
{
    const safe = Math.max(0, Math.ceil(seconds));

    return `${ Math.floor(safe / 60) }:${ String(safe % 60).padStart(2, '0') }`;
}

export const GymPanelView: FC<{}> = props =>
{
    const [ , setVersion ] = useState(0);
    const [ now, setNow ] = useState(() => performance.now());

    useEffect(() => SubscribeGym(() =>
    {
        setVersion(value => (value + 1));
        setNow(performance.now());
    }), []);

    const workout = GetGymWorkout();

    // One tick a second while showing; nothing at all otherwise.
    useEffect(() =>
    {
        if(!workout.showing) return;

        const interval = window.setInterval(() => setNow(performance.now()), 1000);

        return () => window.clearInterval(interval);
    }, [ workout.showing ]);

    if(!workout.showing) return null;

    const maxed = (workout.level >= MAX_LEVEL);
    const left = GymSecondsLeft(now);
    const done = (!maxed && (workout.secondsForLevel > 0)) ? Math.min(1, 1 - (left / workout.secondsForLevel)) : 0;
    const membership = GymMembershipLeft(now);
    const stat = (workout.stat === 'stamina') ? 'Stamina' : 'Strength';

    return (
        <div className="rp-gym-panel" role="timer">
            <div className="rp-gym-label">{ workout.machine ? `${ workout.machine } · ${ stat }` : stat }</div>
            <div className="rp-gym-row">
                <span className="rp-gym-level">{ maxed ? `Level ${ workout.level }` : `Level ${ workout.level } → ${ workout.level + 1 }` }</span>
                { !maxed && <span className="rp-gym-clock">{ clock(left) }</span> }
            </div>
            { !maxed &&
                <div className="rp-gym-progress"><div style={ { width: `${ (done * 100).toFixed(1) }%` } } /></div> }
            { (membership > 0) &&
                <div className="rp-gym-row rp-gym-membership">
                    <span>Membership</span>
                    <span>{ `${ Math.ceil(membership / 60) } min` }</span>
                </div> }
            { workout.pause &&
                <div className="rp-gym-pause">{ workout.pause }</div> }
        </div>
    );
}
