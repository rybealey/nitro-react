import { FC, useEffect } from 'react';

// pixelrp: restyles the browser's own title="" tooltip as our hover caption -
// HoverBubble's black bubble - and does nothing else. It shows only where the
// browser would have shown a tooltip, with the same text: the nearest HTML
// element with a title, under a mouse (not touch or pen), no button held. One
// listener for the whole page, mounted once in App, so nothing changes where a
// title is written.
//
// While an element is hovered its title is blanked - a blank title is what
// stops the browser showing its own box, for this element and every title
// further up - and given back when the mouse leaves. Every change the app makes
// to the title meanwhile is followed (removed, blanked, new text), so what is
// given back, and what the caption says, is always the app's current title.
//
// pixelrp (Twist, 2026-10-27, from the lag reports): the bubble is ONE element,
// made once and placed by hand - above its element, centred, below it when
// there is no room above, kept on the screen - with the same classes
// react-bootstrap's Tooltip gave it, so it looks the same and still fades in.
// A new Overlay was mounted for every hover, and its positioning library
// measured the page each time: 100-200 ms before a bubble showed on a laptop.

// how long bootstrap's .fade takes to fade a bubble out, before it is put away
const FADE_MS = 150;
// where the Overlay put it: this far clear of its element, and this far in
// from the edges of the screen
const GAP = 6;
const EDGE = 5;

// The element whose title the browser would show for this node. SVG elements'
// title attributes are not tooltips, and nothing in a frame belongs to us.
const TitledOf = (node: EventTarget): HTMLElement =>
{
    for(let element = ((node instanceof Element) ? node : null); element; element = element.parentElement)
    {
        if(element instanceof HTMLIFrameElement) return null;

        if((element instanceof HTMLElement) && element.hasAttribute('title')) return element;
    }

    return null;
}

