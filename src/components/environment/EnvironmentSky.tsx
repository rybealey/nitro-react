import { FC, useEffect, useRef, useState } from 'react';
import { GetNitroInstance, SendMessageComposer } from '../../api';
import { SetWeatherSnapshot, useEnvironmentPrefs, useWeatherSnapshot } from '../../api/environment/EnvironmentStore';
import { RpGetWeatherComposer, RpWeatherEvent } from '../../api/rp-phone/RpWeatherMessages';
import { useMessageEvent } from '../../hooks';
import { ComputeSky, SkyLook } from './SkyModel';

// The space behind rooms. Mounted once at the app root, under everything:
// it paints San Francisco's sky (time from the city's clock, conditions from
// the Weather app's snapshot) where the room canvas used to be black. The
// room canvas is made transparent so the sky shows through; with the
// Environment > Weather switch off this paints plain black instead, so the
// classic look is exactly what it was.

const TICK_MS = 60000;
const CROSSFADE_MS = 2000;

const setCanvasAlpha = (alpha: number) =>
{
    try
    {
        const renderer = GetNitroInstance()?.application?.renderer as unknown as { background?: { alpha: number }, backgroundAlpha?: number };

        if(!renderer) return;

        if(renderer.background) renderer.background.alpha = alpha;
        else if('backgroundAlpha' in renderer) renderer.backgroundAlpha = alpha;
    }
    catch(e)
    {
        // no renderer yet; the next mount tries again
    }
}

// The night sky's stars. Scattered at random once and then kept: this is the
// draw staff picked out of a side-by-side of random skies ("sample 2"), so
// every player sees that sky rather than whatever a fresh roll gives them.
//
// They used to be three small radial-gradient tiles repeated across the
// screen, which reads as a grid within seconds. One SVG over the whole layer
// has nothing to repeat. `slice` scales it uniformly to cover, so stars stay
// round at any window shape; a wide window just crops the top and bottom.
//
// How the draw was made, for a re-roll: 260 stars over 1600x700; y is
// random^1.35 of the height, so they thin towards the horizon; about 1 in 16
// is bright (r 1.3-1.9, opacity .8-1), the rest are pinpricks (r .45 plus
// .75 * random^2, opacity .3-.75). Three groups, dealt in turn, twinkle on
// their own clocks so the sky never pulses as one.
const STAR_FIELD_W = 1600;
const STAR_FIELD_H = 700;
const STAR_GROUPS = 3;

