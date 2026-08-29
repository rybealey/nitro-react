// PixelRP username icon choices (Settings > Social > Personalization > Icon).
// The first entry (iconClass: null) is "None" — the target-HUD X — and stores
// '' server-side, rendering no prefix. Every other entry is an image icon
// (see below) rendered before the username. FontAwesome kit icons are gone
// for good — the SVG-JS kit they needed broke the phone's duotone tiles.

export interface IconChoice
{
    key: string;
    name: string;
    iconClass: string | null; // null = none (the X / clear state)
}

// Image icons: every PNG in assets/images/username-icons/ becomes a choice
// automatically at build time. The stored value is `img-<filename>` (which
// passes the emulator's icon allowlist); the URL is resolved locally by each
// client from its own bundle. Icon Color does not apply to these.
export const IMAGE_ICON_PREFIX = 'img-';

const IMAGE_ICON_URLS: Record<string, string> = {};

const imageIconFiles = import.meta.glob('../../assets/images/username-icons/*.png', { eager: true, as: 'url' });

const IMAGE_ICONS: IconChoice[] = Object.entries(imageIconFiles)
    .map(([ path, url ]) =>
    {
        const file = path.split('/').pop().replace(/\.png$/, '');

        // must satisfy the emulator's ^[a-z0-9][a-z0-9 -]{0,63}$ allowlist
        if(!/^[a-z0-9][a-z0-9-]*$/.test(file) || ((IMAGE_ICON_PREFIX.length + file.length) > 64)) return null;

        const value = (IMAGE_ICON_PREFIX + file);

        IMAGE_ICON_URLS[value] = (url as unknown as string);

        const name = file.split('-').map(part => (part.charAt(0).toUpperCase() + part.slice(1))).join(' ');

        return { key: value, name, iconClass: value };
    })
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name));

export const IsImageIcon = (value: string): boolean => !!value && value.startsWith(IMAGE_ICON_PREFIX);

export const ImageIconUrl = (value: string): string => (IMAGE_ICON_URLS[value] ?? null);

export const USERNAME_ICONS: IconChoice[] = [
    { key: 'none', name: 'None', iconClass: null },
    ...IMAGE_ICONS,
];

export const DEFAULT_USERNAME_ICON: string = ''; // none / X selected

export const IsValidUsernameIcon = (value: string): boolean =>
    (value === '') || USERNAME_ICONS.some(entry => (entry.iconClass === value));
