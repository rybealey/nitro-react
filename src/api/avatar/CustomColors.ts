import { IPartColor } from '@nitrots/nitro-renderer';
import { GetAvatarPalette, GetAvatarSetType } from '../nitro';
import { GetLocalStorage, IsHexColor, SetLocalStorage } from '../utils';
import { FigureData } from './FigureData';

// pixelrp: custom outfit colors (Outfit Color Picker canvas). A color id from
// 0x1000000 to 0x1FFFFFF is in no palette - it carries its own RGB, id -
// 0x1000000, so a look stays all numbers: ch-3030-24792288 is a #7a4ce0 shirt.
// The renderer and the imager draw them (custom-colors patch); the emulator
// keeps them on hair and clothing and gives skin back a palette color.
export const CUSTOM_COLOR_BASE: number = 0x1000000;
export const CUSTOM_COLOR_MAX: number = 0x1FFFFFF;

// The custom colors last applied, newest first; the account keeps them.
const RECENT_CUSTOM_COLORS_KEY: string = 'pixelrp.prefs.outfit.recent';
const RECENT_CUSTOM_COLORS_MAX: number = 8;

export const IsCustomColorId = (colorId: number): boolean => ((colorId >= CUSTOM_COLOR_BASE) && (colorId <= CUSTOM_COLOR_MAX));

export const CustomColorIdFromHex = (hex: string): number => (CUSTOM_COLOR_BASE + parseInt(hex.replace('#', ''), 16));

export const CustomColorHexFromId = (colorId: number): string => ('#' + (colorId - CUSTOM_COLOR_BASE).toString(16).padStart(6, '0'));

// The part color the editor's thumbnails are drawn in; the same color the
// renderer's palettes give for the id.
export const CustomPartColor = (colorId: number): IPartColor => ({ id: colorId, index: -1, clubLevel: 0, isSelectable: false, rgb: (colorId - CUSTOM_COLOR_BASE) });

export const CanUseCustomColor =(setType: string): boolean => ((setType !== FigureData.FACE) && (setType !== FigureData.PET));

// The color a set type is worn in, palette or custom, as #rrggbb; null for an
// id its palette does not have.
export const GetFigureColorHex = (setType: string, colorId: number): string =>
{
    if(IsCustomColorId(colorId)) return CustomColorHexFromId(colorId);

    const setTypeData = GetAvatarSetType(setType);
    const color = (setTypeData ? GetAvatarPalette(setTypeData.paletteID)?.getColor(colorId) : null);

    return (color ? ('#' + color.rgb.toString(16).padStart(6, '0')) : null);
}

export const GetRecentCustomColors = (): string[] =>
{
    const raw = GetLocalStorage<string[]>(RECENT_CUSTOM_COLORS_KEY);

    return (Array.isArray(raw) ? raw.filter(IsHexColor).map(hex => hex.toLowerCase()).slice(0, RECENT_CUSTOM_COLORS_MAX) : []);
}

export const AddRecentCustomColors = (colors: string[]): void =>
{
    const added = colors.map(hex => hex.toLowerCase());

    SetLocalStorage(RECENT_CUSTOM_COLORS_KEY, [ ...added, ...GetRecentCustomColors().filter(hex => !added.includes(hex)) ].slice(0, RECENT_CUSTOM_COLORS_MAX));
}
