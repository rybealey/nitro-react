import { FC, useEffect, useMemo, useState } from 'react';
import { LocalizeText, Offer, ProductTypeEnum } from '../../../../../api';
import { Column, Flex, Text } from '../../../../../common';
import { useCatalog } from '../../../../../hooks';

const MIN_VALUE: number = 1;
// The emulator's own ceiling: PurchaseFromCatalogEvent silently resets an
// amount outside 1-100 to 1, so anything higher here would look like a
// hundred-item purchase and deliver one.
const MAX_VALUE: number = 100;

// Drawn rather than glyphed so they stay crisp at 9px and recolour with the
// button. Same pair as the build tools' steppers.
const StepIcon: FC<{ minus?: boolean }> = ({ minus = false }) => (
    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="3.4" strokeLinecap="round">
        <path d="M5 12h14" />
        { !minus && <path d="M12 5v14" /> }
    </svg>);

export const CatalogSpinnerWidgetView: FC<{}> = props =>
{
    const { currentOffer = null, purchaseOptions = null, setPurchaseOptions = null } = useCatalog();
    const { quantity = 1 } = purchaseOptions;
    // The box has to be allowed to read empty mid-edit - clearing it to type
    // "12" would otherwise snap back to "1" after the first keystroke.
    const [ text, setText ] = useState<string>('1');

    useEffect(() => setText(quantity.toString()), [ quantity ]);

    // Two gates, both necessary.
    //
    // bundlePurchaseAllowed is the SERVER's permission (ItemUtility
    // .CanSelectAmount): where it is false the purchase handler resets the
    // amount to 1, so a box there would take a number and quietly deliver one
    // item. It is never a reason on its own to show the control - it is true
    // for pets and effects too.
    //
    // Furni is the house rule on top: floor and wall items only, nothing
    // rented, nothing unique. "Ten of this" means nothing for a rented booth
    // or a one-of-a-kind rare, and a multi-pack offer is excluded because the
    // server takes the pack's own count over the client's number.
    const allowsQuantity = useMemo(() =>
    {
        if(!currentOffer || !currentOffer.bundlePurchaseAllowed) return false;

        if(currentOffer.isRentOffer) return false;

        if(currentOffer.pricingModel !== Offer.PRICING_MODEL_SINGLE) return false;

        const product = currentOffer.product;

        if(!product) return false;

        if((product.productType !== ProductTypeEnum.FLOOR) && (product.productType !== ProductTypeEnum.WALL)) return false;

        if(product.isUniqueLimitedItem) return false;

        return true;
    }, [ currentOffer ]);

    const updateQuantity = (value: number) =>
    {
        if(isNaN(value)) value = MIN_VALUE;

        value = Math.max(value, MIN_VALUE);
        value = Math.min(value, MAX_VALUE);

        if(value === quantity)
        {
            setText(value.toString());

            return;
        }

        setPurchaseOptions(prevValue =>
        {
            const newValue = { ...prevValue };

            newValue.quantity = value;

            return newValue;
        });
    }

    // type="text" with the digits filtered out by hand: a number input draws
    // its own spin arrows next to ours, and its arrow keys fight the steppers.
    const onChange = (value: string) =>
    {
        const digits = value.replace(/[^0-9]/g, '');

        setText(digits);

        if(!digits.length) return;

        updateQuantity(parseInt(digits, 10));
    }

    if(!allowsQuantity) return null;

    return (
        <Column gap={ 1 }>
            <Text>{ LocalizeText('catalog.quantity') }</Text>
            <Flex alignItems="center" gap={ 1 }>
                <Flex center pointer className="quantity-step" onClick={ event => updateQuantity(quantity - 1) }>
                    <StepIcon minus />
                </Flex>
                <input type="text" inputMode="numeric" className="form-control form-control-sm quantity-input"
                    value={ text }
                    onChange={ event => onChange(event.target.value) }
                    onBlur={ event => updateQuantity(quantity) } />
                <Flex center pointer className="quantity-step" onClick={ event => updateQuantity(quantity + 1) }>
                    <StepIcon />
                </Flex>
            </Flex>
        </Column>
    );
}
