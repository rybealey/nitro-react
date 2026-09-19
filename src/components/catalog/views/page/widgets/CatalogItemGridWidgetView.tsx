import { FC, useEffect, useRef } from 'react';
import { IPurchasableOffer, ProductTypeEnum, SearchOffer } from '../../../../../api';
import { AutoGrid, AutoGridProps } from '../../../../../common';
import { useCatalog } from '../../../../../hooks';
import { CatalogGridOfferView } from '../common/CatalogGridOfferView';

interface CatalogItemGridWidgetViewProps extends AutoGridProps
{

}

export const CatalogItemGridWidgetView: FC<CatalogItemGridWidgetViewProps> = props =>
{
    const { columnCount = 5, children = null, ...rest } = props;
    const { currentOffer = null, setCurrentOffer = null, currentPage = null, setPurchaseOptions = null, requestSearchOffer } = useCatalog();
    const elementRef = useRef<HTMLDivElement>();

    useEffect(() =>
    {
        if(elementRef && elementRef.current) elementRef.current.scrollTop = 0;
    }, [ currentPage ]);

    useEffect(() =>
    {
        if(currentOffer) elementRef.current?.querySelector('.layout-grid-item.active')?.scrollIntoView({ block: 'nearest' });
    }, [ currentOffer ]);

    if(!currentPage) return null;

    const selectOffer = (offer: IPurchasableOffer) =>
    {
        if(offer instanceof SearchOffer)
        {
            requestSearchOffer(offer);
            return;
        }
        offer.activate();

        if(offer.isLazy) return;
        
        setCurrentOffer(offer);

        if(offer.product && (offer.product.productType === ProductTypeEnum.WALL))
        {
            setPurchaseOptions(prevValue =>
            {
                const newValue = { ...prevValue };
    
                newValue.extraData = (offer.product.extraParam || null);
    
                return newValue;
            });
        }
    }

    return (
        <AutoGrid innerRef={ elementRef } columnCount={ columnCount } { ...rest }>
            { currentPage.offers && (currentPage.offers.length > 0) && currentPage.offers.map((offer, index) =>
            {
                const active = currentOffer && currentOffer.offerId === offer.offerId;
                return <CatalogGridOfferView key={ index } itemActive={ !!active } offer={ active ? currentOffer : offer } selectOffer={ selectOffer } />;
            }) }
            { children }
        </AutoGrid>
    );
}
