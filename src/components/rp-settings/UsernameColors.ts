// PixelRP username color palette (Settings > Social > Username > Color).
// Black (#000000) is the default; selecting it persists as '' server-side.
// Colors are chosen to stay legible on the light chat-bubble background.

export interface UsernameColor
{
    key: string;
    name: string;
    color: string;
}

export const USERNAME_COLORS: UsernameColor[] = [
    { key: 'black', name: 'Black', color: '#000000' },
    { key: 'slate', name: 'Slate', color: '#4b5563' },
    { key: 'red', name: 'Red', color: '#b91c1c' },
    { key: 'crimson', name: 'Crimson', color: '#be123c' },
    { key: 'orange', name: 'Orange', color: '#d35400' },
    { key: 'amber', name: 'Amber', color: '#b45309' },
    { key: 'gold', name: 'Gold', color: '#a16207' },
    { key: 'olive', name: 'Olive', color: '#4d7c0f' },
    { key: 'green', name: 'Green', color: '#2e7d32' },
    { key: 'teal', name: 'Teal', color: '#0f766e' },
    { key: 'cyan', name: 'Cyan', color: '#0e7490' },
    { key: 'ocean', name: 'Ocean', color: '#0369a1' },
    { key: 'blue', name: 'Blue', color: '#1d4ed8' },
    { key: 'indigo', name: 'Indigo', color: '#3730a3' },
    { key: 'violet', name: 'Violet', color: '#6d28d9' },
    { key: 'purple', name: 'Purple', color: '#7e22ce' },
    { key: 'magenta', name: 'Magenta', color: '#a21caf' },
    { key: 'pink', name: 'Pink', color: '#be185d' },
    { key: 'brown', name: 'Brown', color: '#6d4c41' },
    { key: 'charcoal', name: 'Charcoal', color: '#374151' },
];

export const DEFAULT_USERNAME_COLOR: string = USERNAME_COLORS[0].color; // '#000000'

export const IsValidUsernameColor = (color: string): boolean => USERNAME_COLORS.some(entry => (entry.color === color));
