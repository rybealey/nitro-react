import { FC, useMemo } from 'react';
import { OverlayTrigger, Tooltip } from 'react-bootstrap';
import { CreateLinkEvent, LocalizeFormattedNumber, LocalizeShortNumber } from '../../../api';
import { Flex, LayoutCurrencyIcon, Text } from '../../../common';

// activity-points currency type for diamonds (wallet/5.png in the purse)
const DIAMONDS_TYPE = 5;

interface CurrencyViewProps
{
    type: number;
    amount: number;
    short: boolean;
}

export const CurrencyView: FC<CurrencyViewProps> = props =>
{
    const { type = -1, amount = -1, short = false } = props;

    const element = useMemo(() =>
    {
        // the diamonds row opens the Diamonds Store (same window as the
        // toolbar's Diamonds icon); other currencies stay display-only
        const onClick = (type === DIAMONDS_TYPE) ? () => CreateLinkEvent('diamonds-store/show') : null;

        return (
            <Flex justifyContent="end" pointer gap={ 1 } className="nitro-purse-button rounded" onClick={ onClick }>
                <Text truncate textEnd variant="white" grow>{ short ? LocalizeShortNumber(amount) : LocalizeFormattedNumber(amount) }</Text>
                <LayoutCurrencyIcon type={ type } />
            </Flex>);
    }, [ amount, short, type ]);

    if(!short) return element;
    
    return (
        <OverlayTrigger
            placement="left"
            overlay={
                <Tooltip id={ `tooltip-${ type }` }>
                    { LocalizeFormattedNumber(amount) }
                </Tooltip>
            }>
            { element }
        </OverlayTrigger>
    );
}
