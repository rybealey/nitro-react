import { CategoryBaseModel } from './CategoryBaseModel';
import { FigureData } from './FigureData';

// pixelrp: the Companions tab of Choose Your Outfit - the pets Habbo added
// for its Unity client. The renderer can draw them because
// ExtendAvatarStructure taught it the part types; this is only where you
// pick one.
export class CompanionsModel extends CategoryBaseModel
{
    public static NAME: string = 'companions';

    public init(): void
    {
        super.init();

        this.addCategory(FigureData.PET);

        this._isInitalized = true;
    }

    public get name(): string
    {
        return CompanionsModel.NAME;
    }
}
