import { FC } from 'react';

// PixelRP jury trials: the gold scale on the jury cards (design: "Jury Request
// Panel" canvas, Twist 2026-10-19), drawn one character a pixel: K outline,
// H highlight, G gold, S shade, C chain. Lit from the top left, like the
// hotel's own sprites. 21 x 19, shown at 1x.
const SCALE_PIXELS = [
    '.........KKK.........',
    '........KHGSK........',
    '........KGGSK........',
    '.KKKKKKKKGGSKKKKKKKK.',
    '.KHHHGGGGGGGGGGGGGGK.',
    '.KSSSSSSSSSSSSSSSSSK.',
    '.KKKKKKKKKGKKKKKKKKK.',
    '...C.....KGK.....C...',
    '..C.C....KGK....C.C..',
    '.C...C...KGK...C...C.',
    'C.....C..KGK..C.....C',
    'KKKKKKK..KGK..KKKKKKK',
    'KHGGGSK..KGK..KHGGGSK',
    '.KGGSK...KGK...KGGSK.',
    '..KKK....KGK....KKK..',
    '.........KGK.........',
    '......KKKKGKKKK......',
    '.....KHGGGGGGGSK.....',
    '.....KKKKKKKKKKK.....'
];

const SCALE_COLOURS: Record<string, string> = { K: '#3a2608', H: '#ffe596', G: '#f0b43c', S: '#c27c18', C: '#d79a2e' };

// Each row's runs of one colour, worked out once.
const SCALE_RUNS: { x: number, y: number, width: number, fill: string }[] = [];

SCALE_PIXELS.forEach((row, y) =>
{
    for(let x = 0; x < row.length;)
    {
        let width = 1;

        while(row[x + width] === row[x]) width++;

        if(row[x] !== '.') SCALE_RUNS.push({ x, y, width, fill: SCALE_COLOURS[row[x]] });

        x += width;
    }
});

export const PixelScaleIcon: FC<{}> = () => (
    <svg width="21" height="19" viewBox="0 0 21 19" shapeRendering="crispEdges" aria-hidden="true">
        { SCALE_RUNS.map(run => <rect key={ `${ run.x }-${ run.y }` } x={ run.x } y={ run.y } width={ run.width } height={ 1 } fill={ run.fill } />) }
    </svg>
);
