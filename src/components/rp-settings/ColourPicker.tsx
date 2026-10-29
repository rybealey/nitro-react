import { FC, KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent, useEffect, useRef, useState } from 'react';
import { SAVED_COLOURS_MAX, SetSavedColours, useHudPrefs } from '../../api/prefs/HudPrefsStore';
import { HexToHsv, Hsv, HsvToHex } from '../../api/utils/HsvColor';

// Settings > UI > Colours: the picker that opens beside a colour chip
// (Settings canvas, board O). Top to bottom: the colour, the saved colours
// with + / - and the hex field on one row, the shade square, the hue slider.
// Every change is live; the page decides how often to save it.

export const ColourPicker: FC<{ label: string, colour: string, onChange: (colour: string) => void, onClose: () => void }> = props =>
{
    const { label, colour, onChange, onClose } = props;
    const [ hsv, setHsv ] = useState<Hsv>(() => HexToHsv(colour));
    const [ hexText, setHexText ] = useState<string>(colour);
    // the saved colour last picked or added, which - removes
    const [ savedPick, setSavedPick ] = useState<number>(-1);
    const { savedColours } = useHudPrefs();
    const popRef = useRef<HTMLDivElement>(null);

    // A change from outside (the reset button, another chip): follow it,
    // unless it is the colour this picker just made.
    useEffect(() =>
    {
        setHsv(previous => ((HsvToHex(previous) === colour) ? previous : HexToHsv(colour, previous)));
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
        const hex = HsvToHex(next);

        setHsv(next);
        setHexText(hex);

        if(hex !== colour) onChange(hex);
    }

    const applyHex = (hex: string) => applyHsv(HexToHsv(hex, hsv));

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
                style={ { background: `linear-gradient(to top, #000, rgba(0, 0, 0, 0)), linear-gradient(to right, #fff, ${ HsvToHex({ h: hsv.h, s: 1, v: 1 }) })` } }
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
