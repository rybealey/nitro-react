import { FC, ReactNode, useEffect, useRef, useState } from 'react';
import { SendMessageComposer } from '../../api';
import { RoomTurfView, RpRoomTurfEvent, RpTurfClaimComposer } from '../../api/rp-turf/RpTurfMessages';
import { useLocalStorage, useMessageEvent, useNavigator, useRoom } from '../../hooks';

// PixelRP turf panel - hangs from the top-centre of any turf room (design:
// "Turf Panel" canvas, B open / C folded). Who holds the turf, since when, the
// claim running in it, and the Claim button - the only way to claim a turf
// (RpTurfClaimComposer; TurfManager.TryClaim holds every rule).
//
// Server-driven: RpRoomTurfEvent arrives on room entry and on every change,
// per viewer (it carries the viewer's own gang). Between pushes this counts
// on locally - the claim's held time while it is not contested, and the
// holding time - so no tick has to be sent to anyone.

const NEUTRAL_A = 'b8b8b8';
const NEUTRAL_B = '444444';
/** The collapse animation's length - rp-turf-lift in TurfPanelView.scss. */
const COLLAPSE_MS = 150;

const hex = (value: string, fallback: string) => ('#' + ((value && value.length) ? value : fallback));

const clock = (seconds: number) =>
{
    const safe = Math.max(0, Math.ceil(seconds));

    return `${ Math.floor(safe / 60) }:${ String(safe % 60).padStart(2, '0') }`;
}

/** How long a gang has held the turf - "14m", "3h 05m", "2d 4h". */
const heldFor = (seconds: number) =>
{
    const minutes = Math.floor(seconds / 60);

    if(minutes < 1) return 'under a minute';
    if(minutes < 60) return `${ minutes }m`;

    const hours = Math.floor(minutes / 60);

    if(hours < 24) return `${ hours }h ${ String(minutes % 60).padStart(2, '0') }m`;

    return `${ Math.floor(hours / 24) }d ${ hours % 24 }h`;
}

const Shield: FC<{ a: string; b: string; size: number }> = props =>
{
    const { a, b, size } = props;

    return (
        <svg width={ size } height={ Math.round(size * 1.15) } viewBox="0 0 40 46" aria-hidden="true">
            <path d="M20 2 L3 8 V22 C3 33 10 40 20 44 Z" fill={ a } />
            <path d="M20 2 L37 8 V22 C37 33 30 40 20 44 Z" fill={ b } />
            <path d="M20 2 L37 8 V22 C37 33 30 40 20 44 C10 40 3 33 3 22 V8 Z" fill="none" stroke="rgba(0,0,0,0.55)" strokeWidth={ (size < 30) ? 2.5 : 2 } />
            { (size >= 30) && <path d="M20 5.5 L34 10.4" stroke="rgba(255,255,255,0.35)" strokeWidth="1.5" strokeLinecap="round" /> }
        </svg>
    );
}

const FlagIcon: FC<{ size: number }> = ({ size }) => (
    <svg width={ size } height={ size } viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M5 21V4" /><path d="M5 4h12l-2.5 4.5L17 13H5" />
    </svg>
);

const Chevron: FC<{ up: boolean }> = ({ up }) => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d={ up ? 'M6 15l6-6 6 6' : 'M6 9l6 6 6-6' } />
    </svg>
);

