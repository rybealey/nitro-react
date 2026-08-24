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

// Custom kit icons discovered from kit 19221c1121. Duotone customs use the
// "fa-kit-duotone fa-<name>" class; the lone regular custom uses "fa-kit
// fa-<name>". To add more: upload the custom icon in the FA kit dashboard,
// then add one line here with the matching class.
export const USERNAME_ICONS: IconChoice[] = [
    { key: 'none', name: 'None', iconClass: null },
    { key: 'alien-8bit', name: 'Alien 8bit', iconClass: 'fa-kit-duotone fa-alien-8bit' },
    { key: 'anchor', name: 'Anchor', iconClass: 'fa-kit-duotone fa-anchor' },
    { key: 'battery-full', name: 'Battery Full', iconClass: 'fa-kit-duotone fa-battery-full' },
    { key: 'battery-half', name: 'Battery Half', iconClass: 'fa-kit-duotone fa-battery-half' },
    { key: 'battery-low', name: 'Battery Low', iconClass: 'fa-kit-duotone fa-battery-low' },
    { key: 'bolt', name: 'Bolt', iconClass: 'fa-kit-duotone fa-bolt' },
    { key: 'bomb', name: 'Bomb', iconClass: 'fa-kit-duotone fa-bomb' },
    { key: 'bug', name: 'Bug', iconClass: 'fa-kit-duotone fa-bug' },
    { key: 'circle-check', name: 'Circle Check', iconClass: 'fa-kit-duotone fa-circle-check' },
    { key: 'cloud', name: 'Cloud', iconClass: 'fa-kit-duotone fa-cloud' },
    { key: 'code', name: 'Code', iconClass: 'fa-kit-duotone fa-code' },
    { key: 'crown', name: 'Crown', iconClass: 'fa-kit-duotone fa-crown' },
    { key: 'face-frown', name: 'Face Frown', iconClass: 'fa-kit-duotone fa-face-frown' },
    { key: 'face-grin', name: 'Face Grin', iconClass: 'fa-kit-duotone fa-face-grin' },
    { key: 'face-meh', name: 'Face Meh', iconClass: 'fa-kit-duotone fa-face-meh' },
    { key: 'face-smile', name: 'Face Smile', iconClass: 'fa-kit-duotone fa-face-smile' },
    { key: 'fire', name: 'Fire', iconClass: 'fa-kit-duotone fa-fire' },
    { key: 'fish', name: 'Fish', iconClass: 'fa-kit-duotone fa-fish' },
    { key: 'flower', name: 'Flower', iconClass: 'fa-kit-duotone fa-flower' },
    { key: 'gamepad', name: 'Gamepad', iconClass: 'fa-kit-duotone fa-gamepad' },
    { key: 'ghost', name: 'Ghost', iconClass: 'fa-kit-duotone fa-ghost' },
    { key: 'headphones', name: 'Headphones', iconClass: 'fa-kit-duotone fa-headphones' },
    { key: 'heart', name: 'Heart', iconClass: 'fa-kit-duotone fa-heart' },
    { key: 'joystick', name: 'Joystick', iconClass: 'fa-kit-duotone fa-joystick' },
    { key: 'leaf', name: 'Leaf', iconClass: 'fa-kit-duotone fa-leaf' },
    { key: 'lightbulb', name: 'Lightbulb', iconClass: 'fa-kit-duotone fa-lightbulb' },
    { key: 'martini-glass', name: 'Martini Glass', iconClass: 'fa-kit-duotone fa-martini-glass' },
    { key: 'mug-hot', name: 'Mug Hot', iconClass: 'fa-kit-duotone fa-mug-hot' },
    { key: 'mushroom', name: 'Mushroom', iconClass: 'fa-kit-duotone fa-mushroom' },
    { key: 'paw', name: 'Paw', iconClass: 'fa-kit-duotone fa-paw' },
    { key: 'skull', name: 'Skull', iconClass: 'fa-kit-duotone fa-skull' },
    { key: 'star', name: 'Star', iconClass: 'fa-kit-duotone fa-star' },
    { key: 'sun', name: 'Sun', iconClass: 'fa-kit-duotone fa-sun' },
    { key: 'thumbs-up', name: 'Thumbs Up', iconClass: 'fa-kit-duotone fa-thumbs-up' },
    { key: 'tv-retro', name: 'TV Retro', iconClass: 'fa-kit-duotone fa-tv-retro' },
    { key: 'wand-magic-sparkles', name: 'Wand Magic Sparkles', iconClass: 'fa-kit-duotone fa-wand-magic-sparkles' },
    { key: 'wrench', name: 'Wrench', iconClass: 'fa-kit-duotone fa-wrench' },
    { key: 'microchip-sparkle', name: 'Microchip Sparkle', iconClass: 'fa-kit fa-microchip-sparkle' },
];

export const DEFAULT_USERNAME_ICON: string = ''; // none / X selected

export const IsValidUsernameIcon = (value: string): boolean =>
    (value === '') || USERNAME_ICONS.some(entry => (entry.iconClass === value));
