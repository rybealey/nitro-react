import { FC, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { GetRoomEngine } from '../../../../api';
import { GetRpBinSearch, RpBinSearch, SubscribeRpBinSearch } from '../../../../api/rp-bin-search/RpBinSearchMessages';
import { GetRpOffer, SubscribeRpOffer } from '../../../../api/rp-offer/RpOfferMessages';

// PixelRP bin search - the searcher's card above the chat bar while they
// rummage (Twist, 2026-10-18): the bin's own furni icon, and a ten-second
// countdown with the rail draining under it. Emulator: BinSearch.
//
// It is the offer card (RpOfferWidgetView) in everything but what it says -
// same classes, same place, same chrome colours, same way in and out - so it
// reads as one of the bar's cards. The two share that one spot, so while an
// offer or a trade request is waiting for an answer, it has the spot and this
// one steps aside; the search goes on underneath either way.

// The offer card's own exit length, so both leave alike.
const EXIT_MS = 180;
// Fine enough for the rail to glide; the number only changes once a second.
const TICK_MS = 100;

const leftOf = (search: RpBinSearch) => (search ? Math.max(0, search.leftMs - (Date.now() - search.receivedAt)) : 0);

export const RpBinSearchWidgetView: FC<{}> = () =>
{
    const [ search, setSearch ] = useState<RpBinSearch>(() => GetRpBinSearch());
    const [ leaving, setLeaving ] = useState<RpBinSearch>(null);
    const [ offerShowing, setOfferShowing ] = useState(() => !!GetRpOffer());
    const [ left, setLeft ] = useState(() => leftOf(GetRpBinSearch()));
    const exitTimer = useRef<number>(0);

    useEffect(() => SubscribeRpBinSearch(() =>
    {
        const next = GetRpBinSearch();

        setSearch(previous =>
        {
            if(previous && !next)
            {
                setLeaving(previous);

                window.clearTimeout(exitTimer.current);
                exitTimer.current = window.setTimeout(() => setLeaving(null), EXIT_MS);
            }

            return next;
        });
    }), []);

    useEffect(() => SubscribeRpOffer(() => setOfferShowing(!!GetRpOffer())), []);

    useEffect(() => () => window.clearTimeout(exitTimer.current), []);

    useEffect(() =>
    {
        if(!search)
        {
            setLeft(0);

            return;
        }

        setLeft(leftOf(search));

        const timer = window.setInterval(() => setLeft(leftOf(search)), TICK_MS);

        return () => window.clearInterval(timer);
    }, [ search ]);

    const host = document.getElementById('toolbar-chat-input-container');

    if(!host || offerShowing || (!search && !leaving)) return null;

    const shown = (search ?? leaving);
    const isLeaving = (!search && !!leaving);
    const total = Math.max(1, shown.totalMs);
    const fraction = (isLeaving ? 0 : Math.max(0, Math.min(1, (left / total))));
    const seconds = (isLeaving ? 0 : Math.ceil(left / 1000));
    const icon = ((shown.spriteId > 0) ? GetRoomEngine().getFurnitureFloorIconUrl(shown.spriteId) : null);

    return createPortal(
        <div className={ `rp-offer is-bin-search${ isLeaving ? ' is-leaving' : '' }` } role="status" aria-label={ `Searching the bin, ${ seconds } seconds left` }>
            <div className="rp-offer-body">
                <div className="rp-offer-mark rp-bin-mark" aria-hidden="true">
                    { icon && <img src={ icon } alt="" /> }
                </div>
                <div className="rp-offer-text">
                    <div className="rp-offer-kicker">BIN</div>
                    <div className="rp-offer-line">Searching through the <strong>bin</strong>...</div>
                </div>
                <div className="rp-bin-timer" aria-hidden="true">{ seconds }s</div>
            </div>
            <div className="rp-offer-rail">
                <div className="rp-offer-rail-fill rp-bin-rail-fill" style={ { width: `${ fraction * 100 }%` } } />
            </div>
        </div>, host);
}
