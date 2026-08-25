import { FC } from 'react';
import { LayoutAvatarImageView, LayoutBadgeImageView } from '../../common';

// Rounded avatar tile used across the phone apps: the participant's avatar
// head cropped into an ink-outlined square over a per-user pastel field.
// Group chats (id <= 0) carry a group badge instead of a figure.
// `unmasked` (Messages pinned grid) drops the tile entirely — bare head,
// same size and footprint, no field/outline/clipping.

const TILE_COLORS: string[] = [ '#ff9dbf', '#7fb0d0', '#f5b96a', '#7fc98f', '#ffb0cf', '#b58fd0', '#c98aa0', '#f0954a' ];

export const PhoneAvatarColor = (id: number): string => TILE_COLORS[ Math.abs(id) % TILE_COLORS.length ];

interface PhoneAvatarProps
{
    id: number;
    figure: string;
    size: number;
    online?: boolean;
    unmasked?: boolean;
    className?: string;
}

export const PhoneAvatar: FC<PhoneAvatarProps> = props =>
{
    const { id = 0, figure = null, size = 48, online = undefined, unmasked = false, className = null } = props;
    const big = (size >= 60);

    return (
        <div className={ `phone-avatar${ big ? ' phone-avatar--2x' : '' }${ unmasked ? ' phone-avatar--unmasked' : '' }${ className ? (' ' + className) : '' }` } style={ { width: size, height: size, borderRadius: Math.round(size * 0.3) } }>
            <div className="phone-avatar-crop" style={ unmasked ? undefined : { backgroundColor: PhoneAvatarColor(id) } }>
                { (id > 0) && figure &&
                    <LayoutAvatarImageView figure={ figure } headOnly={ true } direction={ 2 } /> }
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
