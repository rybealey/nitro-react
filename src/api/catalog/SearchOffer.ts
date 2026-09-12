import { IFurnitureData } from '@nitrots/nitro-renderer';
import { GetProductDataForLocalization } from '..';
import { CatalogPage } from './CatalogPage';
import { ICatalogPage } from './ICatalogPage';
import { IProduct } from './IProduct';
import { IPurchasableOffer } from './IPurchasableOffer';
import { Offer } from './Offer';
import { PageLocalization } from './PageLocalization';
import { Product } from './Product';

/**
 * PixelRP: one hit from the server-side shop search.
 *
 * FurnitureOffer, which the stock search uses, addresses an item by its OFFER
 * id - and every catalog row in this hotel carries offer_id -1, which is the
 * whole reason the stock search finds nothing. A hit instead carries the two
 * numbers a purchase actually needs: the page it is sold on and its catalog
 * item id.
 *
 * IT KEEPS ITS OWN PAGE. CatalogPage's constructor assigns itself to every
 * offer it is given, so dropping these into a results page would overwrite the
 * one thing that makes them buyable. The setter is deliberately inert: the
 * results page is a container these are being shown in, not the shelf they are
 * sold from, and the purchase widget reads offer.page.pageId.
 */
export class SearchOffer implements IPurchasableOffer
{
    private _page: ICatalogPage;
    private _product: IProduct;

    constructor(
        pageId: number,
        private readonly _itemId: number,
        private readonly _name: string,
        private readonly _className: string,
        private readonly _costCredits: number,
        private readonly _costPixels: number,
        private readonly _costDiamonds: number,
        furniData: IFurnitureData)
    {
        this._product = (new Product(furniData.type, furniData.id, furniData.customParams, 1, GetProductDataForLocalization(furniData.className), furniData) as IProduct);
        this._page = (new CatalogPage(pageId, 'default_3x3', new PageLocalization([], []), [], false) as ICatalogPage);
    }

    public activate(): void
    {
        return;
    }

    public get offerId(): number
    {
        return this._itemId;
    }

    public get className(): string
    {
        return this._className;
    }

    public get page(): ICatalogPage
    {
        return this._page;
    }

    public set page(page: ICatalogPage)
    {
        // Ignored on purpose - see the class note.
        return;
    }

    public get priceInCredits(): number
    {
        return this._costCredits;
    }

    public get priceInActivityPoints(): number
    {
        return this._costPixels;
    }

    public get activityPointType(): number
    {
        return 0;
    }

    public get priceType(): string
    {
        return '';
    }

    public get product(): IProduct
    {
        return this._product;
    }

    public get products(): IProduct[]
    {
        return [ this._product ];
    }

    public get localizationId(): string
    {
        return this._name;
    }

    public get bundlePurchaseAllowed(): boolean
    {
        return false;
    }

    public get isRentOffer(): boolean
    {
        return false;
    }

    public get giftable(): boolean
    {
        return false;
    }

    public get pricingModel(): string
    {
        return Offer.PRICING_MODEL_FURNITURE;
    }

    public get clubLevel(): number
    {
        return 0;
    }

    public get badgeCode(): string
    {
        return '';
    }

    public get localizationName(): string
    {
        return this._name;
    }

    public get localizationDescription(): string
    {
        return this._className;
    }

    public get isLazy(): boolean
    {
        return false;
    }

    public get priceInDiamonds(): number
    {
        return this._costDiamonds;
    }
}
