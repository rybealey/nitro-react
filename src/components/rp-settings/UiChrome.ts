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

// Apply a scheme ('' or invalid = default) by overriding the chrome CSS
// variables on the document root. The SCSS fallbacks equal the default
// scheme, so applying the default just re-states them.
export const ApplyUiChrome = (color: string): void =>
{
    const base = (IsValidChromeColor(color) ? color : DEFAULT_CHROME_COLOR);
    const { h, s, l } = hexToHsl(base);
    const style = document.documentElement.style;

    style.setProperty('--prp-chrome-95', hsla(h, s, l, 0.95));
    style.setProperty('--prp-chrome-92', hsla(h, s, l, 0.92));
    style.setProperty('--prp-chrome-hi', hsla(h, s, (l + 2.5), 0.6));
    style.setProperty('--prp-chrome-lo', hsla(h, s, (l - 4), 0.6));
    style.setProperty('--prp-chrome-hover', hsla(h, s, (l + 6), 0.95));
}