export const TitleBubbles: FC<{}> = props =>
{
    useEffect(() =>
    {
        // the hovered element, and its title as the app has it while it is
        // blanked on the element
        let current: HTMLElement = null;
        let held: string = null;
        let watcher: MutationObserver = null;
        let aliveCheck: ReturnType<typeof setInterval> = null;
        let shown = false;
        // put away by a click, key, wheel or scroll until the mouse moves on
        let dismissed = false;

        // the bubble: react-bootstrap's Tooltip markup, made once
        const bubble = document.createElement('div');
        const arrow = document.createElement('div');
        const inner = document.createElement('div');
        let putAway: ReturnType<typeof setTimeout> = null;

        bubble.id = 'prp-title-bubble';
        bubble.setAttribute('role', 'tooltip');
        bubble.className = 'tooltip prp-title-bubble bs-tooltip-top fade';
        bubble.style.cssText = 'position: fixed; left: 0; top: 0; display: none;';
        arrow.className = 'tooltip-arrow';
        inner.className = 'tooltip-inner';
        bubble.append(arrow, inner);
        document.body.appendChild(bubble);

        // The text on it, then where it goes: one look at the element's place
        // and one at the bubble's size, each time it is shown or its text
        // changes. A new element fades in from nothing, as each Overlay did.
        const showBubble = (title: string, fadeIn: boolean) =>
        {
            clearTimeout(putAway);
            putAway = null;

            if(fadeIn) bubble.classList.remove('show');

            inner.textContent = title;
            bubble.style.display = '';

            const place = current.getBoundingClientRect();
            const { width, height } = bubble.getBoundingClientRect();
            const above = ((place.top - GAP - height) >= 0) || ((place.bottom + GAP + height) > window.innerHeight);
            const left = Math.max(EDGE, Math.min((place.left + ((place.width - width) / 2)), (window.innerWidth - width - EDGE)));
            const top = (above ? (place.top - GAP - height) : (place.bottom + GAP));

            bubble.classList.toggle('bs-tooltip-top', above);
            bubble.classList.toggle('bs-tooltip-bottom', !above);
            bubble.style.transform = `translate(${ Math.round(left) }px, ${ Math.round(top) }px)`;
            bubble.classList.add('show');
        }

        const hideBubble = () =>
        {
            if(!shown) return;

            shown = false;
            bubble.classList.remove('show');

            clearTimeout(putAway);
            putAway = setTimeout(() =>
            {
                putAway = null;

                if(!shown) bubble.style.display = 'none';
            }, FADE_MS);
        }

        const release = () =>
        {
            if(!current) return;

            watcher.disconnect();
            watcher = null;
            clearInterval(aliveCheck);
            aliveCheck = null;

            if((held !== null) && (current.getAttribute('title') !== held)) current.setAttribute('title', held);

            current = null;
            held = null;
            hideBubble();
        }

        // the app's title for the current element, just read off it
        const apply = (title: string) =>
        {
            // removed: the browser would now show the next title up
            if(title === null)
            {
                const parent = TitledOf(current.parentElement);

                held = null;
                hold(parent);

                return;
            }

            held = title;

            // blank: the browser shows nothing here, and nothing from further up
            if(!title.trim())
            {
                hideBubble();

                return;
            }

            current.setAttribute('title', '');
            // that write is ours; only the app's changes are wanted
            watcher.takeRecords();

            if(dismissed) return;

            if(shown)
            {
                showBubble(title, false);

                return;
            }

            shown = true;
            showBubble(title, true);
        }

        const hold = (element: HTMLElement) =>
        {
            release();

            if(!element) return;

            current = element;
            dismissed = false;

            watcher = new MutationObserver(() => apply(current.getAttribute('title')));
            watcher.observe(element, { attributes: true, attributeFilter: [ 'title' ] });

            // a window closing under the mouse sends no pointerout
            aliveCheck = setInterval(() =>
            {
                if(current && !current.isConnected) release();
            }, 250);

            apply(element.getAttribute('title'));
        }

        const onPointerOver = (event: PointerEvent) =>
        {
            if(event.pointerType !== 'mouse') return;

            // the browser shows no tooltip mid-drag
            if(event.buttons)
            {
                release();

                return;
            }

            const element = TitledOf(event.target);

            if(element !== current) hold(element);
        }

        // a drag let go over an element: the same as moving onto it
        const onPointerUp = (event: PointerEvent) =>
        {
            if(event.pointerType !== 'mouse') return;

            const element = TitledOf(event.target);

            if(element !== current) hold(element);
        }

        // leaving the page entirely
        const onPointerOut = (event: PointerEvent) =>
        {
            if(event.relatedTarget) return;

            release();
        }

        const onDismiss = () =>
        {
            dismissed = true;
            hideBubble();
        }

        // only a scroll that moves the hovered element - the chat scrolling
        // itself as messages arrive must not take a toolbar bubble away
        const onScroll = (event: Event) =>
        {
            if(!current) return;

            if((event.target === document) || ((event.target instanceof Node) && event.target.contains(current))) onDismiss();
        }

        document.addEventListener('pointerover', onPointerOver, true);
        document.addEventListener('pointerup', onPointerUp, true);
        document.addEventListener('pointerout', onPointerOut, true);
        document.addEventListener('pointerdown', onDismiss, true);
        document.addEventListener('keydown', onDismiss, true);
        document.addEventListener('wheel', onDismiss, { capture: true, passive: true });
        document.addEventListener('scroll', onScroll, true);

        return () =>
        {
            release();

            document.removeEventListener('pointerover', onPointerOver, true);
            document.removeEventListener('pointerup', onPointerUp, true);
            document.removeEventListener('pointerout', onPointerOut, true);
            document.removeEventListener('pointerdown', onDismiss, true);
            document.removeEventListener('keydown', onDismiss, true);
            document.removeEventListener('wheel', onDismiss, true);
            document.removeEventListener('scroll', onScroll, true);

            clearTimeout(putAway);
            bubble.remove();
        }
    }, []);

    return null;
}
