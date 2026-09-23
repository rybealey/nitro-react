import { FC, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { GetRpOffer, RpOffer, SendRpOfferReply, SubscribeRpOffer } from '../../../../api/rp-offer/RpOfferMessages';

// PixelRP :offer / :sell - the card the buyer answers.
//
// It portals into #toolbar-chat-input-container, the SAME element the chat bar
// portals into, which is what lets it sit directly above the bar and share its
// width without either one knowing the other's position. Anchored by its
// bottom to just above the bar's top edge rather than by its own top, so a
// card that grows a line pushes upward and the gap under it never changes.
//
// Its colours are all --prp-chrome-*, so it wears whatever chrome the person
// looking at it chose in Settings. Buyer and seller can and will have picked
// different ones; neither is told about the other's.

// Long enough to read as movement, short enough not to delay an answer.
const EXIT_MS = 180;

const Money = (value: number): string => Math.max(0, value || 0).toLocaleString('en-US');

export const RpOfferWidgetView: FC<{}> = () =>
{
    const [ offer, setOffer ] = useState<RpOffer>(() => GetRpOffer());
    // The card being taken away is still drawn while it plays its exit, so it
    // needs its own copy of what was on it - the store has already moved on.
    const [ leaving, setLeaving ] = useState<RpOffer>(null);
    const [ left, setLeft ] = useState(0);
    const exitTimer = useRef<number>(0);

    useEffect(() => SubscribeRpOffer(() =>
    {
        const next = GetRpOffer();

        setOffer(previous =>
        {
            // Gone, or replaced by the next one in the queue: either way the
            // card that was there has to leave before anything else arrives.
            if(previous && (!next || (next.id !== previous.id)))
            {
                setLeaving(previous);

                window.clearTimeout(exitTimer.current);
                exitTimer.current = window.setTimeout(() => setLeaving(null), EXIT_MS);
            }

            return next;
        });
    }), []);

    useEffect(() => () => window.clearTimeout(exitTimer.current), []);

    // The rail drains from the server's own seconds-left, so a card opened
    // late does not restart the clock it is drawing.
    useEffect(() =>
    {
        if(!offer)
        {
            setLeft(0);

            return;
        }

        setLeft(offer.secondsLeft);

        const timer = window.setInterval(() => setLeft(value => Math.max(0, value - 1)), 1000);

        return () => window.clearInterval(timer);
    }, [ offer?.id ]);

    const host = document.getElementById('toolbar-chat-input-container');

    if(!host || (!offer && !leaving)) return null;

    const shown = (offer ?? leaving);
    const isLeaving = (!offer && !!leaving);
    const blocked = (shown.blocked ?? '');
    const fraction = ((shown.lifetime > 0) ? Math.max(0, Math.min(1, (left / shown.lifetime))) : 0);
    const urgent = (!isLeaving && (left <= 5));
    const goods = ((shown.quantity > 1) ? `${ shown.quantity } ${ shown.label }` : shown.label);

    return createPortal(
        <div className={ `rp-offer${ isLeaving ? ' is-leaving' : '' }` }>
            <div className="rp-offer-body">
                <div className="rp-offer-mark" aria-hidden="true">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="7" width="18" height="13" rx="2" />
                        <path d="M3 11h18" />
                        <path d="M12 7V4" />
                        <path d="M9 4h6" />
                    </svg>
                </div>

                <div className="rp-offer-text">
                    <div className={ `rp-offer-kicker${ urgent ? ' is-urgent' : '' }` }>
                        { urgent ? 'EXPIRING' : 'OFFER RECEIVED' }
                        { (shown.queued > 1) && <span className="rp-offer-queued">&middot; 1 OF { shown.queued }</span> }
                    </div>
                    <div className="rp-offer-line">
                        <strong>{ shown.sellerName }</strong> is offering you <strong>{ goods }</strong>
                    </div>
                    { !!blocked.length &&
                        <div className="rp-offer-blocked">{ blocked }</div> }
                    { !blocked.length && (shown.total > 0) &&
                        <div className="rp-offer-price">for <strong>${ Money(shown.total) }</strong></div> }
                    { !blocked.length && (shown.total === 0) &&
                        <div className="rp-offer-price">free of charge</div> }
                </div>

                <div className="rp-offer-actions">
                    <button type="button" className="rp-offer-accept" aria-label={ `Accept ${ goods } from ${ shown.sellerName }` }
                        disabled={ !!blocked.length || isLeaving } onClick={ event => SendRpOfferReply(shown.id, true) }>
                        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12" />
                        </svg>
                    </button>
                    <button type="button" className="rp-offer-decline" aria-label={ `Decline the offer from ${ shown.sellerName }` }
                        disabled={ isLeaving } onClick={ event => SendRpOfferReply(shown.id, false) }>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                            <path d="M6 6l12 12M18 6L6 18" />
                        </svg>
                    </button>
                </div>
            </div>

            <div className="rp-offer-rail">
                <div className={ `rp-offer-rail-fill${ urgent ? ' is-urgent' : '' }` } style={ { width: `${ fraction * 100 }%` } } />
            </div>
        </div>, host);
}
