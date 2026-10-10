import { AvatarFigurePartType, IAvatarImageListener, IAvatarRenderManager, IFigurePart, IFigurePartSet, IGraphicAsset, IPartColor, NitroAlphaFilter, NitroContainer, NitroSprite, TextureUtils } from '@nitrots/nitro-renderer';
import { GetAvatarRenderManager } from '../nitro';
import { FigureData } from './FigureData';

// pixelrp: drawing a thumbnail is a WebGL render read back to the CPU and
// encoded as a PNG, synchronously. Cheap on a Mac; on Windows (Chrome and
// Firefox draw WebGL through Direct3D) every read-back stalls for the GPU,
// and the City Panel's uniform editor lists every set - 520 hats where Choose
// Your Look lists ~60 - so drawing a whole category at once froze the window
// for seconds, and again on every colour click.
//
// So thumbnails are now drawn lazily and a few at a time:
// - a `lazy` item (every editor category) draws only while its tile is on
//   screen (the figure set view tells it, `visible`);
// - drawing goes through a queue with a per-frame time budget, never in one
//   blocking burst;
// - a drawn thumbnail is cached by set and colours, so a colour change, Undo,
//   Clear or a gender switch that comes back to it costs nothing.
const THUMB_FRAME_BUDGET_MS = 6;
const THUMB_CACHE_LIMIT = 3000;

class ThumbnailQueue
{
    private static _items: Set<AvatarEditorGridPartItem> = new Set();
    private static _frame: number = 0;

    public static add(item: AvatarEditorGridPartItem): void
    {
        this._items.add(item);

        if(!this._frame) this._frame = requestAnimationFrame(() => this.run());
    }

    public static remove(item: AvatarEditorGridPartItem): void
    {
        this._items.delete(item);
    }

    private static run(): void
    {
        this._frame = 0;

        const start = performance.now();

        for(const item of this._items)
        {
            this._items.delete(item);

            item.drawQueued();

            if((performance.now() - start) >= THUMB_FRAME_BUDGET_MS) break;
        }

        if(this._items.size) this._frame = requestAnimationFrame(() => this.run());
    }
}

const THUMB_CACHE: Map<string, string> = new Map();

export class AvatarEditorGridPartItem implements IAvatarImageListener
{
    private static ALPHA_FILTER: NitroAlphaFilter = new NitroAlphaFilter(0.2);
    private static THUMB_DIRECTIONS: number[] = [ 2, 6, 0, 4, 3, 1 ];
    private static DRAW_ORDER: string[] = [
        AvatarFigurePartType.LEFT_HAND_ITEM,
        AvatarFigurePartType.LEFT_HAND,
        AvatarFigurePartType.LEFT_SLEEVE,
        AvatarFigurePartType.LEFT_COAT_SLEEVE,
        AvatarFigurePartType.BODY,
        AvatarFigurePartType.SHOES,
        AvatarFigurePartType.LEGS,
        AvatarFigurePartType.CHEST,
        AvatarFigurePartType.CHEST_ACCESSORY,
        AvatarFigurePartType.COAT_CHEST,
        AvatarFigurePartType.CHEST_PRINT,
        AvatarFigurePartType.WAIST_ACCESSORY,
        AvatarFigurePartType.RIGHT_HAND,
        AvatarFigurePartType.RIGHT_SLEEVE,
        AvatarFigurePartType.RIGHT_COAT_SLEEVE,
        AvatarFigurePartType.HEAD,
        AvatarFigurePartType.FACE,
        AvatarFigurePartType.EYES,
        AvatarFigurePartType.HAIR,
        AvatarFigurePartType.HAIR_BIG,
        AvatarFigurePartType.FACE_ACCESSORY,
        AvatarFigurePartType.EYE_ACCESSORY,
        AvatarFigurePartType.HEAD_ACCESSORY,
        AvatarFigurePartType.HEAD_ACCESSORY_EXTRA,
        AvatarFigurePartType.RIGHT_HAND_ITEM,
    ];

    private _renderManager: IAvatarRenderManager;
    private _partSet: IFigurePartSet;
    private _partColors: IPartColor[];
    private _useColors: boolean;
    private _isDisabled: boolean;
    private _thumbContainer: NitroContainer;
    private _imageUrl: string;
    private _maxColorIndex: number;
    private _isValidFigure: boolean;
    private _isHC: boolean;
    private _isSellable: boolean;
    private _isClear: boolean;
    private _isSelected: boolean;
    private _disposed: boolean;
    private _isInitalized: boolean;
    private _notifier: () => void;
    private _lazy: boolean = false;
    private _visible: boolean = false;
    private _dirty: boolean = false;

