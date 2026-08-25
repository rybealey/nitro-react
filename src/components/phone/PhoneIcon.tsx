import { CSSProperties, FC } from 'react';

// Pixel-art glyph from the pixelarticons set, tinted via CSS mask so it
// follows the surrounding text color. Icon classes live in PhoneView.scss.
export const PhoneIcon: FC<{ icon: string, size?: number, className?: string, style?: CSSProperties }> = props =>
{
    const { icon = null, size = 18, className = null, style = null } = props;

    return <i className={ `phone-pi phone-pi-${ icon }${ className ? (' ' + className) : '' }` } style={ { width: size, height: size, ...style } } />;
}
