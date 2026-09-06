import { CSSProperties, FC } from 'react';
import { LayoutAvatarImageView, LayoutBadgeImageView } from '../../common';

// Rounded avatar tile used across the phone apps: the participant's avatar
// head cropped into an ink-outlined square over a per-user pastel field.
// Group chats (id <= 0) carry a group badge instead of a figure.
// `unmasked` (Messages pinned grid) drops the tile entirely — bare head,
// same size and footprint, no field/outline/clipping.

const TILE_COLORS: string[] = [ '#ff9dbf', '#7fb0d0', '#f5b96a', '#7fc98f', '#ffb0cf', '#b58fd0', '#c98aa0', '#f0954a' ];

export const PhoneAvatarColor = (id: number): string => TILE_COLORS[ Math.abs(id) % TILE_COLORS.length ];

// A tiny round head (Notes collaborators, News bylines): the head-only
// figure render scaled to `size` over the user's pastel, with the initial as
// the fallback when no figure is known.
export const PhoneFace: FC<{ id: number, figure: string, name: string, size?: number, className?: string }> = props =>
{
    const { id = 0, figure = null, name = '', size = 18, className = null } = props;
    const style = { width: size, height: size, fontSize: Math.round(size * 0.45), background: PhoneAvatarColor(id), '--face-scale': (size / 44) } as CSSProperties;

    return (
        <div className={ `phone-face${ className ? (' ' + className) : '' }` } title={ name } style={ style }>
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
    unmasked?: boolean;
    // HUD-style portrait: the FULL figure sprite masked to the same
    // head+shoulders framing as the player HUD, instead of the head-only crop.
    portrait?: boolean;
    className?: string;
}

export const PhoneAvatar: FC<PhoneAvatarProps> = props =>
{
    const { id = 0, figure = null, size = 48, online = undefined, unmasked = false, portrait = false, className = null } = props;
    const big = (size >= 60);

    return (
        <div className={ `phone-avatar${ (big && !portrait) ? ' phone-avatar--2x' : '' }${ unmasked ? ' phone-avatar--unmasked' : '' }${ portrait ? ' phone-avatar--portrait' : '' }${ className ? (' ' + className) : '' }` } style={ { width: size, height: size, borderRadius: Math.round(size * 0.3) } }>
            <div className="phone-avatar-crop" style={ unmasked ? undefined : { backgroundColor: PhoneAvatarColor(id) } }>
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