    constructor(partSet: IFigurePartSet, partColors: IPartColor[], useColors: boolean = true, isDisabled: boolean = false, lazy: boolean = false)
    {
        this._renderManager = GetAvatarRenderManager();
        this._partSet = partSet;
        this._partColors = partColors;
        this._useColors = useColors;
        this._isDisabled = isDisabled;
        this._thumbContainer = null;
        this._imageUrl = null;
        this._maxColorIndex = 0;
        this._isValidFigure = false;
        this._isHC = false;
        this._isSellable = false;
        this._isClear = false;
        this._isSelected = false;
        this._disposed = false;
        this._isInitalized = false;
        this._lazy = lazy;

        if(partSet)
        {
            const colors = partSet.parts;

            for(const color of colors) this._maxColorIndex = Math.max(this._maxColorIndex, color.colorLayerIndex);

            // Known without drawing, so a tile not yet drawn still shows them.
            this._isHC = (partSet.clubLevel > 0);
            this._isSellable = partSet.isSellable;
        }
    }

    public init(): void
    {
        if(this._isInitalized) return;

        this._isInitalized = true;

        this.update();
    }

    public dispose(): void
    {
        if(this._disposed) return;

        this._renderManager = null;
        this._partSet = null;
        this._partColors = null;
        this._imageUrl = null;
        this._disposed = true;
        this._isInitalized = false;

        ThumbnailQueue.remove(this);

        if(this._thumbContainer)
        {
            this._thumbContainer.destroy();

            this._thumbContainer = null;
        }
    }

    public update(): void
    {
        if(!this._isInitalized || this._disposed) return;

        this._dirty = true;

        // A thumbnail drawn elsewhere (BodyModel's faces) is read at once, as
        // it always was: its owner frees the image right after handing it
        // over, so a later turn in the queue would read an empty texture.
        if(this._thumbContainer)
        {
            this.updateThumbVisualization();

            return;
        }

        this.schedule();
    }

    // Draw when it can be seen: from the cache at once, else in the queue.
    private schedule(): void
    {
        if(!this._dirty || this._disposed || (this._lazy && !this._visible)) return;

        const cached = this.cacheKey && THUMB_CACHE.get(this.cacheKey);

        if(cached)
        {
            this._dirty = false;
            this._imageUrl = cached;

            if(this.notify) this.notify();

            return;
        }

        ThumbnailQueue.add(this);
    }

    /** ThumbnailQueue's turn for this item. */
    public drawQueued(): void
    {
        if(!this._dirty || this._disposed || !this._isInitalized || (this._lazy && !this._visible)) return;

        this.updateThumbVisualization();
    }

    // The thumbnail's look: set, colours and dimming. None for a thumbnail
    // drawn elsewhere (BodyModel's faces) - that is the figure's own.
    private get cacheKey(): string
    {
        if(this._thumbContainer || !this._partSet) return null;

        const colors = (this._useColors && this._partColors) ? this._partColors.map(color => (color ? color.id : '')).join(',') : '';

        return `${ this._partSet.type }-${ this._partSet.id }:${ colors }:${ this._isDisabled ? 1 : 0 }`;
    }

    private analyzeFigure(): boolean
    {
        if(!this._renderManager || !this._partSet || !this._partSet.parts || !this._partSet.parts.length) return false;

        const figureContainer = this._renderManager.createFigureContainer(((this.partSet.type + '-') + this.partSet.id));

        if(!this._renderManager.isFigureContainerReady(figureContainer))
        {
            this._renderManager.downloadAvatarFigure(figureContainer, this);

            return false;
        }

        this._isValidFigure = true;

        return true;
    }

