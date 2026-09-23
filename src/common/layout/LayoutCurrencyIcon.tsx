import { CSSProperties, FC, useMemo } from 'react';
import { GetConfiguration } from '../../api';
import { Base, BaseProps } from '../Base';

export interface CurrencyIconProps extends BaseProps<HTMLDivElement>
{
    type: number | string;
}

// pixelrp: the hotel's own money (type -1) is DOLLARS, and it is drawn as a
// "$" rather than as the coin sprite. Every other currency - diamonds,
// duckets, seasonal tokens - keeps its icon.
//
// Done here rather than at each call site because the coin appeared on a dozen
// screens (the ATM, Mercury, the Wallet, the clothing store, the catalog, the
// camera, gifts, gangs) and a currency that reads as coins on some of them and
// dollars on the rest is two currencies to anybody who has not seen the code.
//
// The "$" goes INSIDE the box the icon already had, and the inline background
// image is simply not set for it. That is what keeps this to one edit: a dozen
// ancestor rules size .nitro-currency-icon for the sprite, and they all still
// apply - only what is drawn in the box changes.
const MONEY_TYPE = '-1';

export const LayoutCurrencyIcon: FC<CurrencyIconProps> = props =>
{
    const { type = '', classNames = [], style = {}, ...rest } = props;

    const isMoney = (type.toString() === MONEY_TYPE);

    const getClassNames = useMemo(() =>
    {
        const newClassNames: string[] = [ 'nitro-currency-icon' ];

        if(isMoney) newClassNames.push('is-money');

        if(classNames.length) newClassNames.push(...classNames);

        return newClassNames;
    }, [ classNames, isMoney ]);

    const urlString = useMemo(() =>
    {
        let url = GetConfiguration<string>('currency.asset.icon.url', '');
    
        url = url.replace('%type%', type.toString());

        return `url(${ url })`;
    }, [ type ]);

    const getStyle = useMemo(() =>
    {
        let newStyle: CSSProperties = {};

        if(!isMoney) newStyle.backgroundImage = urlString;

        if(Object.keys(style).length) newStyle = { ...newStyle, ...style };

        return newStyle;
    }, [ style, urlString, isMoney ]);

    return <Base classNames={ getClassNames } style={ getStyle } { ...rest }>{ isMoney ? '$' : null }</Base>
}
