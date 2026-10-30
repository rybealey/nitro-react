import { Dispatch, FC, SetStateAction, useCallback, useEffect, useRef, useState } from 'react';
import { CanUseCustomColor, CategoryData, FigureData, IAvatarEditorCategoryModel } from '../../../api';
import { Column, Flex, Grid } from '../../../common';
import { AvatarEditorIcon } from './AvatarEditorIcon';
import { AvatarEditorFigureSetView } from './figure-set/AvatarEditorFigureSetView';
import { AvatarEditorCustomColorView } from './palette-set/AvatarEditorCustomColorView';
import { AvatarEditorPaletteSetView } from './palette-set/AvatarEditorPaletteSetView';
export interface AvatarEditorModelViewProps
{
    model: IAvatarEditorCategoryModel;
    gender: string;
    setGender: Dispatch<SetStateAction<string>>;
}

export const AvatarEditorModelView: FC<AvatarEditorModelViewProps> = props =>
{
    const { model = null, gender = null, setGender = null } = props;
    const [ activeCategory, setActiveCategory ] = useState<CategoryData>(null);
    // pixelrp: the palettes the worn piece takes a color from, one per color
    // layer it has - none for a piece that takes no color.
    const [ paletteIndexes, setPaletteIndexes ] = useState<number[]>([ 0 ]);
    // pixelrp: the custom color picker - which palette it is open on, and the
    // Custom tile of each palette it opens beside.
    const [ customPaletteIndex, setCustomPaletteIndex ] = useState(-1);
    const [ customVersion, setCustomVersion ] = useState(0);
    const customTiles = useRef<HTMLElement[]>([]);
    const customClosedAt = useRef<{ paletteIndex: number, time: number }>({ paletteIndex: -1, time: 0 });

    const selectCategory = useCallback((name: string) =>
    {
        const category = model.categories.get(name);

        if(!category) return;

        category.init();

        setActiveCategory(category);

        for(const part of category.parts)
        {
            if(!part || !part.isSelected) continue;

            setPaletteIndexes(part.paletteIndexes);

            break;
        }
    }, [ model ]);

    useEffect(() =>
    {
        model.init();

        for(const name of model.categories.keys())
        {
            selectCategory(name);

            break;
        }
    }, [ model, selectCategory ]);

    useEffect(() => setCustomPaletteIndex(-1), [ model, activeCategory ]);

    const registerCustomTile = useCallback((paletteIndex: number, element: HTMLElement) => (customTiles.current[paletteIndex] = element), []);

    const openCustomColor = useCallback((paletteIndex: number) =>
    {
        // The press that closed the picker on this tile is not a press to open it again.
        const closed = customClosedAt.current;

        if((closed.paletteIndex === paletteIndex) && ((performance.now() - closed.time) < 400)) return;

        setCustomPaletteIndex(paletteIndex);
    }, []);

    const closeCustomColor = useCallback(() =>
    {
        setCustomPaletteIndex(prevValue =>
        {
            customClosedAt.current = { paletteIndex: prevValue, time: performance.now() };

            return -1;
        });
    }, []);

    const onCustomChange = useCallback(() => setCustomVersion(prevValue => (prevValue + 1)), []);

    if(!model || !activeCategory) return null;

    const customEnabled = CanUseCustomColor(activeCategory.name);

    return (
        <Grid>
            <Column size={ 2 }>
                { model.canSetGender &&
                    <>
                        <Flex center pointer className="category-item" onClick={ event => setGender(FigureData.MALE) }>
                            <AvatarEditorIcon icon="male" selected={ (gender === FigureData.MALE) } />
                        </Flex>
                        <Flex center pointer className="category-item" onClick={ event => setGender(FigureData.FEMALE) }>
                            <AvatarEditorIcon icon="female" selected={ (gender === FigureData.FEMALE) } />
                        </Flex>
                    </> }
                { !model.canSetGender && model.categories && (model.categories.size > 0) && Array.from(model.categories.keys()).map(name =>
                {
                    const category = model.categories.get(name);

                    return (
                        <Flex center pointer key={ name } className="category-item" onClick={ event => selectCategory(name) }>
                            <AvatarEditorIcon icon={ category.name } selected={ (activeCategory === category) } />
                        </Flex>
                    );
                }) }
            </Column>
            <Column size={ 5 } overflow="hidden">
                <AvatarEditorFigureSetView model={ model } category={ activeCategory } setPaletteIndexes={ setPaletteIndexes } />
            </Column>
            <Column size={ 5 } overflow="hidden">
                { paletteIndexes.map(paletteIndex =>
                    <AvatarEditorPaletteSetView key={ paletteIndex } model={ model } category={ activeCategory } paletteSet={ activeCategory.getPalette(paletteIndex) } paletteIndex={ paletteIndex }
                        label={ (paletteIndexes.length > 1) ? `Color ${ paletteIndex + 1 }` : null }
                        customEnabled={ customEnabled } customOpen={ (customPaletteIndex === paletteIndex) } customVersion={ customVersion } onCustomClick={ openCustomColor } registerCustomTile={ registerCustomTile } />) }
                { customEnabled && (paletteIndexes.indexOf(customPaletteIndex) >= 0) && customTiles.current[customPaletteIndex] &&
                    <AvatarEditorCustomColorView key={ `${ activeCategory.name }:${ paletteIndexes.join() }` } model={ model } category={ activeCategory } paletteIndex={ customPaletteIndex } paletteIndexes={ paletteIndexes }
                        anchor={ customTiles.current[customPaletteIndex] } setPaletteIndex={ setCustomPaletteIndex } onChange={ onCustomChange } onClose={ closeCustomColor } /> }
            </Column>
        </Grid>
    );
}
