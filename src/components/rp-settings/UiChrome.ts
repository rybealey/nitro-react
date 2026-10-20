// PixelRP UI chrome color system (runtime half — the SCSS half lives in
// assets/styles/_chrome.scss). Applying a scheme recomputes the chrome CSS
// variables exactly the way the SCSS defaults are derived from $dark:
//   surface  = base @ .95 alpha        (and .92 for the HUD action chips)
//   bevel hi = lighten(base, 2.5) @ .6
//   bevel lo = darken(base, 4) @ .6
//   hover    = lighten(base, 6) @ .95
// lighten/darken match SCSS semantics: +/- percentage points of HSL lightness.

export interface ChromeScheme
{
    key: string;
    name: string;
    color: string;
}

// Base colors stay DARK — every chrome surface carries white text/icons.
// 'charcoal' is rgb(28,28,32): the exact $dark base, i.e. the default look.
export const CHROME_SCHEMES: ChromeScheme[] = [
    { key: 'charcoal', name: 'Charcoal', color: '#1c1c20' },
    { key: 'midnight', name: 'Midnight', color: '#1a2334' },
    { key: 'ocean', name: 'Ocean', color: '#143038' },
    { key: 'forest', name: 'Forest', color: '#1c3026' },
    { key: 'plum', name: 'Plum', color: '#2a1c33' },
    { key: 'wine', name: 'Wine', color: '#331c29' },
    { key: 'ember', name: 'Ember', color: '#33251c' },
    { key: 'slate', name: 'Slate', color: '#232a31' },
];

export const DEFAULT_CHROME_COLOR: string = CHROME_SCHEMES[0].color;

// Chrome surface opacity, any whole percent from 0 to 100; 95 = the original
// look. The stored value is the SURFACE alpha in percent — every derived alpha
// (HUD chips, bevels, hover) scales by the same factor so the bevel language
// keeps its contrast at any opacity. The default is 90 (Twist, 2026-10-20),
// and the :root fallbacks in _chrome.scss are drawn at it. The emulator's
// default for a player with no saved settings matches DEFAULT_CHROME_OPACITY
// (Habbo.RpUiChromeOpacity), and it clamps saves to the same 0-100.
export const DEFAULT_CHROME_OPACITY: number = 90;

export const ClampChromeOpacity = (value: number): number => (Number.isFinite(value) ? Math.min(100, Math.max(0, Math.round(value))) : DEFAULT_CHROME_OPACITY);

// Window header colours, from the CMS pixel design system ramps. Window title
// bars are one flat colour (`face`, with a light `hi` line along the top -
// Window Frames canvas, D in pixel orange); the top/bottom duo-tone is kept for
// the other places that use the pair. A scheme without its own face uses its
// top stop.
export interface HeaderScheme
{
    key: string;
    name: string;
    top: string;
    bottom: string;
    face?: string;
    hi?: string;
}

export const HEADER_SCHEMES: HeaderScheme[] = [
    // the P logo's orange and its highlight
    { key: 'orange', name: 'Orange', top: '#f0954a', bottom: '#e87332', face: '#f59436', hi: '#ffc679' },
    { key: 'pink', name: 'Pink', top: '#f8558c', bottom: '#e93a7d' },
    { key: 'purple', name: 'Purple', top: '#6d1057', bottom: '#4a0b3d' },
];

export const DEFAULT_HEADER_KEY: string = 'orange';

