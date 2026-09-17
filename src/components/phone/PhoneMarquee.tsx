import { FC, useEffect, useRef, useState } from 'react';

// A line of text that scrolls itself when it does not fit, and sits still when
// it does.
//
// MEASURED, not assumed. Animating every title would set short ones drifting
// for no reason, which reads as a fault rather than a feature - so the text is
// compared against its box and only moves when it is genuinely wider. Remeasured
// when the text changes and when the box resizes, because the phone's
// accessibility text size can change either at any moment.
//
// The duplicate copy is what makes the loop seamless: both halves slide by
// exactly their own width, so as the first leaves the second arrives where it
// started and there is no gap to jump. It is aria-hidden - a screen reader
// should hear the title once.
//
// The caller's own class goes on the WRAPPER, because the classes this replaces
// (phone-music-title and friends) already carry nowrap and overflow hidden,
// which is what the wrapper needs anyway.
export const PhoneMarquee: FC<{ text: string, className?: string }> = props =>
{
    const { text = '', className = '' } = props;
    const wrapRef = useRef<HTMLDivElement>(null);
    const textRef = useRef<HTMLSpanElement>(null);
    const [ scroll, setScroll ] = useState(0);

    useEffect(() =>
    {
        const wrap = wrapRef.current;
        const inner = textRef.current;

        if(!wrap || !inner) return;

        const measure = () =>
        {
            const width = inner.scrollWidth;
            const room = wrap.clientWidth;

            // a pixel of slack: a title that fits exactly should not crawl
            setScroll(((width > (room + 1)) && room) ? width : 0);
        };

        measure();

        if(typeof ResizeObserver === 'undefined') return;

        const observer = new ResizeObserver(measure);

        observer.observe(wrap);

        return () => observer.disconnect();
    }, [ text ]);

    // Paced by distance rather than a fixed duration, so a title twice as long
    // takes twice as long rather than moving twice as fast.
    const style = (scroll ? { '--marquee-duration': `${ Math.max(6, Math.round(scroll / 28)) }s` } as any : undefined);

    return (
        <div ref={ wrapRef } className={ `phone-marquee${ scroll ? ' is-scrolling' : '' }${ className ? ` ${ className }` : '' }` } style={ style } title={ text }>
            <span ref={ textRef } className="phone-marquee-text">{ text }</span>
            { !!scroll && <span className="phone-marquee-text" aria-hidden="true">{ text }</span> }
        </div>
    );
}
