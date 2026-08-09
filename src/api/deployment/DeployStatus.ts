export interface DeployChangelogSection
{
    category: string;
    entries: string[];
}

export interface DeployChangelog
{
    date: string;
    title: string;
    sections: DeployChangelogSection[];
}

export interface DeployStatus
{
    status: 'idle' | 'deploying' | 'done' | 'failed';
    progress: number;
    step: string | null;
    etaSeconds: number | null;
    changelog: DeployChangelog | null;
}
