import { CreateLinkEvent } from '../nitro';

// pixelrp: opening Sitch on somebody's profile from outside the phone - the
// profile window's @ button. The same idea as the music app's open target: the
// id waits here until Sitch takes it, on opening, or straight away when Sitch
// is already the screen showing. Taken once, so Sitch opens on its own feed
// every other time.
let pendingUserId = 0;
const listeners: Set<() => void> = new Set();

export const OpenSitchProfile = (userId: number) =>
{
    if(userId <= 0) return;

    pendingUserId = userId;

    listeners.forEach(listener => listener());

    CreateLinkEvent('phone/sitch');
}

export const TakeSitchProfile = (): number =>
{
    const userId = pendingUserId;

    pendingUserId = 0;

    return userId;
}

export const SubscribeSitchProfile = (listener: () => void): (() => void) =>
{
    listeners.add(listener);

    return () =>
    {
        listeners.delete(listener);
    }
}