export const TurfPanelView: FC<{}> = props =>
{
    const { roomSession = null } = useRoom();
    const { navigatorData = null } = useNavigator();
    const [ view, setView ] = useState<RoomTurfView>(null);
    // When the view arrived, on performance.now(), so the countdowns run on
    // from it rather than from whenever this renders.
    const [ receivedAt, setReceivedAt ] = useState(0);
    const [ now, setNow ] = useState(() => performance.now());
    // Collapsed by default. A NEW key rather than the old one's default
    // flipped: everyone who had opened the panel under the old key would
    // otherwise go on seeing it expanded.
    const [ open, setOpen ] = useLocalStorage<boolean>('pixelrp.turf-panel.expanded', false);
    // Collapsing plays its lift-out before the tab replaces the panel; the
    // panel's drop-in and the tab's play on mount (TurfPanelView.scss).
    const [ closing, setClosing ] = useState(false);
    const closeTimer = useRef<ReturnType<typeof setTimeout>>(null);

    useEffect(() => () => clearTimeout(closeTimer.current), []);

    const collapse = () =>
    {
        if(closing) return;

        setClosing(true);
        closeTimer.current = setTimeout(() =>
        {
            setOpen(false);
            setClosing(false);
        }, COLLAPSE_MS);
    }

    useMessageEvent<RpRoomTurfEvent>(RpRoomTurfEvent, event =>
    {
        const parser = event.getParser();

        if(!parser) return;

        setView(parser.view);
        setReceivedAt(performance.now());
    });

    // The state is tagged with its room and only shown in THAT room - never
    // cleared on a room change. The server sends it DURING entry, before the
    // client's room session has switched over, so a clear keyed on the room
    // changing ran after it and wiped the one push the panel was going to get.

    // One tick a second while there is anything to count.
    const counting = !!(view && view.isTurf);

    useEffect(() =>
    {
        if(!counting) return;

        const interval = setInterval(() => setNow(performance.now()), 1000);

        return () => clearInterval(interval);
    }, [ counting ]);

    if(!roomSession || !view || !view.isTurf || (view.roomId !== roomSession.roomId)) return null;

    const since = Math.max(0, (now - receivedAt) / 1000);
    const turfName = (navigatorData?.enteredGuestRoom?.roomName || 'Turf').toUpperCase();

    const owned = (view.ownerGangId > 0);
    const yours = (owned && (view.viewerGangId > 0) && (view.viewerGangId === view.ownerGangId));
    const shieldA = hex(owned ? view.ownerColourA : NEUTRAL_A, NEUTRAL_A);
    const shieldB = hex(owned ? view.ownerColourB : NEUTRAL_B, NEUTRAL_B);

    const held = view.elapsedSeconds + ((view.capturing && !view.contested) ? since : 0);
    const left = Math.max(0, view.totalSeconds - held);
    const progress = ((view.totalSeconds > 0) ? Math.min(100, (held / view.totalSeconds) * 100) : 0);
    const heldTime = ((owned && (view.heldForSeconds > 0)) ? heldFor(view.heldForSeconds + since) : null);

    let statusLabel = 'Unclaimed';
    let statusClass = 'is-neutral';

    // "Contested by" names the gang trying to take the turf - the claimer -
    // not the owner or whoever is holding the claim off.
    if(view.capturing && view.contested) { statusLabel = `Contested by ${ view.claimGangName }`; statusClass = 'is-contested'; }
    else if(view.capturing) { statusLabel = `${ view.claimGangName } is claiming`; statusClass = 'is-claiming'; }
    else if(yours) { statusLabel = 'Your turf'; statusClass = 'is-yours'; }
    else if(owned) { statusLabel = 'Captured'; statusClass = 'is-captured'; }

    // No Claim button on a turf the viewer's gang holds, nor while a claim
    // runs - the time over the bar says it. Without a gang it says why.
    const holding = (yours && !view.capturing);
    const canClaim = (!holding && !view.capturing && (view.viewerGangId > 0));
    const claim = () => SendMessageComposer(new RpTurfClaimComposer());

    // An unclaimed turf with no claim running is always shown open, with its
    // Claim button: there is nothing to fold it to.
    const foldable = (owned || view.capturing);

    if(foldable && !open)
    {
        // A gang's name is bold here, as it is on the card.
        const after = (heldTime ? ` · ${ heldTime }` : '');
        let stripLine: ReactNode = (yours ? `Your turf${ after }` : <>Held by <strong>{ view.ownerName }</strong>{ after }</>);
        let stripClass = (yours ? 'is-yours' : '');

        if(view.capturing && view.contested) { stripLine = <>Contested by <strong>{ view.claimGangName }</strong> · { clock(left) } left</>; stripClass = 'is-contested'; }
        else if(view.capturing) { stripLine = <><strong>{ view.claimGangName }</strong> is claiming · { clock(left) }</>; stripClass = 'is-claiming'; }

        return (
            <div className="rp-turf-panel rp-turf-strip">
                <Shield a={ shieldA } b={ shieldB } size={ 15 } />
                <span className="rp-turf-name">{ turfName }</span>
                <span className={ `rp-turf-strip-line ${ stripClass }` }>{ stripLine }</span>
                { canClaim &&
                    <button type="button" className="rp-turf-claim rp-turf-claim--strip" onClick={ claim }>
                        <FlagIcon size={ 10 } />
                        Claim
                    </button> }
                <button type="button" className="rp-turf-toggle" aria-label="Open the turf panel" onClick={ () => setOpen(true) }>
                    <Chevron up={ false } />
                </button>
                { view.capturing &&
                    <div className={ `rp-turf-strip-progress ${ view.contested ? 'is-paused' : '' }` }>
                        <div style={ { width: `${ progress }%` } } />
                    </div> }
            </div>
        );
    }

    return (
        <div className={ `rp-turf-panel is-expanded${ closing ? ' is-closing' : '' }` }>
            <div className="rp-turf-head">
                <Shield a={ shieldA } b={ shieldB } size={ 22 } />
                <div className="rp-turf-heading">
                    <span className="rp-turf-name">{ turfName }</span>
                    <span className={ `rp-turf-status ${ statusClass }` }>{ statusLabel }</span>
                </div>
                { foldable
                    ? <button type="button" className="rp-turf-toggle" aria-label="Fold the turf panel" onClick={ collapse }><Chevron up={ true } /></button>
                    : <span className="rp-turf-toggle" aria-hidden="true" /> }
            </div>
            { owned &&
                <div className="rp-turf-line">
                    Held by <strong>{ view.ownerName }</strong>{ heldTime && ` · ${ heldTime }` }
                </div> }
            { view.capturing &&
                <div className="rp-turf-capture">
                    <div className="rp-turf-line">{ view.contested ? `${ clock(left) } left` : clock(left) }</div>
                    <div className={ `rp-turf-bar ${ view.contested ? 'is-paused' : '' }` }>
                        <div style={ { width: `${ progress }%` } } />
                    </div>
                </div> }
            { !holding && !view.capturing && (canClaim
                ? <button type="button" className="rp-turf-claim" onClick={ claim }><FlagIcon size={ 12 } />Claim Territory</button>
                : <button type="button" className="rp-turf-claim is-locked" disabled>Join a gang to claim</button>) }
        </div>
    );
}