// x, y, radius, opacity - four numbers a star.
const STAR_DATA = [
    216,331.6,.49,.54, 1028.1,182.4,.63,.5, 179,427.1,.46,.44, 101.7,147.9,1.72,.98, 127,376.7,.73,.34, 1061.1,314.8,.45,.44, 154.7,219.9,1.42,.93, 964.4,512.2,.49,.39,
    761.3,443.1,.82,.67, 1244,679.3,.57,.5, 1574.6,149.4,1.08,.5, 1290,530.1,.48,.73, 767.5,572.8,.72,.46, 1304.9,551,.65,.52, 1276.2,596.7,.52,.66, 960.8,255.5,.87,.56,
    537.2,650.4,.98,.66, 769.3,430.4,.63,.59, 1057.8,591.9,.46,.36, 711.6,683.2,.47,.57, 526.1,145.2,.67,.46, 1408.5,293.9,1.02,.73, 562.7,43.7,.48,.43, 1081.2,499.9,.9,.73,
    1078.2,522.4,.45,.3, 134.4,25,.49,.74, 269.3,336,.73,.48, 1568.1,277.4,.83,.68, 529.2,325,.51,.54, 591.1,295.5,1.44,.92, 314.3,594.5,.76,.61, 1345.1,279.2,.68,.5,
    722.6,494.1,.67,.57, 533.8,296.1,.48,.71, 1321.4,167,1.19,.54, 1433.7,238.7,.51,.71, 1290.5,551.9,.51,.46, 454.6,163.9,1.16,.64, 1393.8,501.9,.93,.54, 1424.2,169.7,.51,.63,
    1556.7,234.4,1.89,.89, 169.4,240.7,.85,.53, 483.7,17.2,.87,.62, 1112.4,328.8,.55,.53, 997.7,64.9,.56,.68, 1478,140.1,.63,.36, 1113,498.2,.82,.48, 986,246.1,.47,.33,
    1179.2,627.1,.93,.67, 261.3,547.1,.86,.56, 941,359.8,.45,.49, 716.3,34.9,.59,.47, 45,102.4,.94,.68, 1567.7,59.1,1.14,.5, 1291,2.2,.54,.62, 837.8,278,.45,.57,
    626.7,258.9,.62,.7, 540.8,360.1,.55,.48, 1359.5,5.8,.51,.54, 1535.8,34.9,1.01,.34, 1481.6,47.2,.56,.72, 522.7,75.4,.61,.54, 831.2,44.8,.48,.46, 1533.5,365.4,1.17,.36,
    162,371.6,.61,.37, 259.1,180.4,.9,.39, 145,560.6,.46,.35, 9.3,384.1,.45,.68, 665.8,397.2,1.01,.49, 538.2,382.9,.49,.6, 203.6,33.9,1.39,.95, 484,9.4,.45,.73,
    41.3,92.9,.66,.42, 865.5,221.5,.64,.59, 1117.9,188.8,.6,.44, 792.9,14.2,.46,.42, 455.7,177,.84,.36, 1324,407.1,.64,.6, 1299,42,.49,.56, 149.8,351.6,.45,.3,
    1179.9,391.9,1.33,.85, 1073.1,340.8,.45,.48, 515,15,.45,.55, 708.9,567.7,.63,.46, 262.4,552.1,.95,.52, 1521.7,358,.75,.51, 344.3,306.7,1.07,.52, 806.8,697.1,.57,.31,
    565,405.9,.48,.71, 1229.3,541,.48,.55, 970.7,224.7,.85,.49, 818.2,314.3,.87,.56, 177.1,467.4,.55,.69, 338.3,81,.45,.48, 1405,9.5,.53,.52, 1349.3,197.5,.45,.41,
    1584.7,5.6,.49,.58, 1358.4,262.3,.72,.32, 829.7,10.1,.51,.31, 299,86.3,.45,.59, 1490.2,197.9,.72,.56, 809,189.6,.47,.37, 222.7,354.4,.87,.45, 1176.3,284,.52,.37,
    1547.1,47.7,.5,.58, 340.8,683.4,.46,.44, 357.1,24.2,.54,.45, 95.9,140.5,.95,.31, 954.1,49.4,.63,.56, 517.7,401,.61,.36, 130.9,108.6,.72,.6, 334.8,92.7,.92,.39,
    1400.3,43.8,1.04,.65, 663.4,42.7,.78,.45, 1252.1,63.1,1.19,.34, 598.3,695.9,1.11,.51, 623,251.5,1.11,.68, 318.7,634.8,.49,.35, 1510.7,140.9,.57,.57, 730.2,610.2,.87,.71,
    724.7,232.4,.51,.47, 974.1,541.5,.55,.31, 1438.1,643.7,.81,.36, 906.7,156.4,1.58,.81, 726.6,299.9,.74,.64, 1038.3,125.9,.78,.61, 388.3,551.1,.52,.32, 789.1,661.6,.9,.67,
    257.2,383.9,.53,.38, 470.2,54.3,1.1,.52, 1112.3,386.1,.75,.6, 349.4,638.7,.97,.69, 1386.5,12.7,.59,.56, 29.2,479.8,.63,.42, 270.1,63.4,.45,.57, 1332.8,667.6,.45,.45,
    586.3,84.6,1.56,.97, 1334.8,91.2,.78,.36, 1276.5,424.8,.54,.31, 1127.7,131.6,.53,.42, 261.6,653.8,1.08,.62, 688.3,147.1,1.83,.92, 429.7,37.3,1.64,.96, 205.5,329.4,1.35,.83,
    1293.5,18.8,1.05,.68, 810.3,118.9,.76,.35, 444.9,319,.75,.47, 1313.2,111.4,.47,.72, 449.7,326.9,.86,.36, 1166.6,496.9,.65,.58, 1216.6,585.6,.47,.41, 609.8,531.5,1.05,.43,
    700.5,152,.45,.63, 831.7,151.3,.72,.6, 1002.9,694.7,.64,.52, 479.4,.8,.61,.53, 1576.1,542.3,.88,.58, 1009.6,195.6,1.14,.46, 1534,545.3,1.14,.67, 1204.5,277.2,.48,.31,
    671.9,637.4,.72,.61, 1201.7,488.2,.51,.54, 1441.5,174.5,.85,.35, 1167.4,281.2,.54,.7, 704.3,132.2,.5,.57, 246.2,515.7,.87,.64, 828.8,477.6,.74,.55, 1224.6,366,.46,.49,
    1438.2,579.2,.6,.63, 633.7,614.3,.82,.43, 1365.4,197,.48,.37, 1277.4,152.5,.69,.64, 1585.2,110.6,.55,.49, 1337.8,159.5,.68,.72, 814.3,32.3,.45,.35, 1228.7,222.9,.8,.3,
    1536.8,226.1,.7,.74, 1030.3,194.7,.7,.38, 1187.9,32.6,.68,.54, 1121.7,8,.68,.48, 1142.1,328.9,.65,.39, 675.2,272.1,.45,.57, 1022.1,414.3,1.06,.47, 64.1,11.8,.63,.75,
    96.4,292,1.76,.88, 1572.6,260.8,.73,.43, 1569.5,227.2,.51,.5, 716.9,94.1,.97,.66, 636.8,174.3,.79,.54, 15,186.3,1,.39, 1084.4,376.6,.64,.54, 1331.2,24.2,.48,.63,
    10.5,366.5,.84,.38, 855.1,453.2,.56,.64, 247.5,687.9,.47,.65, 325.2,332.5,.65,.67, 790.3,139.9,.62,.38, 615.3,82.3,.58,.58, 1121.2,217,.58,.35, 477.2,82,.88,.66,
    808.4,500.7,.58,.43, 1273.6,221.9,.8,.48, 1037.8,356.2,.69,.65, 1427.9,175.3,.46,.42, 1552.7,442.3,.45,.51, 696.1,281.8,.71,.53, 1181.7,105.1,.62,.6, 1366.4,263.6,.48,.59,
    971.9,277.9,.45,.56, 196.6,274.2,1.7,1, 187.4,657.5,.51,.42, 895.5,652.7,.71,.42, 65.4,442.4,1.49,.86, 955.8,62,1.15,.74, 262.8,22.1,.77,.68, 1000.5,1,.61,.73,
    234.7,277.6,1.63,.95, 62.6,20.9,1.08,.61, 690.5,294.6,.46,.4, 305.8,503,.76,.57, 611.4,634.4,.5,.7, 532.3,20.3,1.03,.45, 15.6,304.7,1.88,.92, 482.4,46.9,1.18,.73,
    266,459.7,.53,.61, 318.8,31.7,.81,.36, 77.2,404.6,.47,.36, 1267.7,16.7,.46,.41, 1388.6,618.1,.91,.57, 204.8,442.7,.82,.56, 491.7,206.5,.77,.42, 711,52.2,.77,.48,
    504.6,275.7,.46,.46, 1377.8,290.7,.96,.62, 496,306.5,1.48,.91, 1238.3,96.6,.73,.48, 137.5,177.4,.8,.35, 659,201.5,1,.61, 828.4,238.3,1.03,.71, 808.9,583.8,.55,.63,
    373.7,186.9,1.58,.99, 1266.1,517.3,.54,.72, 108,161.1,.65,.57, 881.3,403.3,.93,.36, 1557.1,85.4,1.35,.91, 1297.9,399.5,1.8,.97, 952.7,656.9,.58,.49, 1223.1,332.3,1.18,.53,
    1056.9,139.6,.98,.58, 794,63.3,.66,.75, 366.2,206.1,1.77,1, 597.8,586.8,.46,.62, 1338.3,523.8,.46,.54, 6.4,305.1,1.06,.55, 1247.1,67.4,.45,.73, 296.9,66.8,1.14,.63,
    279.1,348.9,.74,.36, 1204.2,9.1,.6,.4, 1020.5,86.4,.75,.46, 1272.5,633.5,.46,.57
];

