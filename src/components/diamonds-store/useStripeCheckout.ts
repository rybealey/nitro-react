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

// Owns the lifecycle of a single Stripe embedded Checkout instance. Each
// mount() call builds its own Stripe object, so initEmbeddedCheckout()'s
// own single-instance guard is per-call and doesn't protect against two
// overlapping mount() calls - a generationRef token is what actually
// enforces "only the latest call's instance survives": every await in
// mount() rechecks its captured generation against the current one, and
// destroy() bumps the generation so any in-flight call is superseded too.
export const useStripeCheckout = (): UseStripeCheckoutResult =>
{
    const containerRef = useRef<HTMLDivElement>(null);
    const checkoutRef = useRef<any>(null);
    const generationRef = useRef(0);

    const destroy = useCallback(() =>
    {
        generationRef.current++;

        checkoutRef.current?.destroy?.();
        checkoutRef.current = null;
    }, []);

    const mount = useCallback(async (diamonds: number, onComplete: () => void) =>
    {
        if(checkoutRef.current) return;

        const generation = ++generationRef.current;

        const [ session ] = await Promise.all([ createCheckoutSession(diamonds), loadStripeJs() ]);

        // superseded (destroy()/another mount() ran) while the fetch + script
        // load were in flight - this call hasn't created anything yet, so
        // there's nothing of its own to clean up.
        if(generationRef.current !== generation) return;

        const stripeCtor = (window as any).Stripe;

        if(!stripeCtor) throw new Error(GENERIC_ERROR_MESSAGE);

        const stripe = stripeCtor(session.publishableKey);
        const checkout = await stripe.initEmbeddedCheckout({ clientSecret: session.clientSecret, onComplete });

        // superseded while awaiting initEmbeddedCheckout() - this call did
        // create an instance, so destroy that local instance directly
        // (never the shared ref, which may already belong to the call that
        // won) and never touch checkoutRef.
        if((generationRef.current !== generation) || !containerRef.current)
        {
            checkout.destroy?.();
            return;
        }

        checkout.mount(containerRef.current);
        checkoutRef.current = checkout;
    }, []);

    // belt-and-suspenders unmount cleanup, in addition to the caller's own
    // destroy() on tab-switch/window-close
    useEffect(() => destroy, [ destroy ]);

    return { containerRef, mount, destroy };
}
