import { FC } from 'react';
import { FaTimes } from 'react-icons/fa';

// Renders a username icon uniformly for the picker and the chat views. A null
// iconClass is the "none" state, drawn as the target-HUD X (react-icons); a
// non-null class is a FontAwesome kit icon (<i> swapped to SVG by the kit).
export const UsernameIconGlyph: FC<{ iconClass: string | null; color?: string }> = ({ iconClass, color }) =>
    iconClass
        ? <i className={ iconClass } style={ color ? { color } : undefined } />
        : <FaTimes style={ color ? { color } : undefined } />;