type Star = { x: number, y: number, r: number, o: number };

const STARS: Star[][] = (() =>
{
    const groups: Star[][] = Array.from({ length: STAR_GROUPS }, () => []);

    for(let i = 0; i < STAR_DATA.length; i += 4)
    {
        groups[(i / 4) % STAR_GROUPS].push({ x: STAR_DATA[i], y: STAR_DATA[i + 1], r: STAR_DATA[i + 2], o: STAR_DATA[i + 3] });
    }

    return groups;
})();

const StarField: FC<{ opacity: number }> = ({ opacity }) => (
    <svg className="env-sky-stars" style={ { opacity } } viewBox={ `0 0 ${ STAR_FIELD_W } ${ STAR_FIELD_H }` } preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        { STARS.map((group, index) =>
            <g key={ index } className={ `env-sky-star-group is-${ index }` }>
                { group.map((star, starIndex) => <circle key={ starIndex } cx={ star.x } cy={ star.y } r={ star.r } fill="#fff" fillOpacity={ star.o } />) }
            </g>) }
    </svg>
);

const SkyLayers: FC<{ look: SkyLook, className?: string }> = ({ look, className = '' }) => (
    <div className={ `env-sky-layer${ className ? (' ' + className) : '' }` } style={ { background: look.gradient } }>
        <div className="env-sky-horizon" style={ { background: look.horizon } } />
        { look.fog &&
            <>
                <div className="env-sky-fog is-a" />
                <div className="env-sky-fog is-b" />
            </> }
        { look.stars && <StarField opacity={ (1 - (look.daylight / .3)) } /> }
        <div className="env-sky-vignette" />
    </div>
);

