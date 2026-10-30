import { FC, KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AddRecentCustomColors, AvatarEditorUtilities, CategoryData, CustomColorHexFromId, CustomColorIdFromHex, FigureData, GetFigureColorHex, GetRecentCustomColors, HexToHsv, Hsv, HsvToHex, IAvatarEditorCategoryModel } from '../../../../api';

// pixelrp: the custom color picker (Outfit Color Picker canvas). It opens as a
// popover to the left of a palette's Custom tile, over the clothes, leaving the
// palette and the avatar in view. Every change is worn at once, so the avatar
// and the thumbnails show it; Apply keeps it, and Cancel, Escape or a press
// anywhere else puts back what was worn. An edit closed without Apply comes
// back the next time that color is opened.

export interface AvatarEditorCustomColorViewProps
{
    model: IAvatarEditorCategoryModel;
    category: CategoryData;
    paletteIndex: number;
    // The palettes the piece takes a color from - [ 0, 1, 2 ] for three colors,
    // [ 1 ] for a piece with only a second color.
    paletteIndexes: number[];
    anchor: HTMLElement;
    setPaletteIndex: (paletteIndex: number) => void;
    onChange: () => void;
    onClose: () => void;
}


const POPOVER_GAP = 8;
const EDGE_MARGIN = 4;
// Below this brightness a sprite's shading is mostly lost: the client tints
// by multiplying, and a dark color flattens every grey to near black.
const DARK_BRIGHTNESS = 0.25;
const SHADE_STEP = 0.02;
const SHADE_STEP_LARGE = 0.1;

// Other pieces worn, offered so the color can match them.
const OUTFIT_SET_TYPES: [ string, string ][] = [ [ FigureData.HAIR, 'Hair' ], [ FigureData.SHIRT, 'Shirt' ], [ FigureData.JACKET, 'Jacket' ], [ FigureData.TROUSERS, 'Pants' ], [ FigureData.SHOES, 'Shoes' ] ];

// Unapplied edits by category and palette, kept while the client runs.
const pendingDrafts: Map<string, string> = new Map();

const clamp = (value: number) => Math.max(0, Math.min(1, value));

// The color a palette is worn in now, as #rrggbb.
const wornHex = (category: CategoryData, paletteIndex: number): string =>
{
    const customColorId = category.getCustomColorId(paletteIndex);

    if(customColorId) return CustomColorHexFromId(customColorId);

    const colorItem = category.getSelectedColor(paletteIndex);

    return (colorItem?.partColor ? ('#' + colorItem.partColor.rgb.toString(16).padStart(6, '0')) : '#ffffff');
}

