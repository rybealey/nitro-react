import { CSSProperties, FC } from 'react';

// Phone UI glyph. Renders from the FontAwesome kit in Duotone Regular (the same
// kit as the home-screen app tiles). Call sites still pass the short names
// the phone has always used; this map translates each to its FA icon name.
// The `phone-pi` class is kept so existing rotate/filter rules keep targeting
// the icon.
const FA_MAP: Record<string, string> = {
    'arrow-up': 'arrow-up',
    'battery': 'battery-half',
    'battery-full': 'battery-full',
    'bookmark': 'thumbtack',
    'cake': 'cake-candles',
    'calendar': 'calendar',
    'calendar-days': 'calendar-days',
    'music': 'music',
    'play': 'play',
    'repeat': 'repeat',
    'pause': 'pause',
    'stop': 'stop',
    // Turning the phone itself, not rotating an image - the device glyph
    // is what says that.
    'rotate': 'rotate',
    'volume-low': 'volume-low',
    'camera': 'camera',
    'cellular-signal-3': 'signal',
    'check': 'check',
    'chevron-left': 'chevron-left',
    'chevron-right': 'chevron-right',
    'clock': 'clock',
    'globe': 'earth-americas',
    'close': 'xmark',
    'crop': 'crop',
    'download': 'download',
    'gamepad': 'gamepad',
    'human': 'universal-access',
    'image': 'image',
    'lock': 'lock',
    'map-pin-home': 'location-dot',
    'megaphone': 'bullhorn',
    'message': 'comment-dots',
    'moon': 'moon',
    'more-vertical': 'ellipsis-vertical',
    'pencil': 'pen-to-square',
    // Writing something NEW, as against editing something that exists. The two
    // were the same glyph and the compose button read as "edit this".
    'compose': 'feather-pointed',
    // Staff quieting a trending tag: nothing is deleted, it just stops being
    // amplified - which is what a slash through a circle says and a bin does not.
    'ban': 'ban',
    'phone': 'phone',
    'plus': 'plus',
    'search': 'magnifying-glass',
    'shield': 'shield-halved',
    'sliders': 'sliders',
    'sun': 'sun',
    'trash': 'trash',
    'user': 'user',
    'user-plus': 'user-plus',
    'users': 'users',
    'volume-2': 'volume-high',
    'volume-x': 'volume-xmark',
    'wallet': 'wallet',
    'wifi': 'wifi',
    'folder': 'folder',
    'folder-plus': 'folder-plus',
    'folder-open': 'folder-open',
    'list': 'list',
    'list-check': 'list-check',
    'heading': 'heading',
    'share': 'arrow-up-from-bracket',
    'undo': 'arrow-rotate-left',
    'ellipsis': 'ellipsis',
    'user-group': 'user-group',
    'note': 'note-sticky',
    'pin': 'thumbtack',
    // Who is hosting a jam. A crown rather than a star or a dot: the host is the
    // one who can pause everybody, and that is a rank, not a favourite.
    'crown': 'crown',
    // Somebody is in the jam. Used at 10px beside a name, where a full avatar
    // would not fit and would not add anything a name does not already say.
    'user-music': 'user-music',
    // Support. Not life-ring, which is what this was: FA draws it as a notched
    // circle, and at tile size that reads as a donut. A headset is what says
    // "somebody will answer", and it does not collide with Messages' bubble.
    'headset': 'headset',
    'circle': 'circle',
    'circle-check': 'circle-check',
    'arrow-right-from-bracket': 'arrow-right-from-bracket',
    'pen': 'pen'
};

export const PhoneIcon: FC<{ icon: string, size?: number, className?: string, style?: CSSProperties }> = props =>
{
    const { icon = null, size = 18, className = null, style = null } = props;
    const fa = (FA_MAP[icon] ?? icon);

    return <i aria-hidden="true" className={ `phone-pi fa-duotone fa-regular fa-${ fa }${ className ? (' ' + className) : '' }` } style={ { fontSize: size, ...style } } />;
}
