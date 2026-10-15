import { GetConfiguration } from '../nitro';

// PixelRP: every game file is behind the asset pass (parent repo
// docs/asset-protection-plan.md) - cookies the CMS sets when /game loads,
// which nginx checks on each request and which expire after a day. A client
// left open past that would start failing at its next lazy-loaded bundle (a
// new avatar's clothes, a catalog page), so renew it every half hour, far
// inside the TTL. A failed renewal is harmless until the pass actually runs
// out; the next tick tries again.

const REFRESH_MS = (30 * 60 * 1000);

let installed = false;

export const InstallAssetPassRefresh = () =>
{
    if(installed) return;

    installed = true;

    setInterval(() =>
    {
        fetch(GetConfiguration<string>('asset.pass.url', '/game/asset-pass'), { credentials: 'same-origin' }).catch(() => null);
    }, REFRESH_MS);
}
