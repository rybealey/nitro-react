// Hue, saturation and brightness for the color pickers (Settings > UI and
// Change Your Outfit): the shade square is s across and v up, the slider h.

export interface Hsv { h: number, s: number, v: number }

const hexToRgb = (hex: string): number[] => [ parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16) ];

const rgbToHex = (r: number, g: number, b: number): string => ('#' + [ r, g, b ].map(value => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, '0')).join(''));

const rgbToHsv = (r: number, g: number, b: number): Hsv =>
{
    const rn = (r / 255);
    const gn = (g / 255);
    const bn = (b / 255);
    const max = Math.max(rn, gn, bn);
    const d = (max - Math.min(rn, gn, bn));

    let h = 0;

    if(d)
    {
        if(max === rn) h = (((gn - bn) / d) % 6);
        else if(max === gn) h = (((bn - rn) / d) + 2);
        else h = (((rn - gn) / d) + 4);

        h *= 60;

        if(h < 0) h += 360;
    }

    return { h, s: (max ? (d / max) : 0), v: max };
}

export const HsvToHex = ({ h, s, v }: Hsv): string =>
{
    const c = (v * s);
    const x = (c * (1 - Math.abs(((h / 60) % 2) - 1)));
    const m = (v - c);

    let rgb = [ c, 0, x ];

    if(h < 60) rgb = [ c, x, 0 ];
    else if(h < 120) rgb = [ x, c, 0 ];
    else if(h < 180) rgb = [ 0, c, x ];
    else if(h < 240) rgb = [ 0, x, c ];
    else if(h < 300) rgb = [ x, 0, c ];

    return rgbToHex(((rgb[0] + m) * 255), ((rgb[1] + m) * 255), ((rgb[2] + m) * 255));
}

// A grey or black has no hue of its own; keep the slider where it was.
export const HexToHsv = (hex: string, previous: Hsv = null): Hsv =>
{
    const hsv = rgbToHsv(...(hexToRgb(hex) as [ number, number, number ]));

    if(previous && ((hsv.s === 0) || (hsv.v === 0))) hsv.h = previous.h;

    return hsv;
}

export const IsHexColor = (value: unknown): value is string => ((typeof value === 'string') && /^#[0-9a-fA-F]{6}$/.test(value));
