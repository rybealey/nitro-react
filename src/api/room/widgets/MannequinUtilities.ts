import { AvatarFigurePartType, IAvatarFigureContainer } from '@nitrots/nitro-renderer';
import { GetAvatarRenderManager } from '../../nitro';

export class MannequinUtilities
{
    public static MANNEQUIN_FIGURE = [ 'hd', 99999, [ 99998 ] ];
    // pixelrp: as the renderer's FurnitureMannequinVisualization.BODY_COLORS -
    // a mannequin whose body is not the stock white
    public static MANNEQUIN_BODY_COLORS: { [type: string]: number } = {
        'boutique_mannequin1_black': 99997 // #1F1D1D
    };
    public static MANNEQUIN_CLOTHING_PART_TYPES = [
        AvatarFigurePartType.CHEST_ACCESSORY,
        AvatarFigurePartType.COAT_CHEST,
        AvatarFigurePartType.CHEST,
        AvatarFigurePartType.LEGS,
        AvatarFigurePartType.SHOES,
        AvatarFigurePartType.WAIST_ACCESSORY
    ];

    public static getMergedMannequinFigureContainer(figure: string, targetFigure: string): IAvatarFigureContainer
    {
        const figureContainer = GetAvatarRenderManager().createFigureContainer(figure);
        const targetFigureContainer = GetAvatarRenderManager().createFigureContainer(targetFigure);

        for(const part of this.MANNEQUIN_CLOTHING_PART_TYPES) figureContainer.removePart(part);

        for(const part of targetFigureContainer.getPartTypeIds()) figureContainer.updatePart(part, targetFigureContainer.getPartSetId(part), targetFigureContainer.getPartColorIds(part));

        return figureContainer;
    }

    public static transformAsMannequinFigure(figureContainer: IAvatarFigureContainer, type: string = null): void
    {
        for(const part of figureContainer.getPartTypeIds())
        {
            if(this.MANNEQUIN_CLOTHING_PART_TYPES.indexOf(part) >= 0) continue;

            figureContainer.removePart(part);
        }

        const bodyColor = (type && this.MANNEQUIN_BODY_COLORS[type]);

        figureContainer.updatePart((this.MANNEQUIN_FIGURE[0] as string), (this.MANNEQUIN_FIGURE[1] as number), (bodyColor ? [ bodyColor ] : (this.MANNEQUIN_FIGURE[2] as number[])));
    };
}
