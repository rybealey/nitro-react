import { FC } from 'react';
import { FaTimes } from 'react-icons/fa';
import { ImageIconUrl, IsImageIcon } from './IconChoices';

// Renders a username icon uniformly for the picker and the chat views. A null
// iconClass is the "none" state, drawn as the target-HUD X (react-icons); an
// `img-*` value is an image icon from assets/images/username-icons, drawn at
// NATIVE size (never scaled — pixel art rule). Anything else — legacy
// FontAwesome kit values still stored server-side from before the kit was
// removed, or a newer sender's icon on an older bundle — renders nothing.
export const UsernameIconGlyph: FC<{ iconClass: string | null }> = ({ iconClass }) =>
{
    if(!iconClass) return <FaTimes />;

    if(!IsImageIcon(iconClass)) return null;

    const url = ImageIconUrl(iconClass);

    if(!url) return null;

    return <img className="username-icon-image" src={ url } alt="" />;
}
