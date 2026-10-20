import { CSSProperties, FC, MouseEvent } from 'react';
import { LayoutAvatarImageView, LayoutBadgeImageView } from '../../common';

// Avatar used across the phone apps. A player's head renders bare: the
// head-only sprite, no pastel field, outline or clipping, scaled to fill the
// footprint. Group chats (id <= 0) carry a group badge instead, and those
// keep the ink-outlined pastel tile because there is no head to show.

const TILE_COLORS: string[] = [ '#ff9dbf', '#7fb0d0', '#f5b96a', '#7fc98f', '#ffb0cf', '#b58fd0', '#c98aa0', '#f0954a' ];

export const PhoneAvatarColor = (id: number): string => TILE_COLORS[ Math.abs(id) % TILE_COLORS.length ];

// The phone is drawn at 80% (the shell's zoom in PhoneView.scss) and every head
// again at its own CSS scale, so a sprite pixel lands on scale x 0.8 x the
// display's pixel ratio screen pixels. Pixel art only stays clean at a whole
// number, so the scale snaps to the nearest whole one (1 at least) and stays
// pixelated - a head at 0.94 is drawn 1:1, 6% bigger, rather than ragged. Only
// the tiny heads, well under 1 (News bylines, Notes), are drawn smooth instead:
// 1:1 would not fit their slot, and nearest-neighbour would drop whole rows and
// columns of pixels.
export const PHONE_ZOOM = 0.8;

const SMOOTH_BELOW = 0.75;

const SMOOTH: CSSProperties = { imageRendering: 'auto' };

export const PhoneHeadScale = (scale: number): { scale: number, smooth: boolean } =>
{
    const ratio = (PHONE_ZOOM * (window.devicePixelRatio || 1));
    const onScreen = (scale * ratio);

    if(onScreen < SMOOTH_BELOW) return { scale, smooth: true };

    return { scale: (Math.max(1, Math.round(onScreen)) / ratio), smooth: false };
}

// A tiny head (Notes collaborators, News bylines): the head-only figure
// render scaled to `size`, bare. The initial in a pastel circle is the
// fallback when no figure is known.
//
// onClick is optional and opt-in: a head is only tappable where a caller says
// it goes somewhere, so the heads in News, Notes, Notifications and the Wallet
// are untouched. The handler is given the event so a caller whose head sits
// inside an already-tappable row can stop it there - that nesting is the
// caller's to know about, not this component's.
export const PhoneFace: FC<{ id: number, figure: string, name: string, size?: number, className?: string, onClick?: (event: MouseEvent<HTMLDivElement>) => void }> = props =>
{
    const { id = 0, figure = null, name = '', size = 18, className = null, onClick = null } = props;
    const head = PhoneHeadScale(size / 44);
    const style = { width: size, height: size, fontSize: Math.round(size * 0.45), background: (figure ? undefined : PhoneAvatarColor(id)), '--face-scale': head.scale } as CSSProperties;

    return (
        <div className={ `phone-face${ figure ? ' phone-face--bare' : '' }${ onClick ? ' phone-tap' : '' }${ className ? (' ' + className) : '' }` } title={ name } style={ style } onClick={ onClick ?? undefined }>
            { figure
                ? <LayoutAvatarImageView figure={ figure } headOnly={ true } direction={ 2 } style={ head.smooth ? SMOOTH : undefined } />
                : <span>{ (name || '?').charAt(0).toUpperCase() }</span> }
        </div>
    );
}

interface PhoneAvatarProps
{
    id: number;
    figure: string;
    size: number;
    online?: boolean;
    // kept for callers; every player head is bare now
    unmasked?: boolean;
    // HUD-style portrait: the FULL figure sprite masked to the same
    // head+shoulders framing as the player HUD, instead of the head-only crop.
    portrait?: boolean;
    className?: string;
}

export const PhoneAvatar: FC<PhoneAvatarProps> = props =>
{
    const { id = 0, figure = null, size = 48, online = undefined, portrait = false, className = null } = props;
    // every player head is bare; the head sprite fills a 44px circle at scale 1.2, so scale with the footprint
    const bare = ((id > 0) && !portrait);
    // No floor on the scale: a tile smaller than the head sprite has to shrink
    // it, and clamping at 1 is what cropped a 30px avatar down to a sliver.
    // The portrait draws the sprite at its own size (scale 1); only whether it
    // is drawn smooth comes from here.
    const head = PhoneHeadScale(portrait ? 1 : Math.min(3, size / 37.5));

    return (
        <div className={ `phone-avatar${ bare ? ' phone-avatar--unmasked' : '' }${ portrait ? ' phone-avatar--portrait' : '' }${ className ? (' ' + className) : '' }` } style={ { width: size, height: size, borderRadius: Math.round(size * 0.3), '--head-scale': head.scale } as CSSProperties }>
            <div className="phone-avatar-crop" style={ bare ? undefined : { backgroundColor: PhoneAvatarColor(id) } }>
                { (id > 0) && figure &&
                    <LayoutAvatarImageView figure={ figure } headOnly={ !portrait } direction={ 2 } style={ head.smooth ? SMOOTH : undefined } /> }
                { (id <= 0) &&
                    <div className="phone-avatar-group-badge">
                        <LayoutBadgeImageView isGroup={ true } badgeCode={ figure } />
                    </div> }
            </div>
            { (online !== undefined) &&
                <div className={ `phone-avatar-presence${ online ? ' is-online' : '' }` } /> }
        </div>
    );
}
