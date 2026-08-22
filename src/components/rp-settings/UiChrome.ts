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

// Five opacity stops for the chrome surfaces; 95 = the original look. The
// stored value is the SURFACE alpha in percent — every derived alpha (HUD
// chips, bevels, hover) scales by the same factor so the bevel language
// keeps its contrast at any opacity.
export const CHROME_OPACITY_STEPS: number[] = [ 55, 65, 75, 85, 95 ];
export const DEFAULT_CHROME_OPACITY: number = 95;

// Window header duo-tones, from the CMS pixel design system ramps. The
// header keeps Nitro's split two-tone style; only the hues change.
export interface HeaderScheme
{
    key: string;
    name: string;
    top: string;
    bottom: string;
}

export const HEADER_SCHEMES: HeaderScheme[] = [
    { key: 'orange', name: 'Orange', top: '#f0954a', bottom: '#e87332' },
    { key: 'pink', name: 'Pink', top: '#f8558c', bottom: '#e93a7d' },
    { key: 'purple', name: 'Purple', top: '#6d1057', bottom: '#4a0b3d' },
];

export const DEFAULT_HEADER_KEY: string = 'orange';

export const IsValidHeaderKey = (key: string): boolean => HEADER_SCHEMES.some(scheme => (scheme.key === key));

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

// Display color for a scheme's picker swatch: the same vibrant mid-tone the
// drawer icons tint to (hue of the scheme at 45%/55%), so the picker shows
// the hue you'll actually experience instead of eight near-black squares.
// Charcoal (neutral, untinted icons) gets a plain gray.
export const ChromeSwatchColor = (color: string): string =>
{
    if(color === DEFAULT_CHROME_COLOR) return 'hsl(220, 6%, 52%)';

    const { h } = hexToHsl(color);

    return hsla(h, 45, 55, 1);
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
    const f = (Math.min(100, Math.max(40, opacity)) / 95);
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

    // Drawer icon tint: the drawer PNGs are grayscale; each icon carries a
    // masked overlay pseudo-element painted with this color and blended
    // with mix-blend-mode: color — exact hue, original shading preserved
    // (unlike hue-rotate, whose matrix approximation drifts badly on large
    // rotations). Transparent on the default scheme = neutral gray art.
    if(base === DEFAULT_CHROME_COLOR)
    {
        style.setProperty('--prp-chrome-icon-tint', 'transparent');
    }
    else
    {
        style.setProperty('--prp-chrome-icon-tint', hsla(h, 45, 55, 1));
    }

    // Window header duo-tone: set the two stops (+ a border 5% darker than
    // the bottom stop, matching the slim theme's original derivation); the
    // gradient var composes from these automatically.
    const header = (HEADER_SCHEMES.find(scheme => (scheme.key === headerKey)) ?? HEADER_SCHEMES[0]);
    const hb = hexToHsl(header.bottom);

    style.setProperty('--prp-header-top', header.top);
    style.setProperty('--prp-header-bottom', header.bottom);
    style.setProperty('--prp-header-border', hsla(hb.h, hb.s, (hb.l - 5), 1));
}
