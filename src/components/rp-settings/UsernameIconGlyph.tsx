import { FC } from 'react';
import { FaTimes } from 'react-icons/fa';
import { ImageIconUrl, IsImageIcon } from './IconChoices';

// Renders a username icon uniformly for the picker and the chat views. A null
// iconClass is the "none" state, drawn as the target-HUD X (react-icons); an
// `img-*` value is an image icon from assets/images/username-icons (drawn at
// NATIVE size, never scaled — pixel art rule — and color does not apply); any
// other value is a FontAwesome kit icon (<i> swapped to SVG by the kit).
export const UsernameIconGlyph: FC<{ iconClass: string | null; color?: string }> = ({ iconClass, color }) =>
{
    if(!iconClass) return <FaTimes style={ color ? { color } : undefined } />;

    if(IsImageIcon(iconClass))
    {
        const url = ImageIconUrl(iconClass);

        // unknown id (e.g. a newer sender's icon on an older client build)
        if(!url) return null;

        return <img className="username-icon-image" src={ url } alt="" />;
    }

    return <i className={ iconClass } style={ color ? { color } : undefined } />;
}
