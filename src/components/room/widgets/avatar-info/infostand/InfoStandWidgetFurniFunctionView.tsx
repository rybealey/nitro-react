import { FC, PointerEvent as ReactPointerEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AvatarInfoFurni, SendMessageComposer } from '../../../../../api';
import { AddFurniFunctionListener, RequestFurniFunction, RpFurniFunction, RpSetFurniFunctionComposer } from '../../../../../api/rp-furni/RpFurniMessages';

interface InfoStandWidgetFurniFunctionViewProps
{
    avatarInfo: AvatarInfoFurni;
    onClose: () => void;
}

/**
 * The Function window - edits a furni DEFINITION's behaviour, hotel-wide.
 *
 * Everything here writes `furniture`, not `items`, so a change lands on every
 * placed copy and on everything bought afterwards. That is the whole point of
 * the window, and also why it leads with the blast radius and asks before
 * applying rather than saving as you type.
 *
 * Size, sprite and floor/wall are shown but not editable: those come from the
 * furni's artwork, and changing them here would make the server block tiles the
 * sprite never covers.
 */

// Matches the width in AvatarInfoWidgetView.scss; the height is the opening
// guess used only to centre it, since the panel's real height depends on
// whether a companion field is showing.
const DIALOG_WIDTH = 360;
const DIALOG_HEIGHT = 560;

// Laying has no column of its own - the emulator reads it off the behaviour
// (GameMap.cs), so the toggle drives that field and the row says so.
const LAY_TYPES = [ 'bed', 'tent_small' ];

// Behaviours that are inert - or actively broken - without a second value.
// Picking one of these and leaving the companion blank is the easiest way to
// ship furni that clicks and does nothing, so Apply waits for it.
const COMPANIONS: { [key: string]: { field: 'vendingIds' | 'effectId' | 'behaviourData'; label: string; placeholder: string; note: string }} = {
    vendingmachine: { field: 'vendingIds', label: 'Handitem ids', placeholder: '1003,1004', note: 'A vending machine with no handitems clicks and does nothing.' },
    teleport: { field: 'behaviourData', label: 'Paired furni id', placeholder: '106754', note: 'Teleports work in pairs. Without a partner id this one leads nowhere.' },
    hopper: { field: 'behaviourData', label: 'Target room id', placeholder: '14', note: 'A hopper needs a destination room, or it swallows the click.' },
    effect: { field: 'effectId', label: 'Effect id', placeholder: '9', note: 'Without an effect id nothing is applied when someone stands on it.' },
    fx_provider: { field: 'effectId', label: 'Effect id', placeholder: '12', note: 'Without an effect id this hands out nothing.' },
    exchange: { field: 'behaviourData', label: 'Credit value', placeholder: '50', note: 'An exchange with no value redeems for nothing.' },
    gld_gate: { field: 'behaviourData', label: 'Group id', placeholder: '3', note: 'A group door with no group lets everyone through.' }
};

// The builder-facing subset. The emulator understands 107 interaction types,
// but the rest are engine plumbing - minigame tiles, pet dyes, wired blocks -
// that a builder should never be setting on a chair by hand.
const BEHAVIOURS: [ string, string ][] = [
    [ 'default', 'None (plain furni)' ], [ 'gate', 'Door' ], [ 'onewaygate', 'One-way door' ],
    [ 'vip_gate', 'VIP door' ], [ 'gld_gate', 'Group door' ], [ 'teleport', 'Teleport' ],
    [ 'hopper', 'Room hopper' ], [ 'roller', 'Roller' ], [ 'bed', 'Bed' ],
    [ 'tent_small', 'Tent (small)' ], [ 'tent', 'Tent' ], [ 'dimmer', 'Mood light' ],
    [ 'postit', 'Sticky note' ], [ 'stacktool', 'Stack helper' ], [ 'pressure_pad', 'Pressure pad' ],
    [ 'dressing_booth', 'Dressing booth' ], [ 'effect', 'Grants an effect' ],
    [ 'fx_provider', 'Hands out an effect' ], [ 'vendingmachine', 'Vending machine' ],
    [ 'exchange', 'Credit exchange' ], [ 'counter', 'Timer' ], [ 'alert', 'Alert' ],
    [ 'arrow', 'Arrow' ], [ 'gift', 'Gift' ], [ 'trophy', 'Trophy' ],
    [ 'scoreboard', 'Scoreboard' ], [ 'television', 'Television' ], [ 'jukebox', 'Jukebox' ],
    [ 'musicdisc', 'Music disc' ], [ 'camera_picture', 'Photo' ], [ 'mannequin', 'Mannequin' ],
    [ 'bot', 'Bot' ], [ 'pet', 'Pet' ], [ 'deal', 'Bundle' ], [ 'roomdeal', 'Room bundle' ],
    [ 'purchasable_clothing', 'Clothing box' ]
];

