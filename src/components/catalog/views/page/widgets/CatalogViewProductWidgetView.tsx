import { Vector3d } from '@nitrots/nitro-renderer';
import { FC, useEffect } from 'react';
import { FurniCategory, GetAvatarRenderManager, GetSessionDataManager, Offer, ProductTypeEnum } from '../../../../../api';
import { AutoGrid, Column, LayoutGridItem, LayoutRoomPreviewerView } from '../../../../../common';
import { useCatalog } from '../../../../../hooks';

// pixelrp: the shop preview's own room. The wall is room.nitro's test wall
// 99999, recoloured dark grey in nitro/overrides/bundled/generic/room.nitro;
// it is sold nowhere, so only previews wear it. Every preview starts from
// these rather than from whatever the last one left - a wallpaper used to stay
// up behind every furni after it - and only a floor, wallpaper or landscape
// being previewed replaces its own part.
const PREVIEW_FLOOR = '110';
const PREVIEW_WALL = '99999';
const PREVIEW_LANDSCAPE = 'default';

export const CatalogViewProductWidgetView: FC<{}> = props =>
{
    const { currentOffer = null, roomPreviewer = null, purchaseOptions = null } = useCatalog();
    const { previewStuffData = null } = purchaseOptions;

    useEffect(() =>
    {
        if(!currentOffer || (currentOffer.pricingModel === Offer.PRICING_MODEL_BUNDLE) || !roomPreviewer) return;

        const product = currentOffer.product;

        if(!product) return;

        roomPreviewer.reset(false);

        switch(product.productType)
        {
            case ProductTypeEnum.FLOOR: {
                if(!product.furnitureData) return;

                if(product.furnitureData.specialType === FurniCategory.FIGURE_PURCHASABLE_SET)
                {
                    const furniData = GetSessionDataManager().getFloorItemData(product.furnitureData.id);
                    const customParts = furniData.customParams.split(',').map(value => parseInt(value));
                    const figureSets: number[] = [];

                    for(const part of customParts)
                    {
                        if(GetAvatarRenderManager().isValidFigureSetForGender(part, GetSessionDataManager().gender)) figureSets.push(part);
                    }

                    const figureString = GetAvatarRenderManager().getFigureStringWithFigureIds(GetSessionDataManager().figure, GetSessionDataManager().gender, figureSets);

                    roomPreviewer.addAvatarIntoRoom(figureString, product.productClassId)
                }
                else
                {
                    roomPreviewer.updateObjectRoom(PREVIEW_FLOOR, PREVIEW_WALL, PREVIEW_LANDSCAPE);
                    roomPreviewer.addFurnitureIntoRoom(product.productClassId, new Vector3d(90), previewStuffData, product.extraParam);
                }
                return;
            }
            case ProductTypeEnum.WALL: {
                if(!product.furnitureData) return;

                switch(product.furnitureData.specialType)
                {
                    case FurniCategory.FLOOR:
                        roomPreviewer.updateObjectRoom(product.extraParam, PREVIEW_WALL, PREVIEW_LANDSCAPE);
                        return;
                    case FurniCategory.WALL_PAPER:
                        roomPreviewer.updateObjectRoom(PREVIEW_FLOOR, product.extraParam, PREVIEW_LANDSCAPE);
                        return;
                    case FurniCategory.LANDSCAPE: {
                        roomPreviewer.updateObjectRoom(PREVIEW_FLOOR, PREVIEW_WALL, product.extraParam);

                        const furniData = GetSessionDataManager().getWallItemDataByName('window_double_default');

                        if(furniData) roomPreviewer.addWallItemIntoRoom(furniData.id, new Vector3d(90), furniData.customParams);
                        return;
                    }
                    default:
                        roomPreviewer.updateObjectRoom(PREVIEW_FLOOR, PREVIEW_WALL, PREVIEW_LANDSCAPE);
                        roomPreviewer.addWallItemIntoRoom(product.productClassId, new Vector3d(90), product.extraParam);
                        return;
                }
            }
            case ProductTypeEnum.ROBOT:
                roomPreviewer.addAvatarIntoRoom(product.extraParam, 0);
                return;
            case ProductTypeEnum.EFFECT:
                roomPreviewer.addAvatarIntoRoom(GetSessionDataManager().figure, product.productClassId);
                return;
        }
    }, [ currentOffer, previewStuffData, roomPreviewer ]);

    if(!currentOffer) return null;

    if(currentOffer.pricingModel === Offer.PRICING_MODEL_BUNDLE)
    {
        return (
            <Column fit overflow="hidden" className="bg-muted p-2 rounded">
                <AutoGrid fullWidth columnCount={ 4 } className="nitro-catalog-layout-bundle-grid">
                    { (currentOffer.products.length > 0) && currentOffer.products.map((product, index) =>
                    {
                        return <LayoutGridItem key={ index } itemImage={ product.getIconUrl(currentOffer) } itemCount={ product.productCount } />;
                    }) }
                </AutoGrid>
            </Column>
        );
    }
    
    return <LayoutRoomPreviewerView roomPreviewer={ roomPreviewer } height={ 140 } />;
}
