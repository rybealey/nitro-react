import { FC, ReactNode, useEffect, useRef, useState } from 'react';
import { DeployChangelog, DeployStatus, GetDeployStatus } from '../../api';

const POLL_INTERVAL_MS = 4000;

// Mirrors the Claude Design simulation: step text by progress threshold,
// used only by the ?deploy-preview= dev hook (real runs report their step).
const PREVIEW_STEPS: [ number, string ][] = [
    [ 20, 'Backing up city data…' ],
    [ 45, 'Uploading new assets…' ],
    [ 70, 'Applying database patches…' ],
    [ 90, 'Restarting districts…' ],
    [ 100, 'Polishing pixels…' ],
];

const PREVIEW_CHANGELOG: DeployChangelog = {
    date: '2026-08-09',
    title: 'Preview',
    sections: [
        { category: 'Added', entries: [
            'Corporation HQs — claim an office and customize it with your corp',
            'Turf map overlay in the city HUD — see who holds every block',
            '6 new furni sets for terrace and rooftop rooms',
        ] },
        { category: 'Fixed', entries: [
            'Gang invites no longer fail after a display-name change',
            'Chat bubbles no longer clip on small screens',
            'Police cuff animation plays at the correct speed',
        ] },
        { category: 'Changed', entries: [
            'Turf capture timer: 90s → 75s',
            'Paycheck cooldown reduced for new citizens',
        ] },
    ],
};

const BADGES: Record<string, { label: string, tone: string }> = {
    'Added': { label: 'New', tone: 'success' },
    'Fixed': { label: 'Fixes', tone: 'info' },
    'Changed': { label: 'Changed', tone: 'warning' },
    'Known issues': { label: 'Known issues', tone: 'danger' },
};

const getPreviewStatus = (value: string): DeployStatus =>
{
    if(value === 'done') return { status: 'done', progress: 100, step: null, etaSeconds: null, changelog: PREVIEW_CHANGELOG };

    const pct = Math.max(0, Math.min(100, (parseInt(value) || 0)));
    const step = (PREVIEW_STEPS.find(([ threshold ]) => (pct < threshold)) || PREVIEW_STEPS[PREVIEW_STEPS.length - 1])[1];

    return { status: 'deploying', progress: pct, step, etaSeconds: (Math.max(1, Math.ceil((100 - pct) / 12)) * 60), changelog: PREVIEW_CHANGELOG };
}

// The design system's ProgressBar: 20 cells, 5% each, in a sunken plum track.
const DeployProgressBar: FC<{ label: string, value: number }> = props =>
{
    const { label = null, value = 0 } = props;
    const pct = Math.max(0, Math.min(100, value));
    const cells = Math.round(pct / 5);

    return (
        <div className="deploy-progress">
            <div className="deploy-progress-label">
                <span>{ label }</span>
                <span>{ Math.round(pct) }%</span>
            </div>
            <div className="deploy-progress-track">
                { Array.from({ length: 20 }, (_, i) => <span key={ i } className={ (i < cells) ? 'is-filled' : '' } />) }
            </div>
        </div>
    );
}

// Renders a changelog entry's inline markdown (bold lead-ins, `code`).
const renderEntry = (text: string): ReactNode[] =>
{
    return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, index) =>
    {
        if(part.startsWith('**') && part.endsWith('**')) return <strong key={ index }>{ part.slice(2, -2) }</strong>;

        if(part.startsWith('`') && part.endsWith('`')) return <code key={ index }>{ part.slice(1, -1) }</code>;

        return part;
    });
}

// The client runs in an iframe whose URL carries a single-use SSO ticket —
// the emulator consumes it at login, so reloading the iframe replays a dead
// ticket, fails the handshake, and lands right back on this screen. Reload
// the outer CMS page instead: it mints a fresh ticket on every render.
const reconnect = () =>
{
    try
    {
        if(window.top && (window.top !== window.self))
        {
            window.top.location.reload();

            return;
        }
    }
    catch
    {
        // Cross-origin parent we cannot reach — a plain reload is all we have.
    }

    window.location.reload();
}

