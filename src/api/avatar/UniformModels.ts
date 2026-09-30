import { AvatarEditorUtilities } from './AvatarEditorUtilities';
import { CategoryBaseModel } from './CategoryBaseModel';
import { FigureData } from './FigureData';
import { HeadModel } from './HeadModel';
import { LegModel } from './LegModel';
import { TorsoModel } from './TorsoModel';

// pixelrp City Panel: the Choose Your Look category models, editing a UNIFORM.
//
// The stock models read and write AvatarEditorUtilities.CURRENT_FIGURE - the
// one figure the avatar editor is working on, normally your own. These point
// it at the uniform only while they work (building their categories, picking
// a part or a colour) and then put it back, so the uniform editor and Choose
// Your Look can both be open and neither ever edits the other's figure. Every
// set shows while building (SHOW_ALL_SETS), not just the ones you own.
//
// Hair is left out: a uniform dresses the player and keeps their own hair and
// face (emulator UniformManager.ClothingTypes).

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ModelClass = new (...args: any[]) => CategoryBaseModel;

const HIDDEN_TYPES = [ FigureData.HAIR ];

const Uniform = <T extends ModelClass>(Base: T) => class extends Base
{
    public figure: FigureData = null;

    private within(work: () => void): void
    {
        const previousFigure = AvatarEditorUtilities.CURRENT_FIGURE;
        const previousShowAll = AvatarEditorUtilities.SHOW_ALL_SETS;

        AvatarEditorUtilities.CURRENT_FIGURE = this.figure;
        AvatarEditorUtilities.SHOW_ALL_SETS = true;

        try
        {
            work();
        }
        finally
        {
            AvatarEditorUtilities.CURRENT_FIGURE = previousFigure;
            AvatarEditorUtilities.SHOW_ALL_SETS = previousShowAll;
        }
    }

    public init(): void
    {
        this.within(() =>
        {
            super.init();

            for(const type of HIDDEN_TYPES)
            {
                this._categories.get(type)?.dispose();
                this._categories.delete(type);
            }
        });
    }

    public selectPart(category: string, partIndex: number): void
    {
        this.within(() => super.selectPart(category, partIndex));
    }

    public selectColor(category: string, colorIndex: number, paletteId: number): void
    {
        this.within(() => super.selectColor(category, colorIndex, paletteId));
    }
};

export const UniformHeadModel = Uniform(HeadModel);
export const UniformTorsoModel = Uniform(TorsoModel);
export const UniformLegModel = Uniform(LegModel);

export type UniformModel = InstanceType<typeof UniformHeadModel>;

/** The Head / Torso / Legs models for one uniform figure. */
export const CreateUniformModels = (figure: FigureData): UniformModel[] =>
{
    const models: UniformModel[] = [ new UniformHeadModel(), new UniformTorsoModel(), new UniformLegModel() ];

    for(const model of models) model.figure = figure;

    return models;
}

/** The set types a uniform holds - emulator UniformManager.ClothingTypes. */
export const UNIFORM_TYPES = [ 'ha', 'he', 'ea', 'fa', 'ch', 'cc', 'cp', 'ca', 'lg', 'sh', 'wa' ];

/** A figure string cut down to its uniform parts. */
export const UniformPartsOf = (figure: string): string =>
    (figure || '').split('.').filter(part => UNIFORM_TYPES.includes(part.split('-')[0])).join('.');