const PRESETS: [ string, string, { walkable: boolean; seat: boolean; stackable: boolean; height?: number } ][] = [
    [ 'wall', 'Wall', { walkable: false, seat: false, stackable: false } ],
    [ 'through', 'Walk-through', { walkable: true, seat: false, stackable: false } ],
    [ 'seat', 'Seat', { walkable: false, seat: true, stackable: false } ],
    [ 'table', 'Table', { walkable: false, seat: false, stackable: true } ],
    [ 'rug', 'Rug', { walkable: true, seat: false, stackable: true, height: 0 } ]
];

const LABELS: { [key: string]: string } = {
    walkable: 'Walkable', seat: 'Sittable', stackable: 'Stackable', stackHeight: 'Stack height',
    adjustableHeights: 'Adjustable', interactionType: 'Behaviour', modes: 'Click states',
    effectId: 'Walk effect', behaviourData: 'Behaviour data', vendingIds: 'Handitems'
};

type Draft = Pick<RpFurniFunction, 'walkable' | 'seat' | 'stackable' | 'stackHeight' | 'adjustableHeights' | 'interactionType' | 'modes' | 'effectId' | 'behaviourData' | 'vendingIds'>;

const toDraft = (data: RpFurniFunction): Draft => ({
    walkable: data.walkable, seat: data.seat, stackable: data.stackable,
    stackHeight: data.stackHeight, adjustableHeights: data.adjustableHeights,
    interactionType: data.interactionType, modes: data.modes, effectId: data.effectId,
    behaviourData: data.behaviourData, vendingIds: data.vendingIds
});

const show = (value: boolean | number | string): string =>
{
    if(value === true) return 'yes';
    if(value === false) return 'no';
    if((value === '') || (value === null)) return '-';

    return String(value);
}

const behaviourLabel = (id: string): string =>
{
    const found = BEHAVIOURS.find(entry => (entry[0] === id));

    return found ? found[1] : id;
}

