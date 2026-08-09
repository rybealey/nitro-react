import { GetConfiguration } from '../nitro';
import { DeployStatus } from './DeployStatus';

export const GetDeployStatus = async (): Promise<DeployStatus> =>
{
    try
    {
        const response = await fetch(GetConfiguration<string>('deployment.status.url', '/api/deploy-status'));

        if(!response.ok) return null;

        const json = await response.json();
        const data = json?.data;

        if(!data || (typeof data.status !== 'string')) return null;

        return data as DeployStatus;
    }
    catch
    {
        return null;
    }
}