// A header is one of the three preset keys, or (Settings > UI > Colours) any
// '#rrggbb' from the colour picker, which is the bottom stop.
export const IsValidHeaderKey = (key: string): boolean => (HEADER_SCHEMES.some(scheme => (scheme.key === key)) || /^#[0-9a-fA-F]{6}$/.test(key));

// The colour the picker shows for a header: a preset's bottom stop, or the
// picked colour itself.
export const HeaderColor = (key: string): string =>
{
    const scheme = HEADER_SCHEMES.find(entry => (entry.key === key));

    if(scheme) return scheme.bottom;

    return (/^#[0-9a-fA-F]{6}$/.test(key) ? key.toLowerCase() : HEADER_SCHEMES[0].bottom);
}

// The key to keep for a picked header colour: a preset's own bottom stop maps
// back to that preset, so its hand-picked top stop is kept.
export const HeaderKeyForColor = (color: string): string =>
{
    const hex = color.toLowerCase();
    const scheme = HEADER_SCHEMES.find(entry => (entry.bottom === hex));

    return (scheme ? scheme.key : hex);
}

// Mix a '#rrggbb' toward white (amount > 0) or black (amount < 0).
const mixHex = (hex: string, amount: number): string =>
{
    const target = ((amount > 0) ? 255 : 0);
    const part = Math.abs(amount);
    const channel = (offset: number) =>
    {
        const value = parseInt(hex.slice(offset, offset + 2), 16);

        return Math.round(value + ((target - value) * part)).toString(16).padStart(2, '0');
    }

    return `#${ channel(1) }${ channel(3) }${ channel(5) }`;
}

const hexToHsl = (hex: string): { h: number, s: number, l: number } =>
{
    const r = (parseInt(hex.slice(1, 3), 16) / 255);
    const g = (parseInt(hex.slice(3, 5), 16) / 255);
    const b = (parseInt(hex.slice(5, 7), 16) / 255);
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = ((max + min) / 2);

    let h = 0;
    let s = 0;

    if(max !== min)
    {
        const d = (max - min);

        s = ((l > 0.5) ? (d / (2 - max - min)) : (d / (max + min)));

        switch(max)
        {
            case r: h = (((g - b) / d) + ((g < b) ? 6 : 0)); break;
            case g: h = (((b - r) / d) + 2); break;
            case b: h = (((r - g) / d) + 4); break;
        }

        h = (h / 6);
    }

    return { h: (h * 360), s: (s * 100), l: (l * 100) };
}

const hsla = (h: number, s: number, l: number, a: number): string =>
{
    return `hsla(${ h.toFixed(2) }, ${ s.toFixed(2) }%, ${ Math.min(100, Math.max(0, l)).toFixed(2) }%, ${ a })`;
}

export const IsValidChromeColor = (color: string): boolean => /^#[0-9a-fA-F]{6}$/.test(color);

// Drawer icon tint: the drawer PNGs are grayscale; each icon carries a masked
// overlay painted with this colour and blended with mix-blend-mode: color, so
// the hue carries and the art keeps its shading. Its own setting now (Settings
// > UI > Colours > Sidebar Icons), no longer derived from the interface colour.
// '' or invalid = transparent = the neutral grayscale art.
export const ApplyIconTint = (colour: string): void =>
{
    document.documentElement.style.setProperty('--prp-chrome-icon-tint', (IsValidChromeColor(colour) ? colour : 'transparent'));
}

// Apply a scheme ('' or invalid = default) by overriding the chrome CSS
// variables on the document root. The SCSS fallbacks equal the default
// scheme, so applying the default just re-states them.
export const ApplyUiChrome = (color: string, opacity: number = DEFAULT_CHROME_OPACITY, headerKey: string = DEFAULT_HEADER_KEY): void =>
{
    const base = (IsValidChromeColor(color) ? color : DEFAULT_CHROME_COLOR);
    const { h, s, l } = hexToHsl(base);
    const style = document.documentElement.style;
    // scale every derived alpha by the chosen surface opacity (95 = stock)
    const f = (ClampChromeOpacity(opacity) / 95);
    const a = (v: number) => Math.min(1, v * f);

    style.setProperty('--prp-chrome-95', hsla(h, s, l, a(0.95)));
    style.setProperty('--prp-chrome-92', hsla(h, s, l, a(0.92)));
    style.setProperty('--prp-chrome-hi', hsla(h, s, (l + 2.5), a(0.6)));
    style.setProperty('--prp-chrome-lo', hsla(h, s, (l - 4), a(0.6)));
    style.setProperty('--prp-chrome-hover', hsla(h, s, (l + 6), a(0.95)));
    // pre-blended bevel bands at the SAME alpha as the base surface — the
    // plate/chip gradient vars compose from these (see _chrome.scss)
    style.setProperty('--prp-chrome-solid', hsla(h, s, l, 1));
    style.setProperty('--prp-chrome-band-hi', hsla(h, s, (l + 1.5), a(0.95)));
    style.setProperty('--prp-chrome-band-lo', hsla(h, s, (l - 2.4), a(0.95)));
    // toolbar and side drawer tiles: solid whatever the surface opacity
    style.setProperty('--prp-chrome-tile', hsla(h, s, (l + 2.5), 1));
    style.setProperty('--prp-chrome-tile-hover', hsla(h, s, (l + 6.5), 1));
    style.setProperty('--prp-chrome-tile-down', hsla(h, s, (l - 0.5), 1));

    // pixelrp: windows take the scheme color at full alpha whatever the
    // surface opacity (the .nitro-card block in _chrome.scss); the toolbar,
    // HUD and side drawer above keep the chosen opacity.
    style.setProperty('--prp-window-95', hsla(h, s, l, 1));
    style.setProperty('--prp-window-hover', hsla(h, s, (l + 6), 1));
    style.setProperty('--prp-window-slot', hsla(h, s, (l + 7), 1));
    style.setProperty('--prp-window-band-hi', hsla(h, s, (l + 1.5), 1));
    style.setProperty('--prp-window-band-lo', hsla(h, s, (l - 2.4), 1));

    // Room context menu: lighter header band + the dual-tone item/hover
    // splits (the grad vars in _chrome.scss compose from these).
    style.setProperty('--prp-menu-header', hsla(h, s, (l + 14), a(0.95)));
    style.setProperty('--prp-menu-item-hi', hsla(h, s, (l - 4), a(0.95)));
    style.setProperty('--prp-menu-item-lo', hsla(h, s, (l - 7), a(0.95)));
    style.setProperty('--prp-menu-hover-hi', hsla(h, s, (l + 7), a(0.95)));
    style.setProperty('--prp-menu-hover-lo', hsla(h, s, (l + 4), a(0.95)));

    // Window header duo-tone: set the two stops (+ a border 5% darker than
    // the bottom stop, matching the slim theme's original derivation); the
    // gradient var composes from these automatically. A picked colour is the
    // bottom stop; its top is 18% toward white and its border 8% darker.
    const scheme = HEADER_SCHEMES.find(entry => (entry.key === headerKey));

    if(!scheme && /^#[0-9a-fA-F]{6}$/.test(headerKey))
    {
        const top = mixHex(headerKey, 0.18);

        style.setProperty('--prp-header-top', top);
        style.setProperty('--prp-header-bottom', headerKey);
        style.setProperty('--prp-header-border', mixHex(headerKey, -0.08));
        style.setProperty('--prp-header-face', top);
        style.setProperty('--prp-header-hi', mixHex(top, 0.35));

        return;
    }

    const header = (scheme ?? HEADER_SCHEMES[0]);
    const hb = hexToHsl(header.bottom);
    const face = (header.face ?? header.top);

    style.setProperty('--prp-header-top', header.top);
    style.setProperty('--prp-header-bottom', header.bottom);
    style.setProperty('--prp-header-border', hsla(hb.h, hb.s, (hb.l - 5), 1));
    style.setProperty('--prp-header-face', face);
    style.setProperty('--prp-header-hi', (header.hi ?? mixHex(face, 0.35)));
}