interface DeploymentViewProps
{
    onFallback: () => void;
}

export const DeploymentView: FC<DeploymentViewProps> = props =>
{
    const { onFallback = null } = props;
    const [ status, setStatus ] = useState<DeployStatus>(null);
    const sawDeployRef = useRef(false);

    const previewValue = ((): string =>
    {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if(!(import.meta as any).env?.DEV) return null;

        return new URLSearchParams(window.location.search).get('deploy-preview');
    })();

    useEffect(() =>
    {
        if(previewValue !== null)
        {
            setStatus(getPreviewStatus(previewValue));

            return;
        }

        let disposed = false;

        const poll = async () =>
        {
            const next = await GetDeployStatus();

            if(disposed || !next) return;

            if((next.status === 'deploying') || (next.status === 'done')) sawDeployRef.current = true;

            if(next.status === 'failed')
            {
                // A dead deploy would leave the bar lying — hand back to the
                // classic disconnect overlay.
                onFallback && onFallback();

                return;
            }

            if((next.status === 'idle') && sawDeployRef.current)
            {
                // The run finished and aged out of the API's window while we
                // were watching — the hotel is back.
                setStatus(prev => ({ ...(prev || next), status: 'done', progress: 100 }));

                return;
            }

            if(next.status !== 'idle') setStatus(next);
        }

        poll();

        const interval = setInterval(poll, POLL_INTERVAL_MS);

        return () =>
        {
            disposed = true;
            clearInterval(interval);
        }
    }, [ previewValue, onFallback ]);

    const isDone = (status && (status.status === 'done'));
    const progress = (status ? status.progress : 0);
    const etaMinutes = Math.max(1, Math.ceil(((status && status.etaSeconds) || 60) / 60));
    const changelog = (status && status.changelog);

    return (
        <div className="nitro-deployment">
            <div className="deploy-content">
                <img className="deploy-logo" src={ new URL('../../assets/images/deployment/logo-animated.gif', import.meta.url).href } alt="PIXELRP" />
                <div className="deploy-status-card">
                    <div className="deploy-status-heading">
                        <span className="deploy-status-dot" />
                        <span>{ isDone ? 'Update deployed' : 'Update in progress' }</span>
                    </div>
                    <DeployProgressBar label={ isDone ? 'Ready!' : 'Deploying update' } value={ progress } />
                    { !isDone &&
                        <div className="deploy-step-row">
                            <span className="deploy-step-text">{ (status && status.step) || 'Backing up city data…' }</span>
                            <span className="deploy-step-eta">est. ~{ etaMinutes } min</span>
                        </div> }
                    { isDone &&
                        <div className="deploy-done-row">
                            <span>All districts back online. See you in the city!</span>
                            <button className="deploy-reconnect" onClick={ reconnect }>▶ Reconnect</button>
                        </div> }
                </div>
                { changelog &&
                    <div className="deploy-notes-card">
                        <div className="deploy-notes-header">
                            <span className="deploy-notes-title">PATCH NOTES</span>
                            <span className="deploy-notes-version">{ changelog.date }</span>
                        </div>
                        <div className="deploy-notes-body">
                            { changelog.sections.map(section =>
                            {
                                const badge = (BADGES[section.category] || { label: section.category, tone: 'info' });

                                return (
                                    <div key={ section.category } className="deploy-notes-section">
                                        <div><span className={ `deploy-badge deploy-badge--${ badge.tone }` }>{ badge.label }</span></div>
                                        { section.entries.map((entry, index) =>
                                            <div key={ index } className="deploy-notes-entry">
                                                <span className="deploy-notes-marker">▶</span>
                                                <span className="deploy-notes-text">{ renderEntry(entry) }</span>
                                            </div>) }
                                    </div>
                                );
                            }) }
                        </div>
                    </div> }
                <div className="deploy-footer">Your progress is safe — you&apos;ll reconnect right where you left off.</div>
            </div>
            <div className="deploy-bottom-strip" />
        </div>
    );
}
