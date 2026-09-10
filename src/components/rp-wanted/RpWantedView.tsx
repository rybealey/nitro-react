import { ILinkEventTracker } from '@nitrots/nitro-renderer';
import { FC, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { FaRegStar, FaStar } from 'react-icons/fa';
import { AddEventLinkTracker, GetUserProfile, RemoveLinkEventTracker } from '../../api';
import { GetRpWantedList, RpWantedPlayer, SubscribeRpWanted } from '../../api/rp-wanted/RpWantedMessages';
import { LayoutAvatarImageView, NitroCardContentView, NitroCardHeaderView, NitroCardView } from '../../common';

// PixelRP Wanted List, opened from the side drawer's Wanted button
// (CreateLinkEvent('rp-wanted/toggle')). Players land here when they are
// charged with a crime and drop off when their sentence expires.
//
// Live: the emulator pushes the whole list at login and again whenever an
// officer files a charge (RpWantedMessages). A player's stars are the highest
// severity among their open charges, decided server-side.
//
// Being wanted is temporary: 15 minutes from the latest charge, restarted by
// every new one. Each row counts that down (mm:ss) and the store drops the
// entry at zero; the charges themselves stay on the sheet.

// "14:59" - time left on the list. Never negative: the store prunes at zero.
const countdown = (expiresAt: number): string =>
{
    const seconds = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
    const minutes = Math.floor(seconds / 60);

    return `${ minutes }:${ String(seconds % 60).padStart(2, '0') }`;
}

// Where a hovered row wants its tooltip: to the right of the window, so it is
// never clipped by the list's scroller; flipped to the left when the window
// sits against the right edge of the screen.
interface TipAnchor { player: RpWantedPlayer; left: number; top: number; flip: boolean }

const TIP_WIDTH = 180;
const TIP_GAP = 8;

const WantedStars: FC<{ level: number }> = ({ level }) => (
    <div className="rp-wanted-stars">
        { [ 0, 1, 2, 3, 4 ].map(index => (
            <span key={ index } className={ (index < level) ? 'on' : 'off' }>
                { (index < level) ? <FaStar /> : <FaRegStar /> }
            </span>
        )) }
    </div>
);

// The rap sheet, shown while hovering a row. Rendered through a portal onto
// the body so it can sit OUTSIDE the window - the card clips its content and
// the list scrolls, so nothing inside them could overhang the frame.
const WantedTip: FC<{ anchor: TipAnchor }> = ({ anchor }) => createPortal(
    <div className={ `rp-wanted-tip${ anchor.flip ? ' is-flipped' : '' }` }
        style={ { left: anchor.left, top: anchor.top, width: TIP_WIDTH } }>
        <div className="rp-wanted-tip-head">
            <span>{ anchor.player.charges.length === 1 ? 'Charge' : 'Charges' }</span>
            <span>{ anchor.player.username }</span>
        </div>
        <div className="rp-wanted-tip-list">
            { anchor.player.charges.map((charge, index) => (
                <div key={ index } className="rp-wanted-tip-row">
                    <span className="rp-wanted-tip-name">{ charge.name }</span>
                    { (charge.count > 1) && <span className="rp-wanted-tip-count">×{ charge.count }</span> }
                </div>
            )) }
        </div>
    </div>, document.body);

const WantedRow: FC<{ player: RpWantedPlayer; onHover: (anchor: TipAnchor) => void }> = ({ player, onHover }) =>
{
    const hover = (event: React.MouseEvent<HTMLDivElement>) =>
    {
        if(!player.charges.length) return;

        // The row's box, not the window's: the tooltip lines up with the row
        // it describes. Left/right comes from the window edge, found from
        // the closest card so a scrolled list does not move it.
        const row = event.currentTarget.getBoundingClientRect();
        const card = (event.currentTarget.closest('.nitro-card') ?? event.currentTarget).getBoundingClientRect();
        const flip = (card.right + TIP_GAP + TIP_WIDTH) > window.innerWidth;

        onHover({
            player,
            left: flip ? (card.left - TIP_GAP - TIP_WIDTH) : (card.right + TIP_GAP),
            top: row.top,
            flip
        });
    }

    return (
        <div className="rp-wanted-row" onClick={ () => GetUserProfile(player.userId) }
            onMouseEnter={ hover } onMouseLeave={ () => onHover(null) }>
            <div className="rp-wanted-face">
                <LayoutAvatarImageView figure={ player.figure } direction={ 2 } headOnly />
            </div>
            <div className="rp-wanted-who">
                <div className="rp-wanted-name">{ player.username }</div>
                <WantedStars level={ player.level } />
            </div>
            <div className="rp-wanted-since">{ countdown(player.expiresAt) }</div>
        </div>
    );
}

export const RpWantedView: FC<{}> = props =>
{
    const [ isVisible, setIsVisible ] = useState(false);
    const [ entries, setEntries ] = useState<RpWantedPlayer[]>(() => GetRpWantedList());
    const [ tip, setTip ] = useState<TipAnchor>(null);
    const [ , setTick ] = useState(0);

    // Countdowns tick once a second while the window is open; the store
    // itself drops entries at zero, this only keeps the labels moving.
    useEffect(() =>
    {
        if(!isVisible) return;

        const interval = window.setInterval(() => setTick(value => value + 1), 1000);

        return () => window.clearInterval(interval);
    }, [ isVisible ]);

    // A row that vanishes mid-hover (expired, or the list was re-pushed)
    // must not leave its tooltip floating on the body.
    useEffect(() =>
    {
        if(tip && !entries.some(player => player.userId === tip.player.userId)) setTip(null);
    }, [ entries, tip ]);

    // The login push usually lands long before this window is opened, so the
    // list is read on mount as well as subscribed to.
    useEffect(() =>
    {
        setEntries(GetRpWantedList());

        return SubscribeRpWanted(() => setEntries(GetRpWantedList()));
    }, []);

    useEffect(() =>
    {
        const linkTracker: ILinkEventTracker = {
            linkReceived: (url: string) =>
            {
                const parts = url.split('/');

                if(parts.length < 2) return;

                switch(parts[1])
                {
                    case 'show':
                        setIsVisible(true);
                        return;
                    case 'hide':
                        setIsVisible(false);
                        return;
                    case 'toggle':
                        setIsVisible(prevValue => !prevValue);
                        return;
                }
            },
            eventUrlPrefix: 'rp-wanted/'
        };

        AddEventLinkTracker(linkTracker);

        return () => RemoveLinkEventTracker(linkTracker);
    }, []);

    if(!isVisible)
    {
        if(tip) setTip(null);

        return null;
    }

    return (
        <NitroCardView resizable uniqueKey="rp-wanted" className="rp-wanted-window" theme="primary-slim">
            <NitroCardHeaderView headerText="Wanted List" onCloseClick={ () => setIsVisible(false) } />
            <NitroCardContentView className="text-black">
                <div className="rp-wanted-list">
                    { !entries.length
                        ? <div className="rp-wanted-none">
                            <div className="rp-wanted-none-text">Nobody is wanted right now.</div>
                        </div>
                        : entries.map(player => <WantedRow key={ player.userId } player={ player } onHover={ setTip } />) }
                </div>
                { tip && <WantedTip anchor={ tip } /> }
            </NitroCardContentView>
        </NitroCardView>
    );
}
