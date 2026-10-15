import { FC, KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent, useEffect, useRef, useState } from 'react';
import { SAVED_COLOURS_MAX, SetSavedColours, useHudPrefs } from '../../api/prefs/HudPrefsStore';

// Settings > UI > Colours: the picker that opens beside a colour chip
// (Settings canvas, board O). Top to bottom: the colour, the saved colours
// with + / - and the hex field on one row, the shade square, the hue slider.
// Every change is live; the page decides how often to save it.

interface Hsv { h: number, s: number, v: number }

const hexToRgb = (hex: string): number[] => [ parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16) ];

const rgbToHex = (r: number, g: number, b: number): string => ('#' + [ r, g, b ].map(value => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, '0')).join(''));

const rgbToHsv = (r: number, g: number, b: number): Hsv =>
{
    const rn = (r / 255);
    const gn = (g / 255);
    const bn = (b / 255);
    const max = Math.max(rn, gn, bn);
    const d = (max - Math.min(rn, gn, bn));

    let h = 0;

    if(d)
    {
        if(max === rn) h = (((gn - bn) / d) % 6);
        else if(max === gn) h = (((bn - rn) / d) + 2);
        else h = (((rn - gn) / d) + 4);

        h *= 60;

        if(h < 0) h += 360;
    }

    return { h, s: (max ? (d / max) : 0), v: max };
}

const hsvToHex = ({ h, s, v }: Hsv): string =>
{
    const c = (v * s);
    const x = (c * (1 - Math.abs(((h / 60) % 2) - 1)));
    const m = (v - c);

    let rgb = [ c, 0, x ];

    if(h < 60) rgb = [ c, x, 0 ];
    else if(h < 120) rgb = [ x, c, 0 ];
    else if(h < 180) rgb = [ 0, c, x ];
    else if(h < 240) rgb = [ 0, x, c ];
    else if(h < 300) rgb = [ x, 0, c ];

    return rgbToHex(((rgb[0] + m) * 255), ((rgb[1] + m) * 255), ((rgb[2] + m) * 255));
}

// A grey or black has no hue of its own; keep the slider where it was.
const hsvFor = (hex: string, previous: Hsv = null): Hsv =>
{
    const hsv = rgbToHsv(...(hexToRgb(hex) as [ number, number, number ]));

    if(previous && ((hsv.s === 0) || (hsv.v === 0))) hsv.h = previous.h;

    return hsv;
}

