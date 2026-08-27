import { useCallback, useEffect, useRef } from 'react';

// Singleton loader for Stripe.js, same pattern as the jukebox's YouTube
// IFrame API loader (JukeboxYoutubePlayer.tsx) - one <script> tag for the
// whole session, resolved once and reused by every mount attempt.
let stripeJsPromise: Promise<void> = null;

const loadStripeJs = () =>
{
    if(stripeJsPromise) return stripeJsPromise;

    stripeJsPromise = new Promise<void>((resolve, reject) =>
    {
        if((window as any).Stripe) { resolve(); return; }

        const tag = document.createElement('script');
        tag.src = 'https://js.stripe.com/v3';
        tag.onload = () => resolve();
        tag.onerror = () =>
        {
            // let a later attempt retry instead of caching the failure forever
            stripeJsPromise = null;
            reject(new Error('Couldn\'t load the payment form - try again in a moment.'));
        };
        document.head.appendChild(tag);
    });

    return stripeJsPromise;
}

const AUTH_ERROR_MESSAGE = 'Couldn\'t start checkout - try reloading the hotel.';
const GENERIC_ERROR_MESSAGE = 'Couldn\'t start checkout - try again in a moment.';

interface CheckoutSessionResponse
{
    clientSecret: string;
    publishableKey: string;
}

const createCheckoutSession = async (diamonds: number): Promise<CheckoutSessionResponse> =>
{
    const xsrf = decodeURIComponent((document.cookie.match(/XSRF-TOKEN=([^;]+)/) || [])[1] ?? '');

    const response = await fetch('/diamonds/checkout-session', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'X-XSRF-TOKEN': xsrf },
        body: JSON.stringify({ diamonds })
    });

    if(response.ok) return await response.json();

    // 401/419 mean the session cookie or CSRF token went stale mid-visit -
    // "log in" reads as a website-only instruction from inside the game, so
    // point the player at the fix that actually applies in-game.
    if((response.status === 401) || (response.status === 419)) throw new Error(AUTH_ERROR_MESSAGE);

    let message = GENERIC_ERROR_MESSAGE;

    try
    {
        const data = await response.json();

        if(data && data.message) message = data.message;
    }
    catch(error)
    {
        // no JSON body on this error - fall back to the generic message
    }

    throw new Error(message);
}

export interface UseStripeCheckoutResult
{
    containerRef: React.RefObject<HTMLDivElement>;
    mount: (diamonds: number, onComplete: () => void) => Promise<void>;
    destroy: () => void;
}

// Owns the lifecycle of a single Stripe embedded Checkout instance. Only one
// may exist at a time - initEmbeddedCheckout() itself rejects if a second is
// created while one is live - so mount() no-ops on re-entry and destroy()
// is always safe to call, mounted or not.
export const useStripeCheckout = (): UseStripeCheckoutResult =>
{
    const containerRef = useRef<HTMLDivElement>(null);
    const checkoutRef = useRef<any>(null);
    const mountingRef = useRef(false);

    const destroy = useCallback(() =>
    {
        mountingRef.current = false;

        checkoutRef.current?.destroy?.();
        checkoutRef.current = null;
    }, []);

    const mount = useCallback(async (diamonds: number, onComplete: () => void) =>
    {
        if(mountingRef.current || checkoutRef.current) return;

        mountingRef.current = true;

        try
        {
            const [ session ] = await Promise.all([ createCheckoutSession(diamonds), loadStripeJs() ]);

            const stripeCtor = (window as any).Stripe;

            if(!stripeCtor) throw new Error(GENERIC_ERROR_MESSAGE);

            const stripe = stripeCtor(session.publishableKey);
            const checkout = await stripe.initEmbeddedCheckout({ clientSecret: session.clientSecret, onComplete });

            // destroy()/unmount may have happened while the above awaited -
            // don't mount an instance nobody is showing anymore.
            if(!mountingRef.current || !containerRef.current)
            {
                checkout.destroy?.();
                return;
            }

            checkout.mount(containerRef.current);
            checkoutRef.current = checkout;
        }
        finally
        {
            mountingRef.current = false;
        }
    }, []);

    // belt-and-suspenders unmount cleanup, in addition to the caller's own
    // destroy() on tab-switch/window-close
    useEffect(() => destroy, [ destroy ]);

    return { containerRef, mount, destroy };
}