export const AvatarEditorCustomColorView: FC<AvatarEditorCustomColorViewProps> = props =>
{
    const { model = null, category = null, paletteIndex = 0, paletteIndexes = [ 0 ], anchor = null, setPaletteIndex = null, onChange = null, onClose = null } = props;
    // Indexed by palette, so one past the last palette the piece uses.
    const [ worn ] = useState<string[]>(() => Array.from({ length: (Math.max(...paletteIndexes) + 1) }, (_, i) => wornHex(category, i)));
    // What Cancel puts back: the piece's colors as worn when this opened.
    const [ wornColorIds ] = useState<number[]>(() => [ ...(AvatarEditorUtilities.CURRENT_FIGURE?.getColorIds(category.name) ?? []) ]);
    const [ drafts, setDrafts ] = useState<Hsv[]>(() => worn.map((wornColor, i) => HexToHsv(pendingDrafts.get(`${ category.name }:${ i }`) ?? wornColor)));
    const [ touched, setTouched ] = useState<boolean[]>(() => worn.map((_, i) => pendingDrafts.has(`${ category.name }:${ i }`)));
    const [ hexText, setHexText ] = useState<string>(null);
    const [ recents ] = useState<string[]>(() => GetRecentCustomColors());
    const [ position, setPosition ] = useState<{ left: number, top: number, arrow: number }>(null);
    const popRef = useRef<HTMLDivElement>(null);
    const frameRef = useRef<number>(0);
    const draftsRef = useRef<Hsv[]>(drafts);
    const touchedRef = useRef<boolean[]>(touched);

    draftsRef.current = drafts;
    touchedRef.current = touched;

    const draft = drafts[paletteIndex];
    const hex = HsvToHex(draft);
    const isDark = (draft.v < DARK_BRIGHTNESS);
    const key = (index: number) => `${ category.name }:${ index }`;
    const isMulti = (paletteIndexes.length > 1);

    // Worn once a frame, however fast the pointer moves.
    const wear = useCallback(() =>
    {
        if(frameRef.current) return;

        frameRef.current = requestAnimationFrame(() =>
        {
            frameRef.current = 0;

            draftsRef.current.forEach((value, index) =>
            {
                if(touchedRef.current[index]) model.selectCustomColor(category.name, CustomColorIdFromHex(HsvToHex(value)), index);
            });

            onChange();
        });
    }, [ model, category, onChange ]);

    const edit = (next: Hsv) =>
    {
        const nextDrafts = drafts.slice();
        const nextTouched = touched.slice();

        nextDrafts[paletteIndex] = next;
        nextTouched[paletteIndex] = true;

        draftsRef.current = nextDrafts;
        touchedRef.current = nextTouched;

        setDrafts(nextDrafts);
        setTouched(nextTouched);
        setHexText(null);
        wear();
    }

    const editHex = (value: string) => edit(HexToHsv(value, draft));

    const cancel = useCallback(() =>
    {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = 0;

        if(touchedRef.current.some(isTouched => isTouched))
        {
            touchedRef.current.forEach((isTouched, index) => (isTouched && pendingDrafts.set(`${ category.name }:${ index }`, HsvToHex(draftsRef.current[index]))));

            category.selectColorIds(wornColorIds);
            AvatarEditorUtilities.CURRENT_FIGURE?.savePartSetColourId(category.name, category.getSelectedColorIds(), true);
        }

        onChange();
        onClose();
    }, [ category, wornColorIds, onChange, onClose ]);

    const apply = () =>
    {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = 0;

        const applied: string[] = [];

        drafts.forEach((value, index) =>
        {
            if(!touched[index] && (index !== paletteIndex)) return;

            const appliedHex = HsvToHex(value);

            model.selectCustomColor(category.name, CustomColorIdFromHex(appliedHex), index);
            pendingDrafts.delete(key(index));
            applied.push(appliedHex);
        });

        AddRecentCustomColors(applied);
        onChange();
        onClose();
    }

    // A press anywhere else closes it without applying - on a swatch, that
    // swatch is then picked. Escape closes it too.
    useEffect(() =>
    {
        const onPointerDown = (event: PointerEvent) =>
        {
            if(popRef.current?.contains(event.target as Node)) return;

            cancel();
        }

        const onKeyDown = (event: KeyboardEvent) =>
        {
            if(event.key === 'Escape') cancel();
        }

        document.addEventListener('pointerdown', onPointerDown, true);
        document.addEventListener('keydown', onKeyDown);

        return () =>
        {
            document.removeEventListener('pointerdown', onPointerDown, true);
            document.removeEventListener('keydown', onKeyDown);
        }
    }, [ cancel ]);

    // An unapplied edit picked up again is worn again straight away.
    useEffect(() =>
    {
        if(touchedRef.current.some(isTouched => isTouched)) wear();

        return () => cancelAnimationFrame(frameRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Beside the tile, its arrow on the tile's middle, kept inside the window -
    // measured against whatever the popover is placed in, so it follows a
    // moved or resized window and any zoom on it.
    useLayoutEffect(() =>
    {
        const element = popRef.current;
        const parent = (element?.offsetParent as HTMLElement);

        if(!element || !parent || !anchor) return;

        const place = () =>
        {
            const parentRect = parent.getBoundingClientRect();
            const scale = ((parentRect.width / parent.offsetWidth) || 1);
            const anchorRect = anchor.getBoundingClientRect();
            const middle = (((anchorRect.top + (anchorRect.height / 2)) - parentRect.top) / scale);
            const left = Math.max(EDGE_MARGIN, ((((anchorRect.left - parentRect.left) / scale) - POPOVER_GAP) - element.offsetWidth));
            const top = Math.max(EDGE_MARGIN, Math.min((middle - 30), (parent.clientHeight - element.offsetHeight - EDGE_MARGIN)));

            setPosition({ left, top, arrow: (middle - top - 5) });
        }

        place();

        const observer = new ResizeObserver(place);

        observer.observe(parent);

        return () => observer.disconnect();
    }, [ anchor, paletteIndex ]);

    const shadeFromPointer = (event: ReactPointerEvent<HTMLDivElement>) =>
    {
        const rect = event.currentTarget.getBoundingClientRect();

        edit({ h: draft.h, s: clamp((event.clientX - rect.left) / rect.width), v: (1 - clamp((event.clientY - rect.top) / rect.height)) });
    }

    const shadeFromKey = (event: ReactKeyboardEvent<HTMLDivElement>) =>
    {
        const step = (event.shiftKey ? SHADE_STEP_LARGE : SHADE_STEP);
        const moves: Record<string, [ number, number ]> = { ArrowLeft: [ -step, 0 ], ArrowRight: [ step, 0 ], ArrowUp: [ 0, step ], ArrowDown: [ 0, -step ] };
        const move = moves[event.key];

        if(!move) return;

        event.preventDefault();
        event.stopPropagation();
        edit({ h: draft.h, s: clamp(draft.s + move[0]), v: clamp(draft.v + move[1]) });
    }

    const outfit: [ string, string ][] = [];

    if(isMulti) paletteIndexes.forEach(index => ((index !== paletteIndex) && outfit.push([ `Color ${ index + 1 }`, HsvToHex(drafts[index]) ])));

    for(const [ setType, name ] of OUTFIT_SET_TYPES)
    {
        if((setType === category.name) || (outfit.length >= (isMulti ? 4 : 3))) continue;

        const colorIds = AvatarEditorUtilities.CURRENT_FIGURE?.getColorIds(setType);
        const colorHex = ((colorIds && colorIds.length) ? GetFigureColorHex(setType, colorIds[0]) : null);

        if(colorHex) outfit.push([ name, colorHex ]);
    }

    const root = anchor?.closest('.nitro-avatar-editor');

    if(!root) return null;

    return createPortal(
        <div ref={ popRef } className="avatar-editor-color-popover" role="dialog" aria-label="Custom color"
            style={ position ? { left: position.left, top: position.top } : { visibility: 'hidden' } }>
            <span className="popover-arrow" style={ { top: (position?.arrow ?? 0) } } />
            <div className="popover-head">
                <span className="popover-title">{ isMulti ? 'Custom' : 'Custom color' }</span>
                { isMulti &&
                    <div className="popover-segments">
                        { paletteIndexes.map(index =>
                            <button key={ index } type="button" aria-label={ `Edit color ${ index + 1 }` } aria-pressed={ (index === paletteIndex) }
                                className={ (index === paletteIndex) ? 'is-on' : '' } onClick={ () => setPaletteIndex(index) }>
                                <span className="segment-dot" style={ { background: HsvToHex(drafts[index]) } } />{ index + 1 }
                            </button>) }
                    </div> }
                <button type="button" className="popover-close" title="Close (Esc)" aria-label="Close without applying" onClick={ cancel } />
            </div>
            <div className="popover-shade" tabIndex={ 0 } role="slider" aria-label="Saturation and brightness" aria-valuetext={ hex }
                style={ { background: `linear-gradient(to top, #000, rgba(0, 0, 0, 0)), linear-gradient(to right, #fff, ${ HsvToHex({ h: draft.h, s: 1, v: 1 }) })` } }
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
                <div className="shade-threshold" />
                { isDark && <span className="shade-warning">Too dark to show shading</span> }
                <div className="shade-knob" style={ { left: `${ draft.s * 100 }%`, top: `${ (1 - draft.v) * 100 }%`, background: hex } } />
            </div>
            <input type="range" className="popover-hue" min={ 0 } max={ 359 } step={ 1 } aria-label="Hue"
                value={ Math.round(draft.h) % 360 }
                onChange={ event => edit({ h: parseInt(event.target.value), s: draft.s, v: draft.v }) } />
            <div className="popover-values">
                <div className="popover-compare">
                    <span title="New" style={ { background: hex } } />
                    <button type="button" title="Go back to the color you're wearing" aria-label="Go back to the color you're wearing"
                        style={ { background: worn[paletteIndex] } } onClick={ () => editHex(worn[paletteIndex]) } />
                </div>
                <label className="popover-hex">
                    #
                    <input type="text" aria-label="Hex color code" maxLength={ 6 } spellCheck={ false } autoComplete="off" placeholder="RRGGBB"
                        value={ hexText ?? hex.slice(1).toUpperCase() }
                        onChange={ event =>
                        {
                            const value = event.target.value.replace(/[^0-9a-fA-F]/g, '').toUpperCase().slice(0, 6);

                            if(value.length === 6) editHex(`#${ value.toLowerCase() }`);

                            setHexText(value);
                        } }
                        onBlur={ () => setHexText(null) }
                        onKeyDown={ event => event.stopPropagation() } />
                </label>
            </div>
            <div className="popover-chips">
                <div className="chip-group">
                    <span className="chip-label">Your outfit</span>
                    <div className="chip-row">
                        { outfit.map(([ name, colorHex ]) =>
                            <button key={ name } type="button" className="chip is-round" title={ `${ name } ${ colorHex }` } aria-label={ `Match your ${ name.toLowerCase() }, ${ colorHex }` }
                                style={ { background: colorHex } } onClick={ () => editHex(colorHex) } />) }
                    </div>
                </div>
                <span className="chip-divider" />
                <div className="chip-group">
                    <span className="chip-label">Recent</span>
                    <div className="chip-row">
                        { recents.slice(0, isMulti ? 4 : 5).map(colorHex =>
                            <button key={ colorHex } type="button" className="chip" title={ colorHex } aria-label={ `Use recent color ${ colorHex }` }
                                style={ { background: colorHex } } onClick={ () => editHex(colorHex) } />) }
                        { !recents.length && <span className="chip-empty">None yet</span> }
                    </div>
                </div>
            </div>
            <div className="popover-actions">
                <button type="button" className="btn btn-secondary btn-sm" onClick={ cancel }>Cancel</button>
                <button type="button" className="btn btn-success btn-sm" onClick={ apply }>Apply</button>
            </div>
        </div>, root);
}
