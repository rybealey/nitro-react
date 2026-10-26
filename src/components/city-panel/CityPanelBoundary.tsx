import { ErrorInfo, FC, ReactNode } from 'react';
import { ReportClientCrash } from '../../api/diagnostics/RpLagRecorder';
import { ErrorBoundary } from '../../common';

// pixelrp: one City Panel tab or Economy view, held by an ErrorBoundary. A
// crash in it shows here with its message instead of turning the whole game
// black, goes to the console, and is written to the emulator's log on the lag
// report's line (staff clients - and only staff open this panel). Switching
// to another tab or view clears it.

const describe = (where: string, error: Error, info: ErrorInfo) =>
{
    const stack = (error?.stack ?? '').split('\n').slice(0, 4).map(line => line.trim()).join(' ; ');
    const components = (info?.componentStack ?? '').split('\n').map(line => line.trim()).filter(Boolean).slice(0, 6).join(' < ');

    return `City Panel ${ where } | ${ error?.name }: ${ error?.message } | ${ stack } | ${ components }`;
}

export const CityPanelBoundary: FC<{ where: string, children?: ReactNode }> = props =>
{
    const { where, children } = props;

    return (
        <ErrorBoundary resetKey={ where }
            onError={ (error, info) =>
            {
                console.error(`City Panel ${ where } crashed`, error, info?.componentStack);
                ReportClientCrash(describe(where, error, info));
            } }
            fallback={ (error, reset) =>
                <div className="city-crash" role="alert">
                    <b>{ where } ran into an error.</b>
                    <span className="city-mono">{ error.message || error.name }</span>
                    <button type="button" className="mt-chrome" onClick={ reset }>Try again</button>
                </div> }>
            { children }
        </ErrorBoundary>
    );
}
