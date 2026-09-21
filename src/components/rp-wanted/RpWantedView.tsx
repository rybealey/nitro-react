import { ILinkEventTracker } from '@nitrots/nitro-renderer';
import { FC, useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FaRegStar, FaStar } from 'react-icons/fa';
import { AddEventLinkTracker, GetUserProfile, RemoveLinkEventTracker } from '../../api';
import { GetRpCanPardon, GetRpWantedList, RpWantedPlayer, SendRpDropCharge, SubscribeRpWanted } from '../../api/rp-wanted/RpWantedMessages';
import { DraggableWindowPosition, LayoutAvatarImageView, NitroCardContentView, NitroCardHeaderView, NitroCardView } from '../../common';

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

// How long a charge keeps somebody on the list, and therefore what a full bar
// means. The server owns the real figure; this only scales the bar, so being a
// little out of step with it costs a few pixels and nothing else.
const WANTED_WINDOW_MS = 15 * 60 * 1000;

// "2m 40s", or "47s" inside the last minute. Never negative: the store prunes
// at zero. Spelled out rather than "2:40" because the row now says "Time left"
// in front of it, and "Time left: 2:40" reads like a clock time rather than a
// duration.
const countdown = (expiresAt: number): string =>
{
    const seconds = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
    const minutes = Math.floor(seconds / 60);

    if(!minutes) return `${ seconds }s`;

    return `${ minutes }m ${ String(seconds % 60).padStart(2, '0') }s`;
}

// Seconds left, for the things that care how close to zero it is rather than
// what to print: the drain bar and the last-minute amber.
const secondsLeft = (expiresAt: number): number => Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));

// Where a hovered row wants its tooltip: to the right of the window, so it is
// never clipped by the list's scroller; flipped to the left when the window
// sits against the right edge of the screen.
//
// The anchor holds the user id, not the player: an officer dropping a count
// from inside the tooltip gets a fresh list pushed back, and the tooltip has
// to redraw from THAT rather than from the row object it opened on.
interface TipAnchor { userId: number; left: number; top: number; flip: boolean }

const TIP_WIDTH = 190;
const TIP_GAP = 8;

// How long the tooltip survives the pointer leaving the row or itself. Long
// enough to cross the gap between the window and the tooltip without hurrying,
// short enough that it does not linger over the room.
const TIP_GRACE = 260;

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
//
// Interactive for an on-duty officer: each line carries an x that drops ONE
// count of that crime, so a sheet reading "Assault x3" takes three clicks. For
// everybody else it is a read-only label and does not take the pointer at all,
// or it would swallow clicks meant for the room behind it.
const WantedTip: FC<{
    anchor: TipAnchor;
    player: RpWantedPlayer;
    canPardon: boolean;
    onEnter: () => void;
    onLeave: () => void;
}> = ({ anchor, player, canPardon, onEnter, onLeave }) => createPortal(
    <div className={ `rp-wanted-tip${ anchor.flip ? ' is-flipped' : '' }${ canPardon ? ' is-interactive' : '' }` }
        style={ { left: anchor.left, top: anchor.top, width: TIP_WIDTH } }
        onMouseEnter={ onEnter } onMouseLeave={ onLeave }>
        <div className="rp-wanted-tip-head">
            <span>{ player.charges.length === 1 ? 'Charge' : 'Charges' }</span>
            <span>{ player.username }</span>
        </div>
        <div className="rp-wanted-tip-list">
            { player.charges.map(charge => (
                <div key={ charge.crimeId } className="rp-wanted-tip-row">
                    { canPardon &&
                        <button type="button" className="rp-wanted-tip-drop"
                            title={ `Drop one count of ${ charge.name }` }
                            aria-label={ `Drop one count of ${ charge.name } against ${ player.username }` }
                            onClick={ () => SendRpDropCharge(player.userId, charge.crimeId) }>
                            <svg viewBox="0 0 10 10" aria-hidden="true">
                                <path d="M2 2l6 6M8 2l-6 6" />
                            </svg>
                        </button> }
                    <span className="rp-wanted-tip-name">{ charge.name }</span>
                    { (charge.count > 1) && <span className="rp-wanted-tip-count">×{ charge.count }</span> }
                </div>
            )) }
        </div>
    </div>, document.body);

