import { CSSProperties, FC } from 'react';
import { LayoutAvatarImageView, LayoutBadgeImageView } from '../../common';

// Avatar used across the phone apps. A player's head renders bare: the
// head-only sprite, no pastel field, outline or clipping, scaled to fill the
// footprint. Group chats (id <= 0) carry a group badge instead, and those
// keep the ink-outlined pastel tile because there is no head to show.

const TILE_COLORS: string[] = [ '#ff9dbf', '#7fb0d0', '#f5b96a', '#7fc98f', '#ffb0cf', '#b58fd0', '#c98aa0', '#f0954a' ];

export const PhoneAvatarColor = (id: number): string => TILE_COLORS[ Math.abs(id) % TILE_COLORS.length ];

// A tiny head (Notes collaborators, News bylines): the head-only figure
// render scaled to `size`, bare. The initial in a pastel circle is the
// fallback when no figure is known.
export const PhoneFace: FC<{ id: number, figure: string, name: string, size?: number, className?: string }> = props =>
{
    const { id = 0, figure = null, name = '', size = 18, className = null } = props;
    const style = { width: size, height: size, fontSize: Math.round(size * 0.45), background: (figure ? undefined : PhoneAvatarColor(id)), '--face-scale': (size / 44) } as CSSProperties;

    return (
        <div className={ `phone-face${ figure ? ' phone-face--bare' : '' }${ className ? (' ' + className) : '' }` } title={ name } style={ style }>
            { figure
                ? <LayoutAvatarImageView figure={ figure } headOnly={ true } direction={ 2 } />
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
    const headScale = Math.min(3, Math.max(1, size / 37.5));

    return (
        <div className={ `phone-avatar${ bare ? ' phone-avatar--unmasked' : '' }${ portrait ? ' phone-avatar--portrait' : '' }${ className ? (' ' + className) : '' }` } style={ { width: size, height: size, borderRadius: Math.round(size * 0.3), '--head-scale': headScale } as CSSProperties }>
            <div className="phone-avatar-crop" style={ bare ? undefined : { backgroundColor: PhoneAvatarColor(id) } }>
                { (id > 0) && figure &&
                    <LayoutAvatarImageView figure={ figure } headOnly={ !portrait } direction={ 2 } /> }
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