export const ColourPicker: FC<{ label: string, colour: string, onChange: (colour: string) => void, onClose: () => void }> = props =>
{
    const { label, colour, onChange, onClose } = props;
    const [ hsv, setHsv ] = useState<Hsv>(() => hsvFor(colour));
    const [ hexText, setHexText ] = useState<string>(colour);
    // the saved colour last picked or added, which - removes
    const [ savedPick, setSavedPick ] = useState<number>(-1);
    const { savedColours } = useHudPrefs();
    const popRef = useRef<HTMLDivElement>(null);

    // A change from outside (the reset button, another chip): follow it,
    // unless it is the colour this picker just made.
    useEffect(() =>
    {
        setHsv(previous => ((hsvToHex(previous) === colour) ? previous : hsvFor(colour, previous)));
        setHexText(colour);
    }, [ colour ]);

    // A press anywhere else closes it, except on a colour chip, which opens
    // its own colour instead, or a reset button, which the picker follows.
    // Escape closes it too.
    useEffect(() =>
    {
        const onPointerDown = (event: PointerEvent) =>
        {
            const target = (event.target as HTMLElement);

            if(popRef.current?.contains(target) || target?.closest?.('.rp-settings-chip, .rp-settings-reset')) return;

            onClose();
        }

        const onKeyDown = (event: KeyboardEvent) =>
        {
            if(event.key === 'Escape') onClose();
        }

        document.addEventListener('pointerdown', onPointerDown, true);
        document.addEventListener('keydown', onKeyDown);

        return () =>
        {
            document.removeEventListener('pointerdown', onPointerDown, true);
            document.removeEventListener('keydown', onKeyDown);
        }
    }, [ onClose ]);

    const applyHsv = (next: Hsv) =>
    {
        const hex = hsvToHex(next);

        setHsv(next);
        setHexText(hex);

        if(hex !== colour) onChange(hex);
    }

    const applyHex = (hex: string) => applyHsv(hsvFor(hex, hsv));

    const shadeFromPointer = (event: ReactPointerEvent<HTMLDivElement>) =>
    {
        const rect = event.currentTarget.getBoundingClientRect();
        const x = Math.max(0, Math.min(1, ((event.clientX - rect.left) / rect.width)));
        const y = Math.max(0, Math.min(1, ((event.clientY - rect.top) / rect.height)));

        applyHsv({ h: hsv.h, s: x, v: (1 - y) });
    }

    const shadeFromKey = (event: ReactKeyboardEvent<HTMLDivElement>) =>
    {
        const step = 0.02;
        const moves: Record<string, [ number, number ]> = { ArrowLeft: [ -step, 0 ], ArrowRight: [ step, 0 ], ArrowUp: [ 0, step ], ArrowDown: [ 0, -step ] };
        const move = moves[event.key];

        if(!move) return;

        event.preventDefault();
        applyHsv({ h: hsv.h, s: Math.max(0, Math.min(1, (hsv.s + move[0]))), v: Math.max(0, Math.min(1, (hsv.v + move[1]))) });
    }

    const saveColour = () =>
    {
        if((savedColours.length >= SAVED_COLOURS_MAX) || savedColours.includes(colour)) return;

        SetSavedColours([ ...savedColours, colour ]);
        setSavedPick(savedColours.length);
    }

    const removeColour = () =>
    {
        if(!savedColours.length) return;

        const index = (((savedPick >= 0) && (savedPick < savedColours.length)) ? savedPick : (savedColours.length - 1));

        SetSavedColours(savedColours.filter((entry, i) => (i !== index)));
        setSavedPick(-1);
    }

    return (
        <div ref={ popRef } className="rp-settings-picker" role="dialog" aria-label={ `${ label } colour` }>
            <div className="rp-settings-picker-preview" style={ { background: colour } } />
            <div className="rp-settings-picker-saved-head">
                <span>Saved colours</span>
                <span className="rp-settings-picker-count">{ savedColours.length } / { SAVED_COLOURS_MAX }</span>
            </div>
            <div className="rp-settings-picker-saved">
                { savedColours.map((entry, index) => (
                    <button key={ entry } type="button" title={ entry } aria-label={ `Use saved colour ${ entry }` }
                        className={ `rp-settings-picker-dot ${ (savedPick === index) ? 'is-on' : '' }` }
                        style={ { background: entry } }
                        onClick={ () =>
                        {
                            setSavedPick(index);
                            applyHex(entry);
                        } } />
                )) }
                <button type="button" className="rp-settings-picker-mini" title="Save this colour" aria-label="Save this colour"
                    disabled={ (savedColours.length >= SAVED_COLOURS_MAX) || savedColours.includes(colour) } onClick={ saveColour }>+</button>
                <button type="button" className="rp-settings-picker-mini" title="Remove the chosen saved colour" aria-label="Remove a saved colour"
                    disabled={ !savedColours.length } onClick={ removeColour }>−</button>
                <input type="text" className="rp-settings-picker-hex" aria-label="Hex colour" maxLength={ 7 } spellCheck={ false }
                    value={ hexText }
                    onChange={ event =>
                    {
                        const value = event.target.value.trim();

                        setHexText(value);

                        if(/^#?[0-9a-fA-F]{6}$/.test(value)) applyHex(((value[0] === '#') ? value : `#${ value }`).toLowerCase());
                    } }
                    onBlur={ () => setHexText(colour) }
                    onKeyDown={ event => event.stopPropagation() } />
            </div>
            <div className="rp-settings-picker-shade" tabIndex={ 0 } role="slider" aria-label="Shade" aria-valuetext={ colour }
                style={ { background: `linear-gradient(to top, #000, rgba(0, 0, 0, 0)), linear-gradient(to right, #fff, ${ hsvToHex({ h: hsv.h, s: 1, v: 1 }) })` } }
                onPointerDown={ event =>
                {
                    event.currentTarget.setPointerCapture(event.pointerId);
                    shadeFromPointer(event);
                } }
                onPointerMove={ event =>
                {
                    if(event.currentTarget.hasPointerCapture(event.pointerId)) shadeFromPointer(event);
                } }
                onKeyDown={ shadeFromKey }>
                <div className="rp-settings-picker-knob" style={ { left: `${ hsv.s * 100 }%`, top: `${ (1 - hsv.v) * 100 }%`, background: colour } } />
            </div>
            <div className="rp-settings-picker-hue-row">
                <input type="range" className="rp-settings-picker-hue" min={ 0 } max={ 359 } step={ 1 } aria-label="Hue"
                    value={ Math.round(hsv.h) }
                    onChange={ event => applyHsv({ h: parseInt(event.target.value), s: hsv.s, v: hsv.v }) } />
                <div className="rp-settings-picker-swatch" style={ { background: colour } } />
            </div>
        </div>
    );
}
