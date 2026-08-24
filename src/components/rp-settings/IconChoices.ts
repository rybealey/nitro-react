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

// Custom "pixel" style icons from kit 19221c1121 (prefix "fapr", class
// "fa-pixel fa-regular fa-<name>"). To add more: upload the icon into the
// pixel style in the FA kit dashboard, then add one line here.
export const USERNAME_ICONS: IconChoice[] = [
    { key: 'none', name: 'None', iconClass: null },
    { key: 'alien-8bit', name: 'Alien 8bit', iconClass: 'fa-pixel fa-regular fa-alien-8bit' },
    { key: 'anchor', name: 'Anchor', iconClass: 'fa-pixel fa-regular fa-anchor' },
    { key: 'battery-full', name: 'Battery Full', iconClass: 'fa-pixel fa-regular fa-battery-full' },
    { key: 'battery-half', name: 'Battery Half', iconClass: 'fa-pixel fa-regular fa-battery-half' },
    { key: 'battery-low', name: 'Battery Low', iconClass: 'fa-pixel fa-regular fa-battery-low' },
    { key: 'bolt', name: 'Bolt', iconClass: 'fa-pixel fa-regular fa-bolt' },
    { key: 'bomb', name: 'Bomb', iconClass: 'fa-pixel fa-regular fa-bomb' },
    { key: 'bug', name: 'Bug', iconClass: 'fa-pixel fa-regular fa-bug' },
    { key: 'circle-check', name: 'Circle Check', iconClass: 'fa-pixel fa-regular fa-circle-check' },
    { key: 'cloud', name: 'Cloud', iconClass: 'fa-pixel fa-regular fa-cloud' },
    { key: 'code', name: 'Code', iconClass: 'fa-pixel fa-regular fa-code' },
    { key: 'crown', name: 'Crown', iconClass: 'fa-pixel fa-regular fa-crown' },
    { key: 'face-frown', name: 'Face Frown', iconClass: 'fa-pixel fa-regular fa-face-frown' },
    { key: 'face-grin', name: 'Face Grin', iconClass: 'fa-pixel fa-regular fa-face-grin' },
    { key: 'face-meh', name: 'Face Meh', iconClass: 'fa-pixel fa-regular fa-face-meh' },
    { key: 'face-smile', name: 'Face Smile', iconClass: 'fa-pixel fa-regular fa-face-smile' },
    { key: 'fire', name: 'Fire', iconClass: 'fa-pixel fa-regular fa-fire' },
    { key: 'fish', name: 'Fish', iconClass: 'fa-pixel fa-regular fa-fish' },
    { key: 'flower', name: 'Flower', iconClass: 'fa-pixel fa-regular fa-flower' },
    { key: 'gamepad', name: 'Gamepad', iconClass: 'fa-pixel fa-regular fa-gamepad' },
    { key: 'ghost', name: 'Ghost', iconClass: 'fa-pixel fa-regular fa-ghost' },
    { key: 'headphones', name: 'Headphones', iconClass: 'fa-pixel fa-regular fa-headphones' },
    { key: 'heart', name: 'Heart', iconClass: 'fa-pixel fa-regular fa-heart' },
    { key: 'joystick', name: 'Joystick', iconClass: 'fa-pixel fa-regular fa-joystick' },
    { key: 'leaf', name: 'Leaf', iconClass: 'fa-pixel fa-regular fa-leaf' },
    { key: 'lightbulb', name: 'Lightbulb', iconClass: 'fa-pixel fa-regular fa-lightbulb' },
    { key: 'martini-glass', name: 'Martini Glass', iconClass: 'fa-pixel fa-regular fa-martini-glass' },
    { key: 'mug-hot', name: 'Mug Hot', iconClass: 'fa-pixel fa-regular fa-mug-hot' },
    { key: 'mushroom', name: 'Mushroom', iconClass: 'fa-pixel fa-regular fa-mushroom' },
    { key: 'paw', name: 'Paw', iconClass: 'fa-pixel fa-regular fa-paw' },
    { key: 'skull', name: 'Skull', iconClass: 'fa-pixel fa-regular fa-skull' },
    { key: 'star', name: 'Star', iconClass: 'fa-pixel fa-regular fa-star' },
    { key: 'sun', name: 'Sun', iconClass: 'fa-pixel fa-regular fa-sun' },
    { key: 'thumbs-up', name: 'Thumbs Up', iconClass: 'fa-pixel fa-regular fa-thumbs-up' },
    { key: 'tv-retro', name: 'TV Retro', iconClass: 'fa-pixel fa-regular fa-tv-retro' },
    { key: 'wand-magic-sparkles', name: 'Wand Magic Sparkles', iconClass: 'fa-pixel fa-regular fa-wand-magic-sparkles' },
    { key: 'wrench', name: 'Wrench', iconClass: 'fa-pixel fa-regular fa-wrench' },
];

export const DEFAULT_USERNAME_ICON: string = ''; // none / X selected

export const IsValidUsernameIcon = (value: string): boolean =>
    (value === '') || USERNAME_ICONS.some(entry => (entry.iconClass === value));
