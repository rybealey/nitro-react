import { FC } from 'react';

// Siri-like waveform glyph in its bubble chip: three sine layers, each
// drifting sideways (looping one 22px period) while its amplitude breathes on
// its own clock; co-prime speeds keep the composite from visibly repeating.
// Shared by the Siri bar and the music player (styles: .siri-wave in
// MusicPlayerView.scss).
const WAVE = 'M0 8 C2.75 3 8.25 3 11 8 C13.75 13 19.25 13 22 8 C24.75 3 30.25 3 33 8 C35.75 13 41.25 13 44 8';

export const SiriWave: FC<{ className?: string }> = ({ className = '' }) =>
{
    return (
        <span className={ `siri-wave${ className ? (' ' + className) : '' }` }>
            <svg width="22" height="16" viewBox="0 0 22 16">
                <g className="siri-wave-drift siri-wave-a"><g className="siri-wave-breathe"><path d={ WAVE } /></g></g>
                <g className="siri-wave-drift siri-wave-b"><g className="siri-wave-breathe"><path d={ WAVE } /></g></g>
                <g className="siri-wave-drift siri-wave-c"><g className="siri-wave-breathe"><path d={ WAVE } /></g></g>
            </svg>
        </span>
    );
}
