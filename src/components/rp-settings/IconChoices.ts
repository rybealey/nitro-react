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

export const USERNAME_ICONS: IconChoice[] = [
    { key: 'none', name: 'None', iconClass: null },
    // Custom kit icons populated from the live kit (discovered on beta), e.g.:
    // { key: 'star', name: 'Star', iconClass: 'fa-kit fa-kit-star' },
];

export const DEFAULT_USERNAME_ICON: string = ''; // none / X selected

export const IsValidUsernameIcon = (value: string): boolean =>
    (value === '') || USERNAME_ICONS.some(entry => (entry.iconClass === value));
