import { CSSProperties, FC, useMemo } from 'react';
import { GetConfiguration } from '../../api';
import { Base, BaseProps } from '../Base';

export interface CurrencyIconProps extends BaseProps<HTMLDivElement>
{
    type: number | string;
}

// pixelrp: coins (credits, type -1) draw PixelRP's own green note, which ships
// with the client (.nitro-currency-icon.is-coins in common/index.scss) rather
// than coming from wallet/-1.png: the assets tree is cached for a week, and a
// file in the client build reaches everyone with the next deploy.
const IsCoins = (type: number | string) => (type.toString() === '-1');

// pixelrp: diamonds (type 5) also ship in the client (.is-diamonds), replacing
// the remote wallet/5.png whose anti-aliased edge showed as a grey halo.
const IsDiamonds = (type: number | string) => (type.toString() === '5');

export const LayoutCurrencyIcon: FC<CurrencyIconProps> = props =>
{
    const { type = '', classNames = [], style = {}, ...rest } = props;

    const getClassNames = useMemo(() =>
    {
        const newClassNames: string[] = [ 'nitro-currency-icon' ];

        if(IsCoins(type)) newClassNames.push('is-coins');

        if(IsDiamonds(type)) newClassNames.push('is-diamonds');

        if(classNames.length) newClassNames.push(...classNames);

        return newClassNames;
    }, [ classNames, type ]);

    const urlString = useMemo(() =>
    {
        let url = GetConfiguration<string>('currency.asset.icon.url', '');
    
        url = url.replace('%type%', type.toString());

        return `url(${ url })`;
    }, [ type ]);

    const getStyle = useMemo(() =>
    {
        let newStyle: CSSProperties = {};

        if(!IsCoins(type) && !IsDiamonds(type)) newStyle.backgroundImage = urlString;

        if(Object.keys(style).length) newStyle = { ...newStyle, ...style };

        return newStyle;
    }, [ style, type, urlString ]);

    return <Base classNames={ getClassNames } style={ getStyle } { ...rest } />
}
