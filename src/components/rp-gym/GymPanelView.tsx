import { FC, useEffect, useState } from 'react';
import { GetRoomEngine } from '../../api';
import { GetGymWorkout, GymMembershipLeft, GymSecondsLeft, SubscribeGym } from '../../api/rp-gym/RpGymMessages';

// PixelRP gym workout panel (emulator GymState) - in the right-hand column,
// under the purse, while you stand on gym equipment. Yours only.
//
// Server-driven, counted locally like the jail countdown: RpGymMessages keeps
// the last send and its receivedAt, and this ticks once a second from it. The
// workout clock stands still while paused; the membership counts down
// whenever you are online, so it always moves. Minutes only for the
// membership, rounded up so it never reads 0 while time is left.
//
// The machine is shown by its furni icon, beside "Stamina training" /
// "Strength training". Paused, the level and countdown give way to a plain
// "Paused" - the server's reason is not shown - except with no membership,
// which says so and where to buy one. The membership sits in a small chip
// at the bottom, away from the countdown; at Strength 10 there is nothing
// left to train, so it is not shown there.

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
    const stamina = (workout.stat === 'stamina');
    const left = GymSecondsLeft(now);
    const done = (!maxed && (workout.secondsForLevel > 0)) ? Math.min(1, 1 - (left / workout.secondsForLevel)) : 0;
    const membership = GymMembershipLeft(now);
    const paused = !!workout.pause;
    const noMembership = (paused && (membership <= 0));
    const showMembership = ((membership > 0) && !(maxed && !stamina));
    const icon = (workout.spriteId > 0) ? GetRoomEngine().getFurnitureFloorIconUrl(workout.spriteId) : null;

    return (
        <div className="rp-gym-panel" role="timer">
            <div className="rp-gym-head">
                <div className="rp-gym-icon">
                    { icon && <img alt={ workout.machine } src={ icon } /> }
                </div>
                <div className="rp-gym-head-text">
                    <div className="rp-gym-label">{ stamina ? 'Stamina training' : 'Strength training' }</div>
                    { paused
                        ? <div className="rp-gym-state">{ noMembership ? 'No membership' : 'Paused' }</div>
                        : <div className="rp-gym-row">
                            <span className="rp-gym-level">{ maxed ? `Level ${ workout.level }` : `Level ${ workout.level } → ${ workout.level + 1 }` }</span>
                            { !maxed && <span className="rp-gym-clock">{ clock(left) }</span> }
                        </div> }
                </div>
            </div>
            { !maxed &&
                <div className="rp-gym-progress"><div style={ { width: `${ (done * 100).toFixed(1) }%` } } /></div> }
            { noMembership &&
                <div className="rp-gym-pause">{ workout.pause }</div> }
            { showMembership &&
                <div className="rp-gym-membership">
                    <span>Membership</span>
                    <span>{ `${ Math.ceil(membership / 60) } min` }</span>
                </div> }
        </div>
    );
}