const WantedRow: FC<{
    player: RpWantedPlayer;
    onHover: (anchor: TipAnchor) => void;
    onLeave: () => void;
}> = ({ player, onHover, onLeave }) =>
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
            userId: player.userId,
            left: flip ? (card.left - TIP_GAP - TIP_WIDTH) : (card.right + TIP_GAP),
            top: row.top,
            flip
        });
    }

    const left = secondsLeft(player.expiresAt);

    // Under a minute the countdown turns amber. Nothing flashes: this window
    // sits open beside a room people are playing in.
    const urgent = (left <= 60);

    return (
        <div className={ `rp-wanted-row is-level-${ player.level }${ urgent ? ' is-urgent' : '' }` }
            onClick={ () => GetUserProfile(player.userId) }
            onMouseEnter={ hover } onMouseLeave={ onLeave }>
            { /* A bust, not a head. `headOnly` would crop to the face and
                 leave it floating; the full figure framed by background-position
                 puts the shoulders against the bottom of the window, which is
                 what makes the tile read as a mugshot rather than a contact
                 card. Same technique the HUD portrait uses. */ }
            <div className="rp-wanted-face">
                <LayoutAvatarImageView figure={ player.figure } direction={ 2 } />
            </div>
            <div className="rp-wanted-who">
                <div className="rp-wanted-name">{ player.username }</div>
                <WantedStars level={ player.level } />
                <div className="rp-wanted-time">Time left: <span>{ countdown(player.expiresAt) }</span></div>
            </div>
            { /* Drains over the sentence. Decorative - the figure beside it is
                 the one anybody reads - so it is hidden from the reader. */ }
            <div className="rp-wanted-bar" aria-hidden="true"
                style={ { width: `${ Math.min(100, (left / (WANTED_WINDOW_MS / 1000)) * 100) }%` } } />
        </div>
    );
}

export const RpWantedView: FC<{}> = props =>
{
    const [ isVisible, setIsVisible ] = useState(false);
    const [ entries, setEntries ] = useState<RpWantedPlayer[]>(() => GetRpWantedList());
    const [ tip, setTip ] = useState<TipAnchor>(null);
    const [ , setTick ] = useState(0);
    const closeTimer = useRef(0);

    // The tooltip is a body-level element with a gap between it and the row,
    // so leaving one to reach the other has to be survivable: the close is
    // scheduled rather than immediate, and entering either end cancels it.
    // Without this an officer could never reach the x they are aiming at.
    const holdTip = useCallback(() =>
    {
        if(!closeTimer.current) return;

        window.clearTimeout(closeTimer.current);
        closeTimer.current = 0;
    }, []);

    const releaseTip = useCallback(() =>
    {
        holdTip();

        closeTimer.current = window.setTimeout(() =>
        {
            closeTimer.current = 0;

            setTip(null);
        }, TIP_GRACE);
    }, [ holdTip ]);

    const openTip = useCallback((anchor: TipAnchor) =>
    {
        holdTip();
        setTip(anchor);
    }, [ holdTip ]);

    useEffect(() => () => holdTip(), [ holdTip ]);

    // Countdowns tick once a second while the window is open; the store
    // itself drops entries at zero, this only keeps the labels moving.
    useEffect(() =>
    {
        if(!isVisible) return;

        const interval = window.setInterval(() => setTick(value => value + 1), 1000);

        return () => window.clearInterval(interval);
    }, [ isVisible ]);


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

    // Resolved from the CURRENT list, not from the row the tooltip opened on:
    // dropping a count pushes a fresh list, and a player whose sheet has been
    // cleared (or who has lapsed) is simply gone, which closes the tooltip.
    const tipPlayer = tip ? entries.find(player => player.userId === tip.userId) : null;

    return (
        <NitroCardView resizable uniqueKey="rp-wanted" className="rp-wanted-window" theme="primary-slim" windowPosition={ DraggableWindowPosition.SIDE_DRAWER }>
            <NitroCardHeaderView headerText="Wanted List" onCloseClick={ () => setIsVisible(false) } />
            <NitroCardContentView>
                <div className="rp-wanted-list">
                    { !entries.length
                        ? <div className="rp-wanted-none">
                            <FaRegStar />
                            <div className="rp-wanted-none-text">Nobody is wanted right now.</div>
                        </div>
                        : entries.map(player => (
                            <WantedRow key={ player.userId } player={ player } onHover={ openTip } onLeave={ releaseTip } />
                        )) }
                </div>
                { tip && tipPlayer &&
                    <WantedTip anchor={ tip } player={ tipPlayer } canPardon={ GetRpCanPardon() }
                        onEnter={ holdTip } onLeave={ releaseTip } /> }
            </NitroCardContentView>
        </NitroCardView>
    );
}