export const InfoStandWidgetFurniFunctionView: FC<InfoStandWidgetFurniFunctionViewProps> = props =>
{
    const { avatarInfo = null, onClose = null } = props;
    const [ saved, setSaved ] = useState<RpFurniFunction>(null);
    const [ draft, setDraft ] = useState<Draft>(null);
    const [ confirming, setConfirming ] = useState(false);
    // Viewport px. Opened centred, then moved by the header - the same pointer
    // drag the macros dialog uses, rather than HTML5 drag-and-drop, which
    // cannot work for a panel that sits over a canvas.
    const [ pos, setPos ] = useState<{ x: number; y: number }>(() => ({
        x: Math.max(8, Math.round((window.innerWidth - DIALOG_WIDTH) / 2)),
        y: Math.max(8, Math.round((window.innerHeight - DIALOG_HEIGHT) / 2))
    }));
    const dragRef = useRef<{ startX: number; startY: number; x: number; y: number }>(null);

    useEffect(() =>
    {
        const remove = AddFurniFunctionListener(data =>
        {
            setSaved(data);
            // A broadcast arriving while someone else's change lands would
            // otherwise silently rebase this editor's unsaved work; taking the
            // new record wholesale is the honest outcome, and matches what the
            // furni now actually does.
            setDraft(toDraft(data));
            setConfirming(false);
        });

        RequestFurniFunction(avatarInfo.id);

        return remove;
    }, [ avatarInfo.id ]);

    const layable = useMemo(() => (draft ? (LAY_TYPES.indexOf(draft.interactionType) >= 0) : false), [ draft ]);

    const companion = useMemo(() => (draft ? (COMPANIONS[draft.interactionType] || null) : null), [ draft ]);

    const companionReady = useMemo(() =>
    {
        if(!companion || !draft) return true;

        const value = draft[companion.field];

        if(companion.field === 'vendingIds') return (String(value).trim().length > 0);

        return (Number(value) > 0);
    }, [ companion, draft ]);

    const changes = useMemo(() =>
    {
        if(!saved || !draft) return [];

        return Object.keys(LABELS).filter(key => (saved[key] !== draft[key])).map(key => ({
            key,
            label: LABELS[key],
            from: (key === 'interactionType') ? behaviourLabel(saved[key]) : show(saved[key]),
            to: (key === 'interactionType') ? behaviourLabel(draft[key]) : show(draft[key])
        }));
    }, [ saved, draft ]);

    const update = useCallback((patch: Partial<Draft>) =>
    {
        setDraft(prev => ({ ...prev, ...patch }));
    }, []);

    const onHeaderPointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) =>
    {
        if((event.target as HTMLElement).closest('.rp-furni-function-close')) return;

        event.preventDefault();
        event.stopPropagation();

        dragRef.current = { startX: event.clientX, startY: event.clientY, x: pos.x, y: pos.y };

        event.currentTarget.setPointerCapture(event.pointerId);
    }, [ pos ]);

    const onHeaderPointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) =>
    {
        const drag = dragRef.current;

        if(!drag) return;

        setPos({ x: (drag.x + (event.clientX - drag.startX)), y: (drag.y + (event.clientY - drag.startY)) });
    }, []);

    const onHeaderPointerUp = useCallback((event: ReactPointerEvent<HTMLDivElement>) =>
    {
        dragRef.current = null;

        try 
        {
            event.currentTarget.releasePointerCapture(event.pointerId); 
        }
        catch(error) 
        { }
    }, []);

    const applyPreset = useCallback((preset: typeof PRESETS[number][2]) =>
    {
        update({ walkable: preset.walkable, seat: preset.seat, stackable: preset.stackable,
            ...((preset.height !== undefined) ? { stackHeight: preset.height } : {}) });
    }, [ update ]);

    const commit = useCallback(() =>
    {
        SendMessageComposer(new RpSetFurniFunctionComposer(saved.definitionId, draft.walkable,
            draft.seat, draft.stackable, draft.stackHeight, draft.adjustableHeights,
            draft.interactionType, draft.modes, draft.effectId, draft.behaviourData, draft.vendingIds));

        // Closing is the confirmation: the change is hotel-wide and the
        // window has nothing left to say about it. Staying open would invite a
        // second apply of the same edit.
        setConfirming(false);
        onClose();
    }, [ saved, draft, onClose ]);

    // The skeleton mirrors the real panel block for block, at the same heights,
    // so the window opens at its final size and fills in - rather than opening
    // small and jumping once the definition lands.
    if(!saved || !draft)
    {
        return createPortal(
            <div className="rp-furni-function is-loading" style={ { left: pos.x, top: pos.y } }>
                <div className="rp-furni-function-header" onPointerDown={ onHeaderPointerDown }
                    onPointerMove={ onHeaderPointerMove } onPointerUp={ onHeaderPointerUp }>
                    <span>Function Tool</span>
                    <i className="rp-furni-function-close" onClick={ onClose } />
                </div>
                <div className="rp-furni-function-subject">
                    <div className="rp-skeleton" style={ { width: '45%', height: 15 } } />
                    <div className="rp-skeleton" style={ { width: '62%', height: 11, marginTop: 4 } } />
                </div>
                <div className="rp-furni-function-scope">
                    <div className="rp-skeleton" style={ { width: '100%', height: 11 } } />
                    <div className="rp-skeleton" style={ { width: '74%', height: 11, marginTop: 4 } } />
                </div>
                <div className="rp-furni-function-body">
                    <div className="rp-furni-function-section">
                        <div className="rp-furni-function-legend">Presets</div>
                        <div className="rp-furni-function-presets">
                            { [ 44, 84, 40, 46, 36 ].map((width, index) =>
                                <div key={ index } className="rp-skeleton is-pill" style={ { width, height: 26 } } />) }
                        </div>
                    </div>
                    <div className="rp-furni-function-section">
                        <div className="rp-furni-function-legend">Movement &amp; collision</div>
                        { [ 0, 1, 2, 3 ].map(index =>
                            <div key={ index } className="rp-furni-function-row">
                                <div className="rp-skeleton is-switch" />
                                <div className="rp-furni-function-row-text">
                                    <div className="rp-skeleton" style={ { width: 72, height: 12 } } />
                                    <div className="rp-skeleton" style={ { width: 148, height: 10, marginTop: 3 } } />
                                </div>
                            </div>) }
                        <div className="rp-furni-function-pair">
                            <label>
                                <span>Stack height</span>
                                <div className="rp-skeleton is-input" />
                            </label>
                            <label className="is-wide">
                                <span>Adjustable heights</span>
                                <div className="rp-skeleton is-input" />
                            </label>
                        </div>
                    </div>
                    <div className="rp-furni-function-section">
                        <div className="rp-furni-function-legend">Interaction</div>
                        <label className="rp-furni-function-field">
                            <span>Behaviour</span>
                            <div className="rp-skeleton is-select" />
                        </label>
                        <div className="rp-furni-function-pair">
                            <label>
                                <span>Click states</span>
                                <div className="rp-skeleton is-input" />
                            </label>
                            <label>
                                <span>Walk effect</span>
                                <div className="rp-skeleton is-input" />
                            </label>
                        </div>
                    </div>
                    <div className="rp-furni-function-section">
                        <div className="rp-furni-function-legend">Fixed by the artwork</div>
                        <div className="rp-furni-function-fixed">
                            { [ 'Class', 'Sprite', 'Size', 'Placement' ].map(label =>
                                <div key={ label }>
                                    <span>{ label }</span>
                                    <div className="rp-skeleton" style={ { width: 54, height: 10 } } />
                                </div>) }
                        </div>
                    </div>
                </div>
                <div className="rp-furni-function-footer">
                    <span>Loading</span>
                    <div className="rp-furni-function-actions">
                        <div className="rp-skeleton is-pill" style={ { width: 58, height: 26 } } />
                        <div className="rp-skeleton is-pill" style={ { width: 58, height: 26 } } />
                    </div>
                </div>
            </div>, document.body);
    }

    const scope = `${ saved.placedCopies } placed ${ (saved.placedCopies === 1) ? 'copy' : 'copies' } across ${ saved.roomCount } ${ (saved.roomCount === 1) ? 'room' : 'rooms' }`;
    const canApply = (changes.length > 0) && companionReady;

    const toggles: [ string, string, boolean, () => void ][] = [
        [ 'Walkable', 'Avatars can walk over it', draft.walkable, () => update({ walkable: !draft.walkable }) ],
        [ 'Sittable', 'Avatars sit at stack height', draft.seat, () => update({ seat: !draft.seat }) ],
        [ 'Layable', 'Sets Behaviour to Bed - laying has no field of its own', layable, () => update({ interactionType: layable ? 'default' : 'bed' }) ],
        [ 'Stackable', 'Other furni can go on top', draft.stackable, () => update({ stackable: !draft.stackable }) ]
    ];

    return createPortal(
        <div className="rp-furni-function" style={ { left: pos.x, top: pos.y } }>
            <div className="rp-furni-function-header" onPointerDown={ onHeaderPointerDown }
                onPointerMove={ onHeaderPointerMove } onPointerUp={ onHeaderPointerUp }>
                <span>Function Tool</span>
                <i className="rp-furni-function-close" onClick={ onClose } />
            </div>
            <div className="rp-furni-function-subject">
                <div className="rp-furni-function-name">{ saved.publicName || saved.itemName }</div>
                <div className="rp-furni-function-class">{ saved.itemName } #{ saved.definitionId }</div>
            </div>
            <div className="rp-furni-function-scope">
                Changes every copy of this furni hotel-wide (<b>{ scope }</b>) and everything bought from now on.
            </div>
            <div className="rp-furni-function-body">
                <div className="rp-furni-function-section">
                    <div className="rp-furni-function-legend">Presets</div>
                    <div className="rp-furni-function-presets">
                        { PRESETS.map(([ key, label, values ]) =>
                            <div key={ key } className="rp-furni-function-btn" onClick={ () => applyPreset(values) }>{ label }</div>) }
                    </div>
                </div>
                <div className="rp-furni-function-section">
                    <div className="rp-furni-function-legend">Movement &amp; collision</div>
                    { toggles.map(([ label, hint, on, toggle ]) =>
                        <div key={ label } className="rp-furni-function-row">
                            <div className={ 'rp-furni-function-switch' + (on ? ' is-on' : '') } onClick={ toggle }><span /></div>
                            <div className="rp-furni-function-row-text">
                                <div className="rp-furni-function-row-label">{ label }</div>
                                <div className="rp-furni-function-row-hint">{ hint }</div>
                            </div>
                        </div>) }
                    <div className="rp-furni-function-pair">
                        <label>
                            <span>Stack height</span>
                            <input type="number" step="0.1" min="0" max="40" value={ draft.stackHeight }
                                onChange={ event => update({ stackHeight: parseFloat(event.target.value) || 0 }) } />
                        </label>
                        <label className="is-wide">
                            <span>Adjustable heights</span>
                            <input type="text" placeholder="e.g. 0.5,1.0,1.5" value={ draft.adjustableHeights }
                                onChange={ event => update({ adjustableHeights: event.target.value }) } />
                        </label>
                    </div>
                </div>
                <div className="rp-furni-function-section">
                    <div className="rp-furni-function-legend">Interaction</div>
                    <label className="rp-furni-function-field">
                        <span>Behaviour</span>
                        <select value={ draft.interactionType } onChange={ event => update({ interactionType: event.target.value }) }>
                            { BEHAVIOURS.map(([ id, label ]) => <option key={ id } value={ id }>{ label }</option>) }
                            { !BEHAVIOURS.some(entry => (entry[0] === draft.interactionType)) &&
                                <option value={ draft.interactionType }>{ draft.interactionType } (advanced)</option> }
                        </select>
                    </label>
                    { companion &&
                        <div className={ 'rp-furni-function-companion' + (companionReady ? '' : ' is-missing') }>
                            <div className="rp-furni-function-companion-note">{ companion.note }</div>
                            <label className="rp-furni-function-field">
                                <span>{ companion.label }</span>
                                <input type="text" placeholder={ companion.placeholder }
                                    value={ String(draft[companion.field] ?? '') }
                                    onChange={ event => update({ [companion.field]: (companion.field === 'vendingIds')
                                        ? event.target.value
                                        : (parseInt(event.target.value) || 0) } as Partial<Draft>) } />
                            </label>
                        </div> }
                    <div className="rp-furni-function-pair">
                        <label>
                            <span>Click states</span>
                            <input type="number" min="1" max="128" value={ draft.modes }
                                onChange={ event => update({ modes: parseInt(event.target.value) || 1 }) } />
                        </label>
                        <label>
                            <span>Walk effect</span>
                            <input type="number" min="0" value={ draft.effectId }
                                onChange={ event => update({ effectId: parseInt(event.target.value) || 0 }) } />
                        </label>
                    </div>
                </div>
                <div className="rp-furni-function-section">
                    <div className="rp-furni-function-legend">Fixed by the artwork</div>
                    <div className="rp-furni-function-fixed">
                        <div><span>Class</span><b>{ saved.itemName }</b></div>
                        <div><span>Sprite</span><b>{ saved.spriteId }</b></div>
                        <div><span>Size</span><b>{ saved.width } x { saved.length }</b></div>
                        <div><span>Placement</span><b>{ (saved.productType === 'i') ? 'Wall' : 'Floor' }</b></div>
                    </div>
                    <div className="rp-furni-function-note">Size and placement come from the furni&apos;s artwork, not the database. Changing them here would make the server block tiles the sprite never covers.</div>
                </div>
            </div>
            <div className="rp-furni-function-footer">
                <span className={ changes.length ? 'is-dirty' : '' }>
                    { changes.length ? `${ changes.length } change${ (changes.length === 1) ? '' : 's' }` : 'No changes' }
                </span>
                <div className="rp-furni-function-actions">
                    <div className="rp-furni-function-btn" onClick={ () => setDraft(toDraft(saved)) }>Reset</div>
                    <div className={ 'rp-furni-function-btn' + (canApply ? ' rp-furni-function-btn--accent' : ' is-disabled') }
                        onClick={ () => canApply && setConfirming(true) }>Apply</div>
                </div>
            </div>
            { confirming &&
                <div className="rp-furni-function-confirm">
                    <div className="rp-furni-function-confirm-box">
                        <div className="rp-furni-function-header"><span>Apply to every copy?</span></div>
                        <div className="rp-furni-function-body">
                            <div className="rp-furni-function-hint">These take effect immediately on <b>{ scope }</b>, and on everything bought later.</div>
                            <div className="rp-furni-function-diff">
                                { changes.map(change =>
                                    <div key={ change.key }>
                                        <span>{ change.label }</span>
                                        <i>{ change.from }</i>
                                        <em>-&gt;</em>
                                        <b>{ change.to }</b>
                                    </div>) }
                            </div>
                            <div className="rp-furni-function-actions">
                                <div className="rp-furni-function-btn" onClick={ () => setConfirming(false) }>Cancel</div>
                                <div className="rp-furni-function-btn rp-furni-function-btn--go" onClick={ commit }>Apply</div>
                            </div>
                        </div>
                    </div>
                </div> }
        </div>, document.body);
}
