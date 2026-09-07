import { CSSProperties } from 'react';

// The phone's built-in wallpapers, drawn in CSS so they ship without assets
// and stay crisp at any size. 'lobby' is the pixel room the phone has always
// had (painted by .phone-home-wallpaper's stylesheet rule). A captured photo
// is stored as 'photo:<url>'.

export const DEFAULT_WALLPAPER: string = 'lobby';
export const PHOTO_WALLPAPER_PREFIX: string = 'photo:';

export const WALLPAPERS: { key: string, name: string }[] = [
    { key: 'lobby', name: 'Lobby' },
    { key: 'dusk', name: 'Dusk' },
    { key: 'tiles', name: 'Tiles' },
    { key: 'ink', name: 'Ink' },
    { key: 'sorbet', name: 'Sorbet' },
    { key: 'terminal', name: 'Terminal' }
];

export const IsPhotoWallpaper = (value: string): boolean => (!!value && value.startsWith(PHOTO_WALLPAPER_PREFIX));
export const PhotoWallpaperUrl = (value: string): string => (IsPhotoWallpaper(value) ? value.substring(PHOTO_WALLPAPER_PREFIX.length) : '');
export const MakePhotoWallpaper = (url: string): string => `${ PHOTO_WALLPAPER_PREFIX }${ url }`;

// Validates a stored value: a known key, or a photo reference.
export const CleanWallpaper = (value: unknown): string =>
{
    if(typeof value !== 'string') return DEFAULT_WALLPAPER;

    if(IsPhotoWallpaper(value)) return value;

    return (WALLPAPERS.some(item => (item.key === value)) ? value : DEFAULT_WALLPAPER);
}

// What the Settings row shows for the current choice.
export const WallpaperName = (value: string): string =>
{
    if(IsPhotoWallpaper(value)) return 'Photo';

    return (WALLPAPERS.find(item => (item.key === value)) ?? WALLPAPERS[0]).name;
}

const DRAWN: Record<string, string> = {
    // a synth sunset: banded violet to peach with a low sun
    dusk: 'radial-gradient(circle at 50% 58%, #ffe3a3 0 9%, rgba(255, 227, 163, 0) 9.6%), repeating-linear-gradient(180deg, rgba(43, 26, 78, 0) 0 6%, rgba(43, 26, 78, .35) 6% 6.6%) 0 52% / 100% 30% no-repeat, linear-gradient(180deg, #1b1238 0%, #4a1f63 38%, #b23a6a 58%, #f0773f 74%, #f8c37b 100%)',
    // two-tone teal checker, the hotel's floor tiles at wallpaper scale
    tiles: 'radial-gradient(120% 90% at 50% 100%, rgba(6, 40, 40, .55), rgba(6, 40, 40, 0) 60%), repeating-conic-gradient(#1e7f76 0 25%, #2fb3a6 0 50%) 0 0 / 44px 44px',
    // near-black with two soft glows in the phone's pink and blue
    ink: 'radial-gradient(70% 38% at 28% 26%, rgba(233, 58, 125, .62), rgba(233, 58, 125, 0) 70%), radial-gradient(60% 34% at 74% 70%, rgba(63, 143, 191, .5), rgba(63, 143, 191, 0) 70%), #0b0a10',
    // pastel diagonal stripes
    sorbet: 'repeating-linear-gradient(135deg, #ffd3e4 0 32px, #ffe7c4 32px 64px, #d3f1e8 64px 96px, #d9e6ff 96px 128px)',
    // a green dot matrix under scanlines
    terminal: 'repeating-linear-gradient(180deg, rgba(0, 0, 0, 0) 0 3px, rgba(0, 0, 0, .22) 3px 4px), radial-gradient(circle, rgba(64, 255, 154, .75) 1px, rgba(64, 255, 154, 0) 1.8px) 0 0 / 9px 9px, #07160f'
};

// Inline style for a wallpaper surface. `scale` shrinks the drawn patterns
// for the small preview tiles (1 = the real home screen). 'lobby' returns
// nothing so the stylesheet's image shows through.
export const WallpaperStyle = (value: string, scale: number = 1): CSSProperties =>
{
    if(IsPhotoWallpaper(value)) return { background: `url("${ PhotoWallpaperUrl(value) }") center / cover no-repeat`, imageRendering: 'pixelated' };

    const drawn = DRAWN[value];

    if(!drawn) return undefined;

    if(scale === 1) return { background: drawn };

    // the pattern sizes are the only absolute lengths: scale them down
    const scaled = drawn.replace(/(\d+(?:\.\d+)?)px/g, (match, number) => `${ Math.max(1, (parseFloat(number) * scale)).toFixed(2) }px`);

    return { background: scaled };
}