    private renderThumb(): NitroContainer
    {
        if(!this._renderManager || !this._partSet) return null;

        if(!this._isValidFigure)
        {
            if(!this.analyzeFigure()) return null;
        }

        const parts = this._partSet.parts.concat().sort(this.sortByDrawOrder);
        const container = new NitroContainer();

        for(const part of parts)
        {
            if(!part) continue;

            let asset: IGraphicAsset = null;
            let direction = 0;
            let hasAsset = false;

            while(!hasAsset && (direction < AvatarEditorGridPartItem.THUMB_DIRECTIONS.length))
            {
                const assetName = ((((((((((FigureData.SCALE + '_') + FigureData.STD) + '_') + part.type) + '_') + part.id) + '_') + AvatarEditorGridPartItem.THUMB_DIRECTIONS[direction]) + '_') + FigureData.DEFAULT_FRAME);

                asset = this._renderManager.getAssetByName(assetName);

                if(asset && asset.texture)
                {
                    hasAsset = true;
                }
                else
                {
                    direction++;
                }
            }

            if(!hasAsset) continue;

            const x = asset.offsetX;
            const y = asset.offsetY;
            let partColor: IPartColor = null;

            if(this._useColors && (part.colorLayerIndex > 0))
            {
                const color = this._partColors[(part.colorLayerIndex - 1)];

                if(color) partColor = color;
            }

            const sprite = new NitroSprite(asset.texture);

            sprite.position.set(x, y);

            if(partColor) sprite.tint = partColor.rgb;

            container.addChild(sprite);
        }

        return container;
    }

    private updateThumbVisualization(): void
    {
        if(!this._isInitalized) return;

        const isOwnContainer = !this._thumbContainer;
        const container = (this._thumbContainer || this.renderThumb());

        // Not ready (its assets are downloading): resetFigure calls update()
        // again when they land.
        if(!container) return;

        if(this._isDisabled) this.setAlpha(container, 0.2);

        const key = this.cacheKey;

        this._imageUrl = TextureUtils.generateImageUrl(container);
        this._dirty = false;

        // Drawn for this one image: its sprites go, their shared textures stay.
        if(isOwnContainer) container.destroy({ children: true });

        if(key && this._imageUrl)
        {
            if(THUMB_CACHE.size >= THUMB_CACHE_LIMIT) THUMB_CACHE.delete(THUMB_CACHE.keys().next().value);

            THUMB_CACHE.set(key, this._imageUrl);
        }

        if(this.notify) this.notify();
    }

    private setAlpha(container: NitroContainer, alpha: number): NitroContainer
    {
        container.filters = [ AvatarEditorGridPartItem.ALPHA_FILTER ];

        return container;
    }

    private sortByDrawOrder(a: IFigurePart, b: IFigurePart): number
    {
        const indexA = AvatarEditorGridPartItem.DRAW_ORDER.indexOf(a.type);
        const indexB = AvatarEditorGridPartItem.DRAW_ORDER.indexOf(b.type);

        if(indexA < indexB) return -1;

        if(indexA > indexB) return 1;

        if(a.index < b.index) return -1;

        if(a.index > b.index) return 1;

        return 0;
    }

    public resetFigure(figure: string): void
    {
        if(!this.analyzeFigure()) return;

        this.update();
    }

    public get disposed(): boolean
    {
        return this._disposed;
    }

    public get id(): number
    {
        if(!this._partSet) return -1;

        return this._partSet.id;
    }

    /** Whether its tile is on screen - a lazy item draws only while it is. */
    public set visible(flag: boolean)
    {
        this._visible = flag;

        if(flag) this.schedule();
        else ThumbnailQueue.remove(this);
    }

    public get partSet(): IFigurePartSet
    {
        return this._partSet;
    }

    public set partColors(partColors: IPartColor[])
    {
        this._partColors = partColors;

        this.update();
    }

    public get isDisabled(): boolean
    {
        return this._isDisabled;
    }

    public set thumbContainer(container: NitroContainer)
    {
        this._thumbContainer = container;

        this.update();
    }

    public get imageUrl(): string
    {
        return this._imageUrl;
    }

    public get maxColorIndex(): number
    {
        return this._maxColorIndex;
    }

    public get isHC(): boolean
    {
        return this._isHC;
    }

    public get isSellable(): boolean
    {
        return this._isSellable;
    }

    public get isClear(): boolean
    {
        return this._isClear;
    }

    public set isClear(flag: boolean)
    {
        this._isClear = flag;
    }

    public get isSelected(): boolean
    {
        return this._isSelected;
    }

    public set isSelected(flag: boolean)
    {
        this._isSelected = flag;

        if(this.notify) this.notify();
    }

    public get notify(): () => void
    {
        return this._notifier;
    }

    public set notify(notifier: () => void)
    {
        this._notifier = notifier;
    }
}
