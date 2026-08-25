import { FC, useEffect, useState } from 'react';
import { MessengerFriend } from '../../api';
import { PhoneAvatar } from './PhoneAvatar';
import { PhoneIcon } from './PhoneIcon';

// PixelRP Audio: a cosmetic call overlay — it rings for a while, nobody
// ever picks up (voice isn't a thing yet), then bows out gracefully.

interface PhoneCallViewProps
{
    friend: MessengerFriend;
    onEnd: () => void;
}

export const PhoneCallView: FC<PhoneCallViewProps> = props =>
{
    const { friend = null, onEnd = null } = props;
    const [ noAnswer, setNoAnswer ] = useState(false);

    useEffect(() =>
    {
        setNoAnswer(false);

        if(!friend) return;

        const ringTimeout = window.setTimeout(() => setNoAnswer(true), 8000);

        return () => window.clearTimeout(ringTimeout);
    }, [ friend ]);

    useEffect(() =>
    {
        if(!noAnswer) return;

        const closeTimeout = window.setTimeout(() => (onEnd && onEnd()), 2200);

        return () => window.clearTimeout(closeTimeout);
    }, [ noAnswer, onEnd ]);

    if(!friend) return null;

    return (
        <div className="phone-call-overlay">
            <div className="phone-call-top">
                <div className="phone-call-kicker">PIXELRP AUDIO</div>
                <div className="phone-call-name">{ friend.name }</div>
                <div className="phone-call-status">{ noAnswer ? 'No answer.' : 'Calling…' }</div>
            </div>
            <PhoneAvatar id={ friend.id } figure={ friend.figure } size={ 120 } />
            <div className="phone-tap phone-call-end" title="Hang up" onClick={ event => (onEnd && onEnd()) }>
                <PhoneIcon icon="phone" size={ 26 } />
            </div>
        </div>
    );
}
