import { FC, useEffect, useState } from 'react';
import { SendMessageComposer } from '../../api';
import { GetJuryVoteCard, JuryVote, JuryVoteCard, RpJuryCastComposer, SubscribeJuryVoteCard } from '../../api/rp-police/RpJuryMessages';
import { LayoutAvatarImageView } from '../../common';
import { PixelScaleIcon } from './PixelScaleIcon';

// PixelRP jury vote card (design: "Jury Request Panel" canvas, page "Jury
// vote", A - Twist, 2026-10-20) - in the right-hand column under the purse,
// for a juror in the Courthouse once the judge puts the trial to the vote
// (emulator JuryTrials). Ten seconds: Guilty (the devil) or Not Guilty (the
// halo), one vote. Voted, it shows yours and how many have voted, until the
// judge reads the verdict and the card goes.
//
// Server-driven, counted locally like the jail countdown: RpJuryMessages
// keeps the last send and when it came, and this ticks the time on from it.

const VOTE_SECONDS = 10;

const secondsLeftOf = (card: JuryVoteCard, now: number) =>
    Math.max(0, Math.ceil(card.secondsLeft - ((now - card.receivedAt) / 1000)));

const clock = (seconds: number) => `${ Math.floor(seconds / 60) }:${ String(seconds % 60).padStart(2, '0') }`;

export const RpJuryVoteView: FC<{}> = props =>
{
    const [ card, setCard ] = useState<JuryVoteCard>(GetJuryVoteCard);
    const [ now, setNow ] = useState(() => performance.now());
    // Pressed and not answered yet, so a second press sends nothing.
    const [ voting, setVoting ] = useState(false);

    useEffect(() => SubscribeJuryVoteCard(() =>
    {
        setCard(GetJuryVoteCard());
        setNow(performance.now());
        setVoting(false);
    }), []);

    // A few ticks a second while open, so the bar runs smoothly; nothing at all otherwise.
    useEffect(() =>
    {
        if(!card.open) return;

        const interval = window.setInterval(() => setNow(performance.now()), 250);

        return () => window.clearInterval(interval);
    }, [ card.open ]);

    if(!card.open) return null;

    const left = secondsLeftOf(card, now);
    const exactLeft = Math.max(0, card.secondsLeft - ((now - card.receivedAt) / 1000));
    const filled = Math.min(100, ((exactLeft / VOTE_SECONDS) * 100));
    const voted = (card.myVote !== JuryVote.None);

    const vote = (choice: number) =>
    {
        if(voting || voted) return;

        setVoting(true);
        SendMessageComposer(new RpJuryCastComposer(choice));
    }

    return (
        <section className="rp-jury-panel rp-jury-vote" aria-label="Jury vote">
            <div className="rp-jury-head">
                <PixelScaleIcon />
                <span className="rp-jury-label">Jury Vote</span>
            </div>
            <div className="rp-jury-defendant">
                <div className="rp-jury-figure" title={ `${ card.name }'s look` }>
                    <LayoutAvatarImageView figure={ card.look } gender={ card.gender } direction={ 2 } />
                </div>
                <div className="rp-jury-defendant-text">
                    <span className="rp-jury-label">Defendant</span>
                    <b>{ card.name }</b>
                </div>
            </div>
            { !voted &&
                <>
                    <div className="rp-jury-row">
                        <span className="rp-jury-label">Cast your vote</span>
                        <b className="rp-jury-clock">{ clock(left) }</b>
                    </div>
                    <div className="rp-jury-choices">
                        <button type="button" className="rp-jury-choice is-guilty" disabled={ voting || (left <= 0) } onClick={ () => vote(JuryVote.Guilty) }>
                            <span className="rp-jury-choice-head"><i className="rp-jury-devil" aria-hidden="true" /></span>
                            Guilty
                        </button>
                        <button type="button" className="rp-jury-choice is-not-guilty" disabled={ voting || (left <= 0) } onClick={ () => vote(JuryVote.NotGuilty) }>
                            <span className="rp-jury-choice-head"><i className="rp-jury-halo" aria-hidden="true" /></span>
                            Not Guilty
                        </button>
                    </div>
                </> }
            { voted &&
                <>
                    <div className="rp-jury-voted" role="status">
                        <span>You voted</span>
                        <b className={ (card.myVote === JuryVote.Guilty) ? 'is-guilty' : 'is-not-guilty' }>{ (card.myVote === JuryVote.Guilty) ? 'Guilty' : 'Not Guilty' }</b>
                    </div>
                    <div className="rp-jury-row">
                        <span className="rp-jury-count">{ `${ card.voted } of ${ card.jurors } jurors have voted` }</span>
                        <b className="rp-jury-clock">{ clock(left) }</b>
                    </div>
                </> }
            <div className="rp-jury-bar" role="progressbar" aria-label="Time left to vote" aria-valuemin={ 0 } aria-valuemax={ VOTE_SECONDS } aria-valuenow={ left }>
                <div style={ { width: `${ filled.toFixed(1) }%` } } />
            </div>
        </section>
    );
}
