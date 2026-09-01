import { useCallback } from 'react';

// Crypto purchases use a Stripe-HOSTED Checkout page opened in a new browser
// tab, rather than the embedded form the card flow uses (useStripeCheckout).
// Crypto is redirect-based and the game runs inside an iframe, so the embedded
// checkout can't redirect out to crypto.stripe.com cleanly - a top-level tab
// sidesteps that. Delivery is unchanged: the same webhook credits the order.

const AUTH_ERROR_MESSAGE = 'Couldn\'t start checkout - try reloading the hotel.';
const GENERIC_ERROR_MESSAGE = 'Couldn\'t start crypto checkout - try again in a moment.';
const POPUP_BLOCKED_MESSAGE = 'Allow pop-ups for this site, then tap "Pay with crypto" again.';

interface CryptoCheckoutSessionResponse
{
    url: string;
}

const createCryptoCheckoutSession = async (diamonds: number): Promise<CryptoCheckoutSessionResponse> =>
{
    const xsrf = decodeURIComponent((document.cookie.match(/XSRF-TOKEN=([^;]+)/) || [])[1] ?? '');

    const response = await fetch('/diamonds/crypto-checkout-session', {
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

export interface UseCryptoCheckoutResult
{
    launch: (diamonds: number) => Promise<void>;
}

export const useCryptoCheckout = (): UseCryptoCheckoutResult =>
{
    const launch = useCallback(async (diamonds: number) =>
    {
        // Open the tab SYNCHRONOUSLY, before the first await, so the browser
        // still treats it as part of the click gesture and doesn't block it.
        // The session URL is filled in once the server responds.
        const tab = window.open('', '_blank');

        if(!tab) throw new Error(POPUP_BLOCKED_MESSAGE);

        // A brief placeholder so the tab isn't a blank white page while the
        // Checkout Session is created (best effort - never fail the launch on
        // a write that some browser disallows).
        try
        {
            tab.document.write('<title>Opening crypto checkout...</title><body style="margin:0;display:flex;align-items:center;justify-content:center;height:100vh;font-family:system-ui,sans-serif;background:#14122b;color:#f4f2ff">Opening secure crypto checkout...</body>');
            tab.document.close();
        }
        catch(error)
        {
            // ignore - the tab still navigates below
        }

        try
        {
            const { url } = await createCryptoCheckoutSession(diamonds);

            // replace() so the tab's back button doesn't land on about:blank.
            tab.location.replace(url);
        }
        catch(error)
        {
            tab.close();

            throw error;
        }
    }, []);

    return { launch };
}
