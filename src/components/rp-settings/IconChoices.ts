// PixelRP username icon choices (Settings > Social > Username > Icon).
// The first entry (iconClass: null) is "None" — the target-HUD X — and stores
// '' server-side, rendering no prefix. Every other entry is a FontAwesome kit
// custom icon class rendered as [ <icon> ] before the username.

export interface IconChoice
{
    key: string;
    name: string;
    iconClass: string | null; // null = none (the X / clear state)
}

// Custom kit icons (family "fak" / class "fa-kit fa-<name>"), discovered from
// kit 19221c1121. To add more: upload the custom icon in the FA kit dashboard,
// then add one line here — { key, name, iconClass: 'fa-kit fa-<name>' }.
export const USERNAME_ICONS: IconChoice[] = [
    { key: 'none', name: 'None', iconClass: null },
    { key: 'microchip-sparkle', name: 'Microchip Sparkle', iconClass: 'fa-kit fa-microchip-sparkle' },
];

export const DEFAULT_USERNAME_ICON: string = ''; // none / X selected

export const IsValidUsernameIcon = (value: string): boolean =>
    (value === '') || USERNAME_ICONS.some(entry => (entry.iconClass === value));
