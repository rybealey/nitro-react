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

const SkyLayers: FC<{ look: SkyLook, className?: string }> = ({ look, className = '' }) => (
    <div className={ `env-sky-layer${ className ? (' ' + className) : '' }` } style={ { background: look.gradient } }>
        <div className="env-sky-horizon" style={ { background: look.horizon } } />
        { look.fog &&
            <>
                <div className="env-sky-fog is-a" />
                <div className="env-sky-fog is-b" />
            </> }
        { look.rain && <div className="env-sky-rain" /> }
        { look.stars && <div className="env-sky-stars" style={ { opacity: (1 - (look.daylight / .3)) } } /> }
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