// Shared by the full-screen sky and the Settings preview: the current look,
// plus the previous condition's layer for a couple of seconds so a change of
// weather crossfades instead of cutting.
export const useSkyLooks = (): { look: SkyLook, previous: SkyLook } =>
{
    const snapshot = useWeatherSnapshot();
    const [ now, setNow ] = useState(() => Date.now());
    const [ previous, setPrevious ] = useState<SkyLook>(null);
    const lastKind = useRef<string>(null);
    const lastLook = useRef<SkyLook>(null);

    useEffect(() =>
    {
        const interval = window.setInterval(() => setNow(Date.now()), TICK_MS);

        return () => window.clearInterval(interval);
    }, []);

    const look = ComputeSky(snapshot, now);

    useEffect(() =>
    {
        if((lastKind.current !== null) && (lastKind.current !== look.kind) && lastLook.current)
        {
            setPrevious(lastLook.current);

            const timeout = window.setTimeout(() => setPrevious(null), CROSSFADE_MS);

            lastKind.current = look.kind;
            lastLook.current = look;

            return () => window.clearTimeout(timeout);
        }

        lastKind.current = look.kind;
        lastLook.current = look;
    }, [ look.kind ]);

    lastLook.current = look;

    return { look, previous };
}

export const EnvironmentSky: FC<{}> = props =>
{
    const { weatherOn } = useEnvironmentPrefs();
    const { look, previous } = useSkyLooks();

    // the sky is only useful if the room canvas lets it through
    useEffect(() =>
    {
        setCanvasAlpha(0);

        const retry = window.setTimeout(() => setCanvasAlpha(0), 1500);

        SendMessageComposer(new RpGetWeatherComposer());

        return () =>
        {
            window.clearTimeout(retry);
            setCanvasAlpha(1);
        }
    }, []);

    // one root listener feeds the store; the phone's Weather app reads the same packet
    useMessageEvent<RpWeatherEvent>(RpWeatherEvent, event =>
    {
        const parser = event.getParser();

        if(parser.snapshot) SetWeatherSnapshot(parser.snapshot);
    });

    if(!weatherOn) return <div className="env-sky is-off" />;

    return (
        <div className="env-sky">
            { previous && <SkyLayers key={ `prev-${ previous.kind }` } look={ previous } className="is-fading" /> }
            <SkyLayers key={ look.kind } look={ look } className="is-current" />
        </div>
    );
}

// The Settings page's thumbnail of the sky right now.
export const EnvironmentSkyPreview: FC<{ dimmed?: boolean }> = ({ dimmed = false }) =>
{
    const { look } = useSkyLooks();

    return (
        <div className={ `env-sky-preview${ dimmed ? ' is-dimmed' : '' }` }>
            <SkyLayers look={ look } className="is-current" />
            <div className="env-sky-preview-room">
                <div className="env-sky-preview-wall is-left" />
                <div className="env-sky-preview-wall is-right" />
                <div className="env-sky-preview-floor" />
            </div>
        </div>
    );
}
