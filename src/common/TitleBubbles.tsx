import { FC, useEffect, useState } from 'react';
import { Overlay, Tooltip } from 'react-bootstrap';

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
    const [ target, setTarget ] = useState<HTMLElement>(null);
    const [ text, setText ] = useState('');
    const [ version, setVersion ] = useState(0);

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

        const hideBubble = () =>
        {
            if(!shown) return;

            shown = false;
            setTarget(null);
            setText('');
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
                setText(title);

                return;
            }

            shown = true;
            setTarget(current);
            setText(title);
            setVersion(value => (value + 1));
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
        }
    }, []);

    return (
        <Overlay key={ version } target={ target } show={ !!target && !!text } placement="top" flip>
            <Tooltip id="prp-title-bubble" className="prp-title-bubble">{ text }</Tooltip>
        </Overlay>
    );
}
