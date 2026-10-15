import { GetConfiguration } from '../nitro';

// PixelRP: every game file is behind the asset pass (parent repo
// docs/asset-protection-plan.md) - cookies the CMS sets when /game loads,
// which nginx checks on each request and which expire after a day. A client
// left open past that would start failing at its next lazy-loaded bundle (a
// new avatar's clothes, a catalog page), so renew it every half hour, far
// inside the TTL. A failed renewal is harmless until the pass actually runs
// out; the next tick tries again.
//
// The half hour is measured on the wall clock, checked once a minute, rather
// than by a 30-minute timer: a timer does not run while the computer sleeps,
// so after a long sleep the pass could have run out with the next renewal
// still most of a timer away. Coming back to the tab, or back online, renews
// straight away if the last renewal is more than a few minutes old.
//
// Only a real renewal counts. The endpoint answers 204 with fresh cookies;
// once the website login has ended it redirects to the login page instead,
// which a fetch follows to a plain 200 - so a redirected answer is a failure
// and is tried again (at most every few minutes, so a lapsed login is not
// asked once a minute for good).

const RENEW_EVERY_MS = (30 * 60 * 1000);
const CHECK_EVERY_MS = (60 * 1000);
const WAKE_RENEW_AFTER_MS = (5 * 60 * 1000);
const RETRY_AFTER_MS = (5 * 60 * 1000);

let installed = false;
let lastRenewed = 0;
let lastAttempt = 0;

const renewIfOlderThan = (ageMs: number) =>
{
    const now = Date.now();

    if((now - lastRenewed) < ageMs) return;

    if((now - lastAttempt) < RETRY_AFTER_MS) return;

    lastAttempt = now;

    fetch(GetConfiguration<string>('asset.pass.url', '/game/asset-pass'), { credentials: 'same-origin' })
        .then(response =>
        {
            if(response.ok && !response.redirected) lastRenewed = Date.now();
        })
        .catch(() => null);
}

export const InstallAssetPassRefresh = () =>
{
    if(installed) return;

    installed = true;

    // The pass was issued with /game moments ago.
    lastRenewed = Date.now();

    setInterval(() => renewIfOlderThan(RENEW_EVERY_MS), CHECK_EVERY_MS);

    document.addEventListener('visibilitychange', () =>
    {
        if(document.visibilityState === 'visible') renewIfOlderThan(WAKE_RENEW_AFTER_MS);
    });

    window.addEventListener('online', () => renewIfOlderThan(WAKE_RENEW_AFTER_MS));
}
