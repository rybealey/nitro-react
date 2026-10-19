import { FC, useEffect, useState } from 'react';
import { SendMessageComposer } from '../../api';
import { GetJailSentence, JailSentence, JailTrial, RpRequestTrialComposer, SubscribeJailSentence } from '../../api/rp-police/RpJailMessages';
import { PixelScaleIcon } from './PixelScaleIcon';

// PixelRP jury trial card (design: "Jury Request Panel" canvas, A - Twist,
// 2026-10-19) - in the right-hand column under the purse, while you serve a
// sentence that may go to trial (emulator JailState.TrialOf: 15 minutes or
// more, 5 still to run, and enough players online to make a jury). Yours only.
//
// Request a Trial asks once per sentence (or :trial); after that the card reads
// "Waiting for a jury" until the trial is over (JuryTrials), when it goes. The
// server decides all of it and sends it with the jail countdown
// (RpJailMessages), so a relog shows the same.

export const RpJuryTrialView: FC<{}> = props =>
{
    const [ sentence, setSentence ] = useState<JailSentence>(GetJailSentence);
    // Pressed and not answered yet, so a second press sends nothing.
    const [ asking, setAsking ] = useState(false);

    useEffect(() => SubscribeJailSentence(() =>
    {
        setSentence(GetJailSentence());
        setAsking(false);
    }), []);

    if((sentence.secondsLeft <= 0) || (sentence.trial === JailTrial.None)) return null;

    const requestTrial = () =>
    {
        if(asking) return;

        setAsking(true);
        SendMessageComposer(new RpRequestTrialComposer());
    }

    return (
        <section className="rp-jury-panel" aria-label="Jury trial">
            <div className="rp-jury-head">
                <PixelScaleIcon />
                <span className="rp-jury-label">Jury Trial</span>
            </div>
            { (sentence.trial === JailTrial.Requested)
                ? <div className="rp-jury-waiting" role="status">
                    <span className="rp-jury-dots" aria-hidden="true"><i /><i /><i /></span>
                    <span>Waiting for a jury</span>
                </div>
                : <button type="button" className="rp-jury-request" disabled={ asking } onClick={ requestTrial }>Request a Trial</button> }
        </section>
    );
}
