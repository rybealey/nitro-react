import { ILinkEventTracker, RpDiscordStatusEvent, RpDiscordUnlinkComposer, RpGetDiscordStatusComposer, RpMacrosEvent, RpUiSettingsEvent } from '@nitrots/nitro-renderer';
import { RpSaveMacrosComposer } from '@nitrots/nitro-renderer';
import { FC, PointerEvent as ReactPointerEvent, useCallback, useEffect, useRef, useState } from 'react';
import { createPortal, flushSync } from 'react-dom';
import { AddEventLinkTracker, GetPingVolume, LocalizeText, RemoveLinkEventTracker, SendMessageComposer, SetPingVolume } from '../../api';
import { Column, DraggableWindowPosition, Flex, NitroCardContentView, NitroCardHeaderView, NitroCardTabsItemView, NitroCardTabsView, NitroCardView, Text } from '../../common';
import { useMessageEvent, UserSettingsVolume, useUserSettings } from '../../hooks';
import { SetMusicVolume, useJukeboxPrefs } from '../music-player/JukeboxStore';
import { ApplyIconTint, ApplyUiChrome, ClampChromeOpacity, DEFAULT_CHROME_COLOR, DEFAULT_CHROME_OPACITY, DEFAULT_HEADER_KEY, HeaderColor, HeaderKeyForColor, IsValidChromeColor, IsValidHeaderKey } from './UiChrome';
import { ColourPicker } from './ColourPicker';
import { HUD_BAR_DEFAULTS, HUD_STYLES, HudBar, HudStyle, SetHudBarColour, SetHudStyle, useHudPrefs } from '../../api/prefs/HudPrefsStore';
import { DEFAULT_ICON_TINT, GetIconTint, ICON_TINT_NEUTRAL, SetIconTint, useIconTint } from '../../api/prefs/IconTintStore';
import { CURSOR_STYLES, CursorStyle, DEFAULT_CURSOR_COLOUR, DEFAULT_CURSOR_STYLE, SetCursorColour, SetCursorStyle, useCursorPrefs } from '../../api/prefs/CursorStore';
import { CursorPreview } from './CursorPreview';
import { DEFAULT_TARGET_COLOUR, DEFAULT_TARGET_HIGHLIGHT, SetTargetColour, SetTargetHighlight, TARGET_HIGHLIGHT_STYLES, TargetHighlightStyle, useTargetHighlight } from '../../api/prefs/TargetHighlightStore';
import { TargetHighlightPreview } from './TargetHighlightPreview';
import { SetSlowComputerMode, useAutoFrameRate } from '../../api/prefs/AutoFrameRate';
import { FPS_MAX, FPS_MIN, SetMaxFps, useFpsPref } from '../../api/prefs/FpsStore';
import { OnAccountPrefsLoaded } from '../../api/prefs/AccountPrefs';
import { ROOM_DRAG_BUTTONS, RoomDragButton, SetRoomDragButton, useRoomDragPref } from '../../api/prefs/RoomDragStore';
import { DEFAULT_USERNAME_COLOR, IsValidUsernameColor } from './UsernameColors';
import { DEFAULT_USERNAME_ICON, IsValidUsernameIcon } from './IconChoices';
import { SaveUiAccountSettings, SetUiAccountSettings } from './UiAccountSettings';
import { SetEnvironmentWeather, useEnvironmentPrefs, useWeatherSnapshot } from '../../api/environment/EnvironmentStore';
import { EnvironmentSkyPreview } from '../environment/EnvironmentSky';
import { SkyConditionLabel } from '../environment/SkyModel';
import { FormatMinutes, FormatTemp, SetClock24, useUnitsPrefs } from '../../api/prefs/UnitsStore';
import { SetHoldPhone, useHoldPhonePref } from '../../api/prefs/PhoneHoldStore';
import { GameMinutes } from '../../api/environment/GameClock';
import { ApplyMacroState, EmptyMacroDocument, IsBindingAllowed, IsModifierOnlyBinding, IsMouseBinding, MACRO_MAX_COMMAND_LENGTH, MACRO_MAX_NAME_LENGTH, MACRO_MAX_PER_KEY, MACRO_MAX_PER_PRESET, MACRO_MAX_PRESETS, MacroBinding, MacroDocument, NormalizeKeyBinding, NormalizeMouseBinding, ParseExportedPreset, ParseMacroDocument, SerializeMacroDocument, SerializePresetForExport, UniquePresetName } from './MacroState';

// PixelRP settings window, opened from the side drawer's Settings button
// (CreateLinkEvent('rp-settings/toggle')). Every tab but Macros pairs the tab
// strip with a left rail of that tab's pages (Settings Sidebar canvas, D/E).
// The name colour, icon and chat bubble were the Personalization tab; they are
// the Customisation window now (CustomisationView), open to everyone from the
// toolbar.
const TABS: string[] = [ 'General', 'Macros', 'UI', 'Discord' ];

// Macro row dragging: how far a press must move before it is a drag, and how
// close to the list's edge the pointer must be for the list to scroll itself.
const MACRO_DRAG_SLACK = 4;
const MACRO_DRAG_EDGE = 28;


// General > Sound: one card per volume, labelled with the cog window's texts.
const VOLUME_ROWS: { kind: UserSettingsVolume, text: string }[] = [
    { kind: 'system', text: 'widget.memenu.settings.volume.ui' },
    { kind: 'furni', text: 'widget.memenu.settings.volume.furni' }
];

// The Macros tab is live: bindings are saved server-side (RpSaveMacrosComposer)
// so they follow the player to any browser, and ChatInputView fires them. See
// MacroState.ts for the document shape and the binding vocabulary.

// Interface tab sub-pages (left rail). Colours (Settings canvas, boards N/O)
// replaced the Windows and Components pages' fixed swatches. Cursor is the
// square under the mouse on the room floor (CursorStore). Target select is how
// your locked target is marked out in the room (TargetHighlightStore).
const INTERFACE_PAGES: string[] = [ 'Colours', 'Cursor', 'Target select' ];
// Environment pages, same rail under their own eyebrow: the sky behind rooms.
const ENVIRONMENT_PAGES: string[] = [ 'Weather' ];

// UI > Colours > HUD > Style: the label on each choice, in HudPrefsStore's order.
const HUD_STYLE_LABELS: Record<HudStyle, string> = { classic: 'Classic', light: 'Light' };

// UI > Colours: the account's colours first (saved on the server), then the
// HUD's (this device). Each row is a reset button and a chip that opens the
// colour picker. UI > Cursor's colour is one of these rows too.
type ColourRowKey = 'headers' | 'interface' | 'icons' | 'cursor' | 'target' | HudBar;

const COLOUR_LABELS: Record<ColourRowKey, string> = { headers: 'Headers', interface: 'Interface', icons: 'Sidebar Icons', cursor: 'Colour', target: 'Colour', hp: 'HP Bar', energy: 'Energy Bar', aggro: 'Aggression' };

// UI > Cursor > Style: the name under each tile, in CursorStore's order.
const CURSOR_STYLE_LABELS: Record<CursorStyle, string> = {
    light: 'Light', frosted: 'Frosted', corners: 'Corners', pad: 'Pad', glow: 'Glow', shade: 'Shade',
    double: 'Double', rounded: 'Rounded', dashed: 'Dashed', points: 'Points', target: 'Target', classic: 'Classic'
};

// UI > Target select: the name under each tile, in TargetHighlightStore's order
// (none, boards A to E of the "Target Lock Highlight" canvas, then the arrow
// and the tint).
const TARGET_HIGHLIGHT_LABELS: Record<TargetHighlightStyle, string> = {
    off: 'Off', thin: 'Thin line', thick: 'Thick line', glow: 'Line and glow', ring: 'Ring', linering: 'Line and ring', arrow: 'Arrow', tint: 'Tint'
};

// General > Drag the Room: the label on each choice, in RoomDragStore's order.
const ROOM_DRAG_LABELS: Record<RoomDragButton, string> = { left: 'Left click', right: 'Right click', both: 'Either' };

export const RpSettingsView: FC<{}> = props =>
{
    const [ isVisible, setIsVisible ] = useState(false);
    // Macros. The whole document lives here; the server is a locker (it never
    // interprets a macro), so this is the single source of truth in the client
    // and MacroState mirrors the ACTIVE preset for the DOM handlers that fire.
    const [ macroDoc, setMacroDoc ] = useState<MacroDocument>(EmptyMacroDocument);
    const [ presetOpen, setPresetOpen ] = useState<boolean>(false);
    // Non-null while "Click to bind" is armed and swallowing the next input.
    const [ capturedBinding, setCapturedBinding ] = useState<string>(null);
    const [ isCapturing, setIsCapturing ] = useState<boolean>(false);
    // Which row in the list a capture is rebinding (its index in the active
    // preset's macros), or null when it is for the new-macro bar. Set
    // together with isCapturing.
    const [ captureRow, setCaptureRow ] = useState<number>(null);
    // The row whose command is open for editing, and its text so far.
    const [ editingCommand, setEditingCommand ] = useState<{ index: number, text: string }>(null);
    // Esc closes the command editor through the same blur that saves it, so
    // this tells the blur to throw the text away instead.
    const discardCommandEdit = useRef<boolean>(false);
    // Modifiers held during capture, shown live on the button ("CTRL+...") so
    // it is obvious the capture is waiting for the key they prefix.
    const [ capturePrefix, setCapturePrefix ] = useState<string>('');
    // The modifier being held alone, if any. Released without anything else
    // pressed, the modifier itself becomes the binding.
    const captureModifier = useRef<string>(null);
    const [ draftCommand, setDraftCommand ] = useState<string>('');
    // Inline rename/create for presets - the design has no dialog for either.
    const [ presetDraft, setPresetDraft ] = useState<string>(null);
    const [ macroNotice, setMacroNotice ] = useState<string>('');
    // Row being dragged, or null: only marks the held row. Set once when
    // a drag starts and once when it ends - never per pointer move.
    const [ macroDragIndex, setMacroDragIndex ] = useState<number>(null);
    const macroListRef = useRef<HTMLDivElement>(null);
    // The drag in progress. Everything that changes per frame lives here and
    // is written straight to the rows' style, not to React state.
    const macroDrag = useRef<{
        from: number, target: number, pointerId: number, startY: number, lastY: number, started: boolean,
        rows: HTMLElement[], centres: number[], slot: number, scrollStart: number,
        order: MacroBinding[], frame: number, detach: () => void
    }>(null);
    // Set once a press has become a drag, so the click that follows the
    // release does not also open the key or command under the pointer.
    const macroSuppressClick = useRef<boolean>(false);
    // 'export' | 'import' | null. One at a time; both are the same overlay.
    const [ macroDialog, setMacroDialog ] = useState<string>(null);
    const [ importText, setImportText ] = useState<string>('');
    // Shown on the Copy button for a moment after a successful copy.
    const [ exportCopied, setExportCopied ] = useState<boolean>(false);
    const exportTextRef = useRef<HTMLTextAreaElement>(null);
    const [ currentTab, setCurrentTab ] = useState<string>(TABS[0]);
    const { maxFps } = useFpsPref();
    const autoFrameRate = useAutoFrameRate();
    const { dragButton } = useRoomDragPref();
    const [ chromeColor, setChromeColor ] = useState<string>(DEFAULT_CHROME_COLOR);
    const [ chromeOpacity, setChromeOpacity ] = useState<number>(DEFAULT_CHROME_OPACITY);
    const [ headerKey, setHeaderKey ] = useState<string>(DEFAULT_HEADER_KEY);
    const { userSettings, setCameraFollow, setVolume, saveVolumes } = useUserSettings();
    // General > Sound > Ping sound: the @mention alert's own volume, on this computer (MentionSound).
    const [ pingVolume, setPingVolumeState ] = useState<number>(GetPingVolume);
    // General > Sound > Music: the level over all of PixelRP's music (JukeboxStore).
    const { musicVolume } = useJukeboxPrefs();
    // null = unknown/loading; refreshed every time the Discord page opens
    const [ discordLinked, setDiscordLinked ] = useState<boolean>(null);
    const [ discordLinkedAt, setDiscordLinkedAt ] = useState<number>(0);
    // 'connect' while the OAuth popup is open, 'unlink' while a disconnect
    // is in flight, null otherwise.
    const [ discordPending, setDiscordPending ] = useState<string>(null);
    const [ confirmUnlink, setConfirmUnlink ] = useState<boolean>(false);
    const [ interfacePage, setInterfacePage ] = useState<string>(INTERFACE_PAGES[0]);
    // UI > Colours: the row whose picker is open, or null.
    const [ openColour, setOpenColour ] = useState<ColourRowKey>(null);
    const { hudStyle, hudBars } = useHudPrefs();
    const { iconTint } = useIconTint();
    const { style: cursorStyle, colour: cursorColour } = useCursorPrefs();
    const { style: targetHighlight, colour: targetColour } = useTargetHighlight();
    // A drag in the picker changes the colour on every move; the server only
    // hears the colour it settles on.
    const uiSaveTimer = useRef<ReturnType<typeof setTimeout>>(null);
    const { weatherOn: environmentWeatherOn } = useEnvironmentPrefs();
    const weatherSnapshot = useWeatherSnapshot();
    // General > Clock, and the weather preview's clock reads it too
    const { clock24: unitsClock24 } = useUnitsPrefs();
    // General > Phone
    const { holdPhone } = useHoldPhonePref();

    useMessageEvent<RpDiscordStatusEvent>(RpDiscordStatusEvent, event =>
    {
        const parser = event.getParser();

        setDiscordLinked(parser.linked);
        setDiscordLinkedAt(parser.linkedAt);
        // Any authoritative answer ends whatever was in flight.
        setDiscordPending(null);
        setConfirmUnlink(false);
    });

    // Refresh link status whenever the Discord page comes on screen.
    useEffect(() =>
    {
        if(!isVisible || (currentTab !== 'Discord')) return;

        setDiscordPending(null);
        setConfirmUnlink(false);
        SendMessageComposer(new RpGetDiscordStatusComposer());
    }, [ isVisible, currentTab ]);

    // A player who cancels at Discord's consent screen, or just closes the
    // popup, sends nothing back - never leave the panel stuck in pending.
    useEffect(() =>
    {
        if(!discordPending) return;

        const timeout = setTimeout(() =>
        {
            setDiscordPending(null);
            SendMessageComposer(new RpGetDiscordStatusComposer());
        }, 90000);

        return () => clearTimeout(timeout);
    }, [ discordPending ]);

    // Persisted UI settings arrive from the server at login; apply and track.
    useMessageEvent<RpUiSettingsEvent>(RpUiSettingsEvent, event =>
    {
        const parser = event.getParser();
        const color = (IsValidChromeColor(parser.chromeColor) ? parser.chromeColor : DEFAULT_CHROME_COLOR);
        const opacity = ClampChromeOpacity(parser.chromeOpacity);
        const header = (IsValidHeaderKey(parser.headerColor) ? parser.headerColor : DEFAULT_HEADER_KEY);
        const uname = (IsValidUsernameColor(parser.usernameColor) ? parser.usernameColor : DEFAULT_USERNAME_COLOR);
        const uicon = (IsValidUsernameIcon(parser.icon) ? parser.icon : DEFAULT_USERNAME_ICON);
        const uiconColor = (IsValidUsernameColor(parser.iconColor) ? parser.iconColor : DEFAULT_USERNAME_COLOR);

        setChromeColor(color);
        setChromeOpacity(opacity);
        setHeaderKey(header);
        // the name's colour and icon are the Customisation window's; all six
        // are saved together, so both windows save from this one copy
        SetUiAccountSettings({ chromeColor: color, chromeOpacity: opacity, headerKey: header, usernameColor: uname, usernameIcon: uicon, usernameIconColor: uiconColor });
        ApplyUiChrome(color, opacity, header);
        ApplyIconTint(GetIconTint());
    });

    // Settings are kept on the account (AccountPrefs): when its copy arrives,
    // the Sidebar Icons tint goes on the icons again and the ping slider,
    // which holds its own state, reads the account's level.
    useEffect(() => OnAccountPrefsLoaded(() =>
    {
        ApplyIconTint(GetIconTint());
        setPingVolumeState(GetPingVolume());
    }), []);

    // ---- Macros ----------------------------------------------------------

    // Saved macros arrive at login. An empty payload means nothing was ever
    // saved, which ParseMacroDocument turns into a single starter preset.
    useMessageEvent<RpMacrosEvent>(RpMacrosEvent, event =>
    {
        const document = ParseMacroDocument(event.getParser().macros);

        setMacroDoc(document);
        ApplyMacroState(document);
    });

    // Every mutation goes through here: it keeps React state, the live lookup
    // the key handlers read, and the server row in step. Saving the whole
    // document each time is deliberate - it is small, the emulator replaces it
    // wholesale, and it means no mutation can half-apply.
    const commitMacros = (next: MacroDocument) =>
    {
        setMacroDoc(next);
        ApplyMacroState(next);
        SendMessageComposer(new RpSaveMacrosComposer(SerializeMacroDocument(next)));
    };

    const activePreset = macroDoc.presets.find(preset => (preset.name === macroDoc.active)) ?? macroDoc.presets[0] ?? null;

    // Notices are advisory (a refused binding, a full list) and should not
    // linger once the player has moved on.
    const notify = (message: string) =>
    {
        setMacroNotice(message);
        setTimeout(() => setMacroNotice(current => ((current === message) ? '' : current)), 4000);
    };

    const replaceActivePreset = (macros: MacroDocument['presets'][0]['macros']) =>
    {
        if(!activePreset) return;

        commitMacros({
            ...macroDoc,
            presets: macroDoc.presets.map(preset => ((preset.name === activePreset.name) ? { ...preset, macros } : preset))
        });
    };

    const addMacro = () =>
    {
        if(!activePreset) return;

        const command = draftCommand.trim();

        if(!capturedBinding)
        {
            notify('Bind a key first.');

            return;
        }

        if(!command.length)
        {
            notify('Type a command first.');

            return;
        }

        if(activePreset.macros.length >= MACRO_MAX_PER_PRESET)
        {
            notify(`A preset holds at most ${ MACRO_MAX_PER_PRESET } macros.`);

            return;
        }

        // A key can run several commands, top to bottom in list order, so a
        // key that is already in use gets ANOTHER row rather than having its
        // command replaced - delete a row to drop one. The same command twice
        // on one key is refused, and so is a key already at its cap.
        const text = command.substring(0, MACRO_MAX_COMMAND_LENGTH);
        const sameKey = activePreset.macros.filter(macro => (macro.b === capturedBinding));

        if(sameKey.some(macro => (macro.c === text)))
        {
            notify(`${ capturedBinding } already runs that command.`);

            return;
        }

        if(sameKey.length >= MACRO_MAX_PER_KEY)
        {
            notify(`A key runs at most ${ MACRO_MAX_PER_KEY } commands.`);

            return;
        }

        replaceActivePreset(activePreset.macros.concat([ { b: capturedBinding, c: text } ]));

        if(sameKey.length) notify(`${ capturedBinding } now runs ${ sameKey.length + 1 } commands, top to bottom.`);

        setCapturedBinding(null);
        setDraftCommand('');
    };

    // Rewrite one row in place - its key, its command or both - keeping its
    // position, since a key with several commands runs them in list order. The
    // same rules as adding apply, measured against every OTHER row, so an edit
    // can never leave the preset in a state Add would have refused.
    const editMacro = (index: number, binding: string, command: string) =>
    {
        if(!activePreset) return;

        const row = activePreset.macros[index];

        if(!row) return;

        const text = command.trim().substring(0, MACRO_MAX_COMMAND_LENGTH);

        if(!text.length)
        {
            notify('A macro needs a command.');

            return;
        }

        if((binding === row.b) && (text === row.c)) return;

        const sameKey = activePreset.macros.filter((macro, position) => ((position !== index) && (macro.b === binding)));

        if(sameKey.some(macro => (macro.c === text)))
        {
            notify(`${ binding } already runs that command.`);

            return;
        }

        if(sameKey.length >= MACRO_MAX_PER_KEY)
        {
            notify(`A key runs at most ${ MACRO_MAX_PER_KEY } commands.`);

            return;
        }

        replaceActivePreset(activePreset.macros.map((macro, position) => ((position === index) ? { b: binding, c: text } : macro)));

        // Moved onto a key that already runs something: the rows sit apart in
        // the list, so say that they now fire together, as Add does.
        if((binding !== row.b) && sameKey.length) notify(`${ binding } now runs ${ sameKey.length + 1 } commands, top to bottom.`);
    };

    const saveCommandEdit = () =>
    {
        const edit = editingCommand;

        setEditingCommand(null);

        if(!edit || !activePreset) return;

        if(discardCommandEdit.current)
        {
            discardCommandEdit.current = false;

            return;
        }

        const row = activePreset.macros[edit.index];

        if(row) editMacro(edit.index, row.b, edit.text);
    };

    const deleteMacro = (index: number) =>
    {
        if(!activePreset) return;

        replaceActivePreset(activePreset.macros.filter((macro, position) => (position !== index)));
    };

    // One row per macro, in list order - which is also the run order of the
    // rows that share a key, so dragging one F1 row above another changes
    // which runs first. Rows are keyed by key and command (the same command
    // twice on one key is refused), so a drop moves these same elements; the
    // count only tells apart an identical pair an old save might still hold.
    const macroRowKeys: string[] = [];

    if(activePreset)
    {
        const seen = new Map<string, number>();

        for(const macro of activePreset.macros)
        {
            const id = `${ macro.b }\u0000${ macro.c }`;
            const count = (seen.get(id) ?? 0);

            seen.set(id, (count + 1));
            macroRowKeys.push(`${ id }\u0000${ count }`);
        }
    }

    const selectPreset = (name: string) =>
    {
        setPresetOpen(false);

        if(name === macroDoc.active) return;

        commitMacros({ ...macroDoc, active: name });
    };

    const savePresetDraft = () =>
    {
        const name = (presetDraft ?? '').trim().substring(0, MACRO_MAX_NAME_LENGTH);

        setPresetDraft(null);

        if(!name.length) return;
        // Names identify a preset in the document and in the picker, so a
        // duplicate would make one of them unreachable.
        if(macroDoc.presets.some(preset => (preset.name === name)))
        {
            notify('You already have a preset with that name.');

            return;
        }

        commitMacros({
            ...macroDoc,
            active: name,
            presets: macroDoc.presets.concat([ { name, macros: [] } ])
        });
    };

    const newPreset = () =>
    {
        if(macroDoc.presets.length >= MACRO_MAX_PRESETS)
        {
            notify(`You can have at most ${ MACRO_MAX_PRESETS } presets.`);

            return;
        }

        setPresetOpen(false);
        setPresetDraft('');
    };

    const deleteActivePreset = () =>
    {
        if(!activePreset) return;
        // The picker needs something to select, and a macro needs a preset to
        // live in, so the last one cannot go.
        if(macroDoc.presets.length <= 1)
        {
            notify('You need at least one preset.');

            return;
        }

        const presets = macroDoc.presets.filter(preset => (preset.name !== activePreset.name));

        commitMacros({ ...macroDoc, active: presets[0].name, presets });
    };

    // ---- Macro row dragging ----------------------------------------------
    // Pointer events rather than HTML5 drag-and-drop: the rows live inside a
    // scrolling panel in a draggable window, and the native API's drag image
    // and drop targets fight both.
    //
    // The held row follows the pointer and the rows it passes slide aside, all
    // by writing style.transform once per animation frame - no React state
    // changes mid-drag, so nothing re-renders while the pointer moves. The
    // real order is written once, on release, and the held row then glides
    // the last few pixels into its slot.

    const withActiveMacros = (macros: MacroBinding[]): MacroDocument => ({
        ...macroDoc,
        presets: macroDoc.presets.map(preset => ((preset.name === (activePreset ? activePreset.name : '')) ? { ...preset, macros } : preset))
    });

    const finishMacroDrag = (keep: boolean) =>
    {
        const drag = macroDrag.current;

        if(!drag) return;

        macroDrag.current = null;
        drag.detach();

        if(drag.frame) cancelAnimationFrame(drag.frame);

        // The click that follows the release belongs to the drag, not to the
        // key or command under the pointer; cleared after it has passed.
        setTimeout(() => (macroSuppressClick.current = false), 0);

        if(!drag.started) return;

        const held = drag.rows[drag.from];

        if(!keep || (drag.target === drag.from))
        {
            // Nothing moves: everything slides back to where it started.
            flushSync(() => setMacroDragIndex(null));
            drag.rows.forEach(row => (row.style.transform = ''));

            return;
        }

        const before = held.getBoundingClientRect().top;
        const order = drag.order.slice();
        const [ moved ] = order.splice(drag.from, 1);

        order.splice(drag.target, 0, moved);

        // Drop the transforms and write the new order in the same frame, so
        // the rows land where the transforms already showed them. Rows are
        // keyed by their key and command, so React moves these same elements.
        drag.rows.forEach(row =>
        {
            row.style.transition = 'none';
            row.style.transform = '';
        });

        flushSync(() =>
        {
            setMacroDragIndex(null);
            commitMacros(withActiveMacros(order));
        });

        const offset = (before - held.getBoundingClientRect().top);

        held.style.transform = `translateY(${ offset }px)`;
        held.getBoundingClientRect();

        requestAnimationFrame(() =>
        {
            drag.rows.forEach(row => (row.style.transition = ''));
            held.style.transform = '';
        });
    };

    const paintMacroDrag = () =>
    {
        const drag = macroDrag.current;
        const list = macroListRef.current;

        if(!drag || !list) return;

        drag.frame = 0;

        // Held near the list's top or bottom edge, the list scrolls itself,
        // faster the closer the pointer gets.
        const bounds = list.getBoundingClientRect();
        let scroll = 0;

        if(drag.lastY < (bounds.top + MACRO_DRAG_EDGE)) scroll = -Math.ceil(((bounds.top + MACRO_DRAG_EDGE) - drag.lastY) / 3);
        else if(drag.lastY > (bounds.bottom - MACRO_DRAG_EDGE)) scroll = Math.ceil((drag.lastY - (bounds.bottom - MACRO_DRAG_EDGE)) / 3);

        if(scroll) list.scrollTop += scroll;

        const offset = ((drag.lastY - drag.startY) + (list.scrollTop - drag.scrollStart));
        const centre = (drag.centres[drag.from] + offset);
        let target = drag.from;

        // The held row takes a neighbour's slot once its middle passes that
        // neighbour's middle.
        while((target < (drag.centres.length - 1)) && (centre > drag.centres[target + 1])) target++;
        while((target > 0) && (centre < drag.centres[target - 1])) target--;

        drag.target = target;

        drag.rows.forEach((row, index) =>
        {
            if(index === drag.from)
            {
                row.style.transform = `translateY(${ offset }px)`;

                return;
            }

            let shift = 0;

            if((drag.from < index) && (index <= target)) shift = -drag.slot;
            else if((target <= index) && (index < drag.from)) shift = drag.slot;

            row.style.transform = (shift ? `translateY(${ shift }px)` : '');
        });

        if(scroll) drag.frame = requestAnimationFrame(paintMacroDrag);
    };

    const onMacroPointerDown = (event: ReactPointerEvent<HTMLDivElement>, index: number) =>
    {
        // A press anywhere on a row can become a drag - keycap and command
        // included, since a press only turns into a drag once it moves. Only
        // the text box and the delete button stay plain clicks.
        if((event.button !== 0) || !activePreset || macroDrag.current) return;
        if((event.target as HTMLElement).closest('input, .rp-mx-delete')) return;

        const list = macroListRef.current;

        if(!list) return;

        const rows = Array.from(list.querySelectorAll('[data-macro-row]')) as HTMLElement[];
        const held = rows[index];

        if(!held) return;

        const top = (list.getBoundingClientRect().top - list.scrollTop);
        const gap = (parseFloat(getComputedStyle(list).rowGap) || 0);

        const onMove = (move: PointerEvent) =>
        {
            const drag = macroDrag.current;

            if(!drag || (move.pointerId !== drag.pointerId)) return;

            drag.lastY = move.clientY;

            if(!drag.started)
            {
                // A few pixels of slack, so a sloppy click is not a reorder.
                if(Math.abs(move.clientY - drag.startY) <= MACRO_DRAG_SLACK) return;

                drag.started = true;
                macroSuppressClick.current = true;
                window.getSelection()?.removeAllRanges();
                setMacroDragIndex(drag.from);
            }

            if(!drag.frame) drag.frame = requestAnimationFrame(paintMacroDrag);
        };

        const onUp = (up: PointerEvent) =>
        {
            if(macroDrag.current && (up.pointerId === macroDrag.current.pointerId)) finishMacroDrag(up.type === 'pointerup');
        };

        // Esc puts the row back where it was.
        const onKey = (key: KeyboardEvent) =>
        {
            if((key.key !== 'Escape') || !macroDrag.current || !macroDrag.current.started) return;

            key.preventDefault();
            key.stopPropagation();
            finishMacroDrag(false);
        };

        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
        window.addEventListener('pointercancel', onUp);
        window.addEventListener('keydown', onKey, true);

        macroDrag.current = {
            from: index,
            target: index,
            pointerId: event.pointerId,
            startY: event.clientY,
            lastY: event.clientY,
            started: false,
            rows,
            centres: rows.map(row =>
            {
                const rect = row.getBoundingClientRect();

                return ((rect.top - top) + (rect.height / 2));
            }),
            slot: (held.getBoundingClientRect().height + gap),
            scrollStart: list.scrollTop,
            order: activePreset.macros.slice(),
            frame: 0,
            detach: () =>
            {
                window.removeEventListener('pointermove', onMove);
                window.removeEventListener('pointerup', onUp);
                window.removeEventListener('pointercancel', onUp);
                window.removeEventListener('keydown', onKey, true);
            }
        };
    };

    // A drag's window listeners must not outlive the panel.
    useEffect(() => () =>
    {
        const drag = macroDrag.current;

        if(!drag) return;

        macroDrag.current = null;
        drag.detach();

        if(drag.frame) cancelAnimationFrame(drag.frame);
    }, []);

    const clearDraft = () =>
    {
        setCapturedBinding(null);
        setDraftCommand('');
        setIsCapturing(false);
        setCaptureRow(null);
        setCapturePrefix('');
        captureModifier.current = null;
    };

    // ---- Export / import -------------------------------------------------

    const closeMacroDialog = () =>
    {
        setMacroDialog(null);
        setImportText('');
        setExportCopied(false);
    };

    const exportText = (activePreset ? SerializePresetForExport(activePreset) : '');

    const copyExport = async () =>
    {
        try
        {
            await navigator.clipboard.writeText(exportText);
            setExportCopied(true);
            setTimeout(() => setExportCopied(false), 2000);
        }
        catch (error)
        {
            // The clipboard API needs a secure context and permission, and it
            // is not worth a dead button when it is unavailable: select the
            // text so the player can copy it by hand, and say so.
            exportTextRef.current?.focus();
            exportTextRef.current?.select();
            notify('Could not reach the clipboard - press Ctrl+C to copy.');
        }
    };

    // The dialog is portaled to <body> and dragged by its header - anywhere
    // on screen, not just within the settings window. Position in viewport px.
    const [ dialogPos, setDialogPos ] = useState<{ x: number, y: number }>(null);
    const macrosRef = useRef<HTMLDivElement>(null);
    const dialogDragRef = useRef<{ startX: number, startY: number, x: number, y: number }>(null);

    const DIALOG_WIDTH = 300;

    // Opens over the macros panel, just under its top bar - the spot it used
    // to be anchored to - so it still reads as belonging to the panel.
    const openMacroDialog = (kind: 'export' | 'import') =>
    {
        const rect = macrosRef.current?.getBoundingClientRect();

        setDialogPos(rect
            ? { x: Math.max(8, Math.round(rect.left + ((rect.width - DIALOG_WIDTH) / 2))), y: Math.round(rect.top + 34) }
            : { x: Math.round((window.innerWidth - DIALOG_WIDTH) / 2), y: 120 });
        setMacroDialog(kind);
    };

    const onDialogPointerDown = (event: ReactPointerEvent<HTMLDivElement>) =>
    {
        if((event.target as HTMLElement).closest('.rp-macros-dialog-close')) return;

        event.preventDefault();
        event.stopPropagation();
        dialogDragRef.current = { startX: event.clientX, startY: event.clientY, x: dialogPos.x, y: dialogPos.y };
        event.currentTarget.setPointerCapture(event.pointerId);
    };

    const onDialogPointerMove = (event: ReactPointerEvent<HTMLDivElement>) =>
    {
        const drag = dialogDragRef.current;

        if(!drag) return;

        setDialogPos({ x: (drag.x + (event.clientX - drag.startX)), y: (drag.y + (event.clientY - drag.startY)) });
    };

    const onDialogPointerUp = (event: ReactPointerEvent<HTMLDivElement>) =>
    {
        dialogDragRef.current = null;

        try { event.currentTarget.releasePointerCapture(event.pointerId); }
        catch(e) { }
    };

    const importPreset = (text: string = importText) =>
    {
        const imported = ParseExportedPreset(text);

        if(!imported)
        {
            notify('That does not look like a macro preset.');

            return;
        }

        if(!imported.macros.length)
        {
            notify('That preset has no macros this client can use.');

            return;
        }

        if(macroDoc.presets.length >= MACRO_MAX_PRESETS)
        {
            notify(`You can have at most ${ MACRO_MAX_PRESETS } presets.`);

            return;
        }

        const name = UniquePresetName(imported.name, macroDoc.presets.map(preset => preset.name));

        commitMacros({
            ...macroDoc,
            active: name,
            presets: macroDoc.presets.concat([ { name, macros: imported.macros } ])
        });

        closeMacroDialog();
        // Say what happened: the name may have been suffixed to avoid a clash,
        // and rows the file listed may have been dropped.
        notify(imported.skipped > 0
            ? `Imported ${ imported.macros.length } macros as "${ name }" - ${ imported.skipped } skipped.`
            : `Imported ${ imported.macros.length } macros as "${ name }".`);
    };

    // Binding capture. Window-level and in the capture phase so the key is
    // taken before the settings window, the chat input or anything else can
    // react to it - including a macro that is already bound to it.
    useEffect(() =>
    {
        if(!isCapturing) return;

        const finish = (binding: string) =>
        {
            captureModifier.current = null;
            setCapturePrefix('');

            if(!binding.length) return;

            if(!IsBindingAllowed(binding))
            {
                notify(`${ binding } cannot be bound.`);
                setIsCapturing(false);
                setCaptureRow(null);

                return;
            }

            // Rebinding a row in the list moves that one command to the new
            // key, by the same rules as Add; the new-macro bar only holds the
            // key until Add.
            if(captureRow !== null)
            {
                const row = activePreset?.macros[captureRow];

                if(row) editMacro(captureRow, binding, row.c);
            }
            else
            {
                setCapturedBinding(binding);
            }

            setIsCapturing(false);
            setCaptureRow(null);
        };

        const onKey = (event: KeyboardEvent) =>
        {
            event.preventDefault();
            event.stopPropagation();

            const binding = NormalizeKeyBinding(event);

            // A modifier on its own does not finish the capture: it might be
            // prefixing a key that has not been pressed yet. Hold it and wait -
            // either a real key arrives (a combo) or it is released alone (the
            // modifier itself).
            if(IsModifierOnlyBinding(binding))
            {
                captureModifier.current = binding;
                setCapturePrefix([
                    (event.ctrlKey ? 'CTRL+' : ''),
                    (event.shiftKey ? 'SHIFT+' : ''),
                    (event.altKey ? 'ALT+' : ''),
                    (event.metaKey ? 'META+' : '')
                ].join(''));

                return;
            }

            finish(binding);
        };

        const onKeyUp = (event: KeyboardEvent) =>
        {
            if(!captureModifier.current) return;
            if(NormalizeKeyBinding(event) !== captureModifier.current) return;

            finish(captureModifier.current);
        };

        const onMouse = (event: MouseEvent) =>
        {
            // Left click is how the player pressed "Click to bind" in the first
            // place, and it is never bindable, so treat it as "cancel".
            if(event.button === 0)
            {
                captureModifier.current = null;
                setCapturePrefix('');
                setIsCapturing(false);
                setCaptureRow(null);

                return;
            }

            event.preventDefault();
            event.stopPropagation();
            finish(NormalizeMouseBinding(event.button, event));
        };

        const swallow = (event: Event) =>
        {
            event.preventDefault();
            event.stopPropagation();
        };

        window.addEventListener('keydown', onKey, true);
        window.addEventListener('keyup', onKeyUp, true);
        window.addEventListener('mousedown', onMouse, true);
        window.addEventListener('contextmenu', swallow, true);

        return () =>
        {
            window.removeEventListener('keydown', onKey, true);
            window.removeEventListener('keyup', onKeyUp, true);
            window.removeEventListener('mousedown', onMouse, true);
            window.removeEventListener('contextmenu', swallow, true);
        };
    }, [ isCapturing, captureRow ]);

    const saveSettings = (color: string, opacity: number, header: string) =>
    {
        // a save now replaces any picker colour still waiting to go
        clearTimeout(uiSaveTimer.current);
        uiSaveTimer.current = null;

        // with the name's colour and icon as they are now (UiAccountSettings)
        SaveUiAccountSettings({ chromeColor: color, chromeOpacity: opacity, headerKey: header });
    }

    const selectChrome = (color: string) =>
    {
        setChromeColor(color);
        ApplyUiChrome(color, chromeOpacity, headerKey);
        saveSettings(color, chromeOpacity, headerKey);
    }

    // Any percent 0-100: applied live as the slider moves, saved once it has
    // been still for a moment (like the colour picker).
    const selectOpacity = (value: number) =>
    {
        const opacity = ClampChromeOpacity(value);

        setChromeOpacity(opacity);
        ApplyUiChrome(chromeColor, opacity, headerKey);
        queueUiSave(chromeColor, headerKey, opacity);
    }

    const selectHeader = (key: string) =>
    {
        setHeaderKey(key);
        ApplyUiChrome(chromeColor, chromeOpacity, key);
        saveSettings(chromeColor, chromeOpacity, key);
    }

    // UI > Colours: the picker's live colours and the opacity slider. Applied
    // at once; saved once the picker or slider has been still for a moment.
    const queueUiSave = (color: string, header: string, opacity: number = chromeOpacity) =>
    {
        clearTimeout(uiSaveTimer.current);
        uiSaveTimer.current = setTimeout(() => saveSettings(color, opacity, header), 500);
    }

    const pickHeaderColour = (colour: string) =>
    {
        const key = HeaderKeyForColor(colour);

        setHeaderKey(key);
        ApplyUiChrome(chromeColor, chromeOpacity, key);
        queueUiSave(chromeColor, key);
    }

    const pickInterfaceColour = (colour: string) =>
    {
        setChromeColor(colour);
        ApplyUiChrome(colour, chromeOpacity, headerKey);
        queueUiSave(colour, headerKey);
    }

    // UI > Colours: the sidebar icon tint, this device only. Applied live.
    const selectIconColour = (colour: string) =>
    {
        SetIconTint(colour);
        ApplyIconTint(colour);
    }

    const closeColourPicker = useCallback(() => setOpenColour(null), []);

    // UI tab rail: a picker left open on one page does not follow to the next.
    const selectInterfacePage = (page: string) =>
    {
        setInterfacePage(page);
        setOpenColour(null);
    }

    const colourRows: Record<ColourRowKey, { colour: string, isDefault: boolean, pick: (colour: string) => void, reset: () => void }> = {
        headers: { colour: HeaderColor(headerKey), isDefault: (headerKey === DEFAULT_HEADER_KEY), pick: pickHeaderColour, reset: () => selectHeader(DEFAULT_HEADER_KEY) },
        interface: { colour: chromeColor.toLowerCase(), isDefault: (chromeColor.toLowerCase() === DEFAULT_CHROME_COLOR), pick: pickInterfaceColour, reset: () => selectChrome(DEFAULT_CHROME_COLOR) },
        icons: { colour: (iconTint || ICON_TINT_NEUTRAL), isDefault: (iconTint === DEFAULT_ICON_TINT), pick: selectIconColour, reset: () => selectIconColour(DEFAULT_ICON_TINT) },
        cursor: { colour: cursorColour, isDefault: (cursorColour === DEFAULT_CURSOR_COLOUR), pick: SetCursorColour, reset: () => SetCursorColour(DEFAULT_CURSOR_COLOUR) },
        target: { colour: targetColour, isDefault: (targetColour === DEFAULT_TARGET_COLOUR), pick: SetTargetColour, reset: () => SetTargetColour(DEFAULT_TARGET_COLOUR) },
        hp: { colour: hudBars.hp, isDefault: (hudBars.hp === HUD_BAR_DEFAULTS.hp), pick: colour => SetHudBarColour('hp', colour), reset: () => SetHudBarColour('hp', HUD_BAR_DEFAULTS.hp) },
        energy: { colour: hudBars.energy, isDefault: (hudBars.energy === HUD_BAR_DEFAULTS.energy), pick: colour => SetHudBarColour('energy', colour), reset: () => SetHudBarColour('energy', HUD_BAR_DEFAULTS.energy) },
        aggro: { colour: hudBars.aggro, isDefault: (hudBars.aggro === HUD_BAR_DEFAULTS.aggro), pick: colour => SetHudBarColour('aggro', colour), reset: () => SetHudBarColour('aggro', HUD_BAR_DEFAULTS.aggro) }
    };

    const renderColourRow = (key: ColourRowKey) =>
    {
        const row = colourRows[key];
        const label = COLOUR_LABELS[key];
        const isOpen = (openColour === key);

        return (
            <div key={ key } className="rp-settings-row">
                <span className="rp-settings-row-label is-colour">{ label }</span>
                <button type="button" className="rp-settings-reset" title="Reset to default" aria-label={ `Reset ${ label } to its default` }
                    disabled={ row.isDefault } onClick={ row.reset }>
                    <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M2.5 5A4 4 0 1 1 3 8.2" /><path d="M2.2 1.8v3.4h3.4" /></svg>
                </button>
                <button type="button" className={ `rp-settings-chip ${ isOpen ? 'is-open' : '' }` } title={ row.colour }
                    aria-label={ `${ label } colour, ${ row.colour }` } aria-expanded={ isOpen }
                    style={ { background: row.colour } }
                    onClick={ () => setOpenColour(isOpen ? null : key) } />
            </div>
        );
    }

    const connectDiscord = () =>
    {
        setDiscordPending('connect');
        window.open('/discord/connect', '_blank', 'noopener,noreferrer');
    }

    const disconnectDiscord = () =>
    {
        setDiscordPending('unlink');
        setConfirmUnlink(false);
        SendMessageComposer(new RpDiscordUnlinkComposer());
    }

    // "Connected since 4 March 2026" - linkedAt is unix seconds, 0 when unlinked.
    const discordLinkedSince = (discordLinkedAt > 0)
        ? new Date(discordLinkedAt * 1000).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
        : null;

    useEffect(() =>
    {
        const linkTracker: ILinkEventTracker = {
            linkReceived: (url: string) =>
            {
                const parts = url.split('/');

                if(parts.length < 2) return;

                switch(parts[1])
                {
                    case 'show':
                        setIsVisible(true);
                        return;
                    case 'hide':
                        setIsVisible(false);
                        return;
                    case 'toggle':
                        setIsVisible(prevValue => !prevValue);
                        return;
                }
            },
            eventUrlPrefix: 'rp-settings/'
        };

        AddEventLinkTracker(linkTracker);

        return () => RemoveLinkEventTracker(linkTracker);
    }, []);

    if(!isVisible) return null;

    return (
        <NitroCardView resizable uniqueKey="rp-settings" className="rp-settings-window" theme="primary-slim" windowPosition={ DraggableWindowPosition.SIDE_DRAWER }>
            <NitroCardHeaderView headerText="Settings" onCloseClick={ () => setIsVisible(false) } />
            <NitroCardTabsView>
                { TABS.map(tab => (
                    <NitroCardTabsItemView key={ tab } isActive={ currentTab === tab } onClick={ () => setCurrentTab(tab) }>
                        { tab }
                    </NitroCardTabsItemView>
                )) }
            </NitroCardTabsView>
            <NitroCardContentView className="text-black rp-settings-content--light">
                { (currentTab === 'UI') &&
                    <div className="prp-subnav-layout">
                        <div className="prp-subnav">
                            { /* sectioned links: eyebrow header per group */ }
                            <div className="prp-subnav-eyebrow">Interface</div>
                            { INTERFACE_PAGES.map(page => (
                                <div key={ page }
                                    className={ `prp-subnav-item ${ (interfacePage === page) ? 'is-active' : '' }` }
                                    onClick={ () => selectInterfacePage(page) }>
                                    { page }
                                </div>
                            )) }
                            <div className="prp-subnav-eyebrow">Environment</div>
                            { ENVIRONMENT_PAGES.map(page => (
                                <div key={ page }
                                    className={ `prp-subnav-item ${ (interfacePage === page) ? 'is-active' : '' }` }
                                    onClick={ () => selectInterfacePage(page) }>
                                    { page }
                                </div>
                            )) }
                        </div>
                        <Column gap={ 2 } className="prp-subnav-page">
                            { (interfacePage === 'Colours') &&
                                <div className="rp-settings-colours">
                                    <section className="rp-settings-group" aria-labelledby="rp-settings-h-windows">
                                        <div id="rp-settings-h-windows" className="rp-settings-group-head">Windows &amp; interface</div>
                                        <div className="rp-settings-panel">
                                            { renderColourRow('headers') }
                                            { renderColourRow('interface') }
                                            { renderColourRow('icons') }
                                            <div className="rp-settings-row">
                                                <label htmlFor="rp-settings-opacity" className="rp-settings-row-label is-opacity">Opacity</label>
                                                <input id="rp-settings-opacity" type="range" min={ 0 } max={ 100 } step={ 1 }
                                                    value={ chromeOpacity }
                                                    onChange={ event => selectOpacity(parseInt(event.target.value)) } />
                                                <span className="rp-settings-row-value">{ chromeOpacity }%</span>
                                            </div>
                                        </div>
                                    </section>
                                    <section className="rp-settings-group" aria-labelledby="rp-settings-h-hud">
                                        <div id="rp-settings-h-hud" className="rp-settings-group-head">HUD</div>
                                        <div className="rp-settings-panel">
                                            <div className="rp-settings-row">
                                                <span id="rp-settings-h-hud-style" className="rp-settings-row-label is-colour">Style</span>
                                                <div className="rp-settings-choice" role="radiogroup" aria-labelledby="rp-settings-h-hud-style">
                                                    { HUD_STYLES.map(style => (
                                                        <div key={ style } role="radio" aria-checked={ hudStyle === style }
                                                            className={ `rp-settings-choice-option ${ (hudStyle === style) ? 'is-selected' : '' }` }
                                                            onClick={ () => SetHudStyle(style) }>
                                                            { HUD_STYLE_LABELS[style] }
                                                        </div>
                                                    )) }
                                                </div>
                                            </div>
                                            { renderColourRow('hp') }
                                            { renderColourRow('energy') }
                                            { renderColourRow('aggro') }
                                        </div>
                                    </section>
                                    { openColour &&
                                        <ColourPicker key={ openColour } label={ COLOUR_LABELS[openColour] }
                                            colour={ colourRows[openColour].colour }
                                            onChange={ colourRows[openColour].pick }
                                            onClose={ closeColourPicker } /> }
                                </div> }
                            { (interfacePage === 'Cursor') &&
                                <div className="rp-settings-colours">
                                    <section className="rp-settings-group" aria-labelledby="rp-settings-h-cursor">
                                        <div id="rp-settings-h-cursor" className="rp-settings-group-head">Cursor</div>
                                        <div className="rp-settings-panel">
                                            { renderColourRow('cursor') }
                                        </div>
                                    </section>
                                    <section className="rp-settings-group" aria-labelledby="rp-settings-h-cursor-style">
                                        <div id="rp-settings-h-cursor-style" className="rp-settings-group-head">Style</div>
                                        <div className="rp-settings-cursors" role="radiogroup" aria-labelledby="rp-settings-h-cursor-style">
                                            { CURSOR_STYLES.map(style => (
                                                <button key={ style } type="button" role="radio" aria-checked={ cursorStyle === style }
                                                    className={ `rp-settings-cursor ${ (cursorStyle === style) ? 'is-selected' : '' }` }
                                                    title={ (style === DEFAULT_CURSOR_STYLE) ? `${ CURSOR_STYLE_LABELS[style] } (default)` : CURSOR_STYLE_LABELS[style] }
                                                    onClick={ () => SetCursorStyle(style) }>
                                                    <CursorPreview cursorStyle={ style } colour={ cursorColour } />
                                                    <span className="rp-settings-cursor-name">{ CURSOR_STYLE_LABELS[style] }</span>
                                                </button>
                                            )) }
                                        </div>
                                    </section>
                                    { (openColour === 'cursor') &&
                                        <ColourPicker key="cursor" label="Cursor"
                                            colour={ colourRows.cursor.colour }
                                            onChange={ colourRows.cursor.pick }
                                            onClose={ closeColourPicker } /> }
                                </div> }
                            { (interfacePage === 'Target select') &&
                                <div className="rp-settings-colours">
                                    <section className="rp-settings-group" aria-labelledby="rp-settings-h-target-colour">
                                        <div id="rp-settings-h-target-colour" className="rp-settings-group-head">Locked target</div>
                                        <div className="rp-settings-panel">
                                            { renderColourRow('target') }
                                        </div>
                                    </section>
                                    <section className="rp-settings-group" aria-labelledby="rp-settings-h-target">
                                        <div id="rp-settings-h-target" className="rp-settings-group-head">Style</div>
                                        <div className="rp-settings-cursors is-targets" role="radiogroup" aria-labelledby="rp-settings-h-target">
                                            { TARGET_HIGHLIGHT_STYLES.map(highlight => (
                                                <button key={ highlight } type="button" role="radio" aria-checked={ targetHighlight === highlight }
                                                    className={ `rp-settings-cursor ${ (targetHighlight === highlight) ? 'is-selected' : '' }` }
                                                    title={ (highlight === DEFAULT_TARGET_HIGHLIGHT) ? `${ TARGET_HIGHLIGHT_LABELS[highlight] } (default)` : TARGET_HIGHLIGHT_LABELS[highlight] }
                                                    onClick={ () => SetTargetHighlight(highlight) }>
                                                    <TargetHighlightPreview highlight={ highlight } colour={ targetColour } />
                                                    <span className="rp-settings-cursor-name">{ TARGET_HIGHLIGHT_LABELS[highlight] }</span>
                                                </button>
                                            )) }
                                        </div>
                                    </section>
                                    { (openColour === 'target') &&
                                        <ColourPicker key="target" label="Locked target"
                                            colour={ colourRows.target.colour }
                                            onChange={ colourRows.target.pick }
                                            onClose={ closeColourPicker } /> }
                                </div> }
                            { (interfacePage === 'Weather') &&
                                <>
                                    <div className="rp-settings-section">
                                        <div className="rp-settings-section-info">
                                            <Text bold>Weather</Text>
                                            <Text small className="text-muted">Paint the space behind rooms with the sky over San Francisco right now: time of day and conditions, as the Weather app reports them.</Text>
                                        </div>
                                        <div className={ `rp-macros-switch rp-settings-env-switch${ environmentWeatherOn ? ' is-on' : '' }` } title={ environmentWeatherOn ? 'Turn weather skies off' : 'Turn weather skies on' } onClick={ () => SetEnvironmentWeather(!environmentWeatherOn) }><span /></div>
                                    </div>
                                    <div className="rp-settings-env-preview">
                                        <EnvironmentSkyPreview dimmed={ !environmentWeatherOn } />
                                        <div className="rp-settings-env-preview-text">
                                            <Text bold>{ environmentWeatherOn ? `Right now: ${ SkyConditionLabel(weatherSnapshot) }${ weatherSnapshot ? ` · ${ FormatTemp(weatherSnapshot.temp) }°` : '' } · ${ FormatMinutes(GameMinutes()) }` : 'Classic black background' }</Text>
                                            <Text small className="text-muted">{ environmentWeatherOn ? 'Follows the Weather app: San Francisco time and conditions, refreshed every 10 minutes. Skies stay darker than the room so nothing competes with play.' : 'Turn Weather on to paint the sky behind rooms from the Weather app: San Francisco time and conditions.' }</Text>
                                        </div>
                                    </div>
                                </> }
                        </Column>
                    </div> }
                { (currentTab === 'Macros') &&
                    <Column gap={ 2 } className="rp-macros" innerRef={ macrosRef }>
                        { /* Light restyle from the Macros tab canvas: preset
                             controls on one white card, then the add row, then
                             one row per key with its commands in run order. */ }
                        <div className="rp-mx-bar">
                            <div className="rp-mx-bar-group">
                                <span className="rp-mx-eyebrow">Preset</span>
                                { (presetDraft === null) &&
                                    <div className="rp-mx-select-wrap">
                                        <button type="button" className="rp-mx-select" aria-haspopup="listbox" aria-expanded={ presetOpen }
                                            onClick={ () => setPresetOpen(value => !value) }>
                                            <span>{ activePreset ? activePreset.name : '' }</span>
                                            <svg width="10" height="6" viewBox="0 0 10 6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M1 1l4 4 4-4" /></svg>
                                        </button>
                                        { presetOpen &&
                                            <div className="rp-mx-select-menu" role="listbox">
                                                { macroDoc.presets.map(preset => (
                                                    <div key={ preset.name } role="option" aria-selected={ preset.name === macroDoc.active }
                                                        className={ `rp-mx-select-option ${ (preset.name === macroDoc.active) ? 'is-active' : '' }` }
                                                        onClick={ () => selectPreset(preset.name) }>
                                                        { preset.name }
                                                    </div>
                                                )) }
                                            </div> }
                                    </div> }
                                { /* Inline name entry: New swaps the picker for a
                                     field and Enter or blur commits it. */ }
                                { (presetDraft !== null) &&
                                    <input autoFocus type="text" className="rp-mx-field rp-mx-preset-input"
                                        placeholder="Preset name" aria-label="New preset name"
                                        maxLength={ MACRO_MAX_NAME_LENGTH } value={ presetDraft }
                                        onChange={ event => setPresetDraft(event.target.value) }
                                        onBlur={ savePresetDraft }
                                        onKeyDown={ event =>
                                        {
                                            if(event.key === 'Enter') savePresetDraft();
                                            if(event.key === 'Escape') setPresetDraft(null);
                                        } } /> }
                                <button type="button" role="switch" aria-checked={ macroDoc.enabled }
                                    className={ `rp-mx-switch ${ macroDoc.enabled ? 'is-on' : '' }` }
                                    onClick={ () => commitMacros({ ...macroDoc, enabled: !macroDoc.enabled }) }>
                                    <span className="rp-mx-switch-track"><span /></span>
                                    { macroDoc.enabled ? 'Macros on' : 'Macros off' }
                                </button>
                            </div>
                            <div className="rp-mx-bar-group rp-mx-bar-actions">
                                <button type="button" className="rp-mx-icon-btn" title="New preset" aria-label="New preset" onClick={ newPreset }>
                                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M6 1.5v9M1.5 6h9" /></svg>
                                </button>
                                <button type="button" className="rp-mx-icon-btn" title="Export preset" aria-label="Export preset"
                                    onClick={ () => { setExportCopied(false); openMacroDialog('export'); } }>
                                    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6.5 8.5V1.5M3.5 4.5l3-3 3 3M1.5 8.5v3h10v-3" /></svg>
                                </button>
                                <button type="button" className="rp-mx-icon-btn" title="Import preset" aria-label="Import preset"
                                    onClick={ () => { setImportText(''); openMacroDialog('import'); } }>
                                    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6.5 1.5v7M3.5 5.5l3 3 3-3M1.5 8.5v3h10v-3" /></svg>
                                </button>
                                { /* Deleting the preset sits last and apart, so the
                                     destructive one is not next to New. */ }
                                <span className="rp-mx-bar-divider" />
                                <button type="button" className="rp-mx-icon-btn rp-mx-icon-btn--danger" title="Delete this preset" aria-label="Delete this preset" onClick={ deleteActivePreset }>
                                    <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M2 3.5h10" /><path d="M5.5 3.5V2h3v1.5" /><path d="M3.5 3.5l.6 8.5h5.8l.6-8.5" /><path d="M5.8 6v3.8M8.2 6v3.8" /></svg>
                                </button>
                            </div>
                        </div>
                        { /* new-macro row: capture a key or mouse button, type the
                             command, Add. */ }
                        <div className="rp-mx-new">
                            <button type="button" className={ `rp-mx-bind ${ (isCapturing && (captureRow === null)) ? 'is-capturing' : '' } ${ capturedBinding ? 'is-bound' : '' }` }
                                title={ capturedBinding ?? undefined }
                                onClick={ () => { setCaptureRow(null); setIsCapturing(true); } }>
                                { (isCapturing && (captureRow === null))
                                    ? (capturePrefix.length ? `${ capturePrefix }...` : 'Press a key')
                                    : (capturedBinding ?? 'Bind a key') }
                            </button>
                            <input type="text" className="rp-mx-field rp-mx-command-field" placeholder=":command to run" aria-label="Macro command"
                                maxLength={ MACRO_MAX_COMMAND_LENGTH } value={ draftCommand }
                                onChange={ event => setDraftCommand(event.target.value) }
                                onKeyDown={ event => (event.key === 'Enter') && addMacro() } />
                            <button type="button" className="rp-mx-add" onClick={ addMacro }>Add</button>
                        </div>
                        { /* The hint is for the add row only: rebinding a key in
                             the list already shows "Press a key" on its keycap. */ }
                        { (isCapturing && (captureRow === null)) &&
                            <div className="rp-mx-notice" role="status">
                                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="6" cy="6" r="5" /><path d="M6 3.5v3M6 8.5v.01" /></svg>
                                Press the key or mouse button to bind. Hold CTRL, SHIFT or ALT first for a combination. Left-click cancels.
                            </div> }
                        { (!isCapturing && (macroNotice.length > 0)) &&
                            <div className="rp-mx-notice" role="status">
                                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="6" cy="6" r="5" /><path d="M6 3.5v3M6 8.5v.01" /></svg>
                                { macroNotice }
                            </div> }
                        <div ref={ macroListRef } className={ `rp-mx-list ${ (macroDragIndex !== null) ? 'is-sorting' : '' }` }
                            onClickCapture={ event =>
                            {
                                if(!macroSuppressClick.current) return;

                                macroSuppressClick.current = false;
                                event.preventDefault();
                                event.stopPropagation();
                            } }>
                            { /* keyed by key and command (macroRowKeys), so a drop moves
                                 these same elements rather than re-filling rows in place */ }
                            { activePreset && activePreset.macros.map((macro, index) => (
                                <div key={ macroRowKeys[index] } data-macro-row={ index }
                                    className={ `rp-mx-row ${ (macroDragIndex === index) ? 'is-dragging' : '' }` }
                                    onPointerDown={ event => onMacroPointerDown(event, index) }>
                                    <span className="rp-mx-grip" aria-hidden="true">
                                        <svg width="8" height="14" viewBox="0 0 8 14" fill="currentColor"><circle cx="2" cy="2.5" r="1.2" /><circle cx="6" cy="2.5" r="1.2" /><circle cx="2" cy="7" r="1.2" /><circle cx="6" cy="7" r="1.2" /><circle cx="2" cy="11.5" r="1.2" /><circle cx="6" cy="11.5" r="1.2" /></svg>
                                    </span>
                                    <div className="rp-mx-key-cell">
                                        <button type="button" className={ `rp-mx-keycap ${ (isCapturing && (captureRow === index)) ? 'is-capturing' : '' }` }
                                            title={ `${ macro.b } - click to change the key` }
                                            onClick={ () => { setEditingCommand(null); setCaptureRow(index); setIsCapturing(true); } }>
                                            { (isCapturing && (captureRow === index))
                                                ? (capturePrefix.length ? `${ capturePrefix }...` : 'Press a key')
                                                : macro.b }
                                        </button>
                                    </div>
                                    <div className="rp-mx-commands">
                                        { (editingCommand && (editingCommand.index === index))
                                            ? <input type="text" autoFocus className="rp-mx-command-input"
                                                aria-label="Edit macro command" maxLength={ MACRO_MAX_COMMAND_LENGTH } value={ editingCommand.text }
                                                onChange={ event => setEditingCommand({ index, text: event.target.value }) }
                                                onKeyDown={ event =>
                                                {
                                                    if(event.key === 'Enter') event.currentTarget.blur();
                            
                                                    if(event.key === 'Escape')
                                                    {
                                                        discardCommandEdit.current = true;
                                                        event.currentTarget.blur();
                                                    }
                                                } }
                                                onBlur={ saveCommandEdit } />
                                            : <span className="rp-mx-command">
                                                <button type="button" className="rp-mx-command-text" title="Click to change the command"
                                                    onClick={ () => setEditingCommand({ index, text: macro.c }) }>{ macro.c }</button>
                                            </span> }
                                    </div>
                                    <button type="button" className="rp-mx-delete" aria-label={ `Delete ${ macro.b } ${ macro.c }` } onClick={ () => deleteMacro(index) }>
                                        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M2 2L8 8M8 2L2 8" /></svg>
                                    </button>
                                </div>
                            )) }
                            { activePreset && !activePreset.macros.length &&
                                <div className="rp-mx-empty">
                                    <div className="rp-mx-empty-keys" aria-hidden="true">
                                        <span className="rp-mx-keycap">F1</span>
                                        <span className="rp-mx-keycap">F2</span>
                                        <span className="rp-mx-keycap">F3</span>
                                    </div>
                                    <div className="rp-mx-empty-title">No macros in this preset yet</div>
                                    <button type="button" className="rp-mx-soft-btn" onClick={ () => { setImportText(''); openMacroDialog('import'); } }>Import a preset</button>
                                </div> }
                        </div>
                        { /* Export and import share one overlay - same frame,
                             same footer, only the copy and the action differ. */ }
                        { (macroDialog !== null) && dialogPos && createPortal(
                            <div className="rp-macros-dialog" style={ { left: dialogPos.x, top: dialogPos.y } }>
                                <div className="rp-macros-dialog-header" onPointerDown={ onDialogPointerDown } onPointerMove={ onDialogPointerMove }
                                    onPointerUp={ onDialogPointerUp } onPointerCancel={ onDialogPointerUp }>
                                    <span>{ (macroDialog === 'export') ? 'Export preset' : 'Import preset' }</span>
                                    <i className="rp-macros-dialog-close" title="Close" onClick={ closeMacroDialog } />
                                </div>
                                <div className="rp-macros-dialog-body">
                                    <span className="rp-macros-dialog-hint">
                                        { (macroDialog === 'export')
                                            ? 'Copy this JSON and send it to another account.'
                                            : 'Paste a preset here. Exports from other hotels (HabRP and the like) work as they are.' }
                                    </span>
                                    { (macroDialog === 'export') &&
                                        <textarea ref={ exportTextRef } readOnly spellCheck={ false }
                                            className="rp-macros-dialog-text" aria-label="Preset JSON"
                                            value={ exportText } onClick={ event => event.currentTarget.select() } /> }
                                    { (macroDialog === 'import') &&
                                        <textarea autoFocus spellCheck={ false }
                                            className="rp-macros-dialog-text" aria-label="Preset JSON to import"
                                            value={ importText } onChange={ event => setImportText(event.target.value) } /> }
                                    <Flex justifyContent="end" gap={ 2 }>
                                        <div className="rp-macros-btn" onClick={ closeMacroDialog }>
                                            { (macroDialog === 'export') ? 'Close' : 'Cancel' }
                                        </div>
                                        { (macroDialog === 'export') &&
                                            <div className="rp-macros-btn rp-macros-btn--accent" onClick={ copyExport }>
                                                { exportCopied ? 'Copied' : 'Copy' }
                                            </div> }
                                        { (macroDialog === 'import') &&
                                            <div className="rp-macros-btn rp-macros-btn--accent" onClick={ () => importPreset() }>Import</div> }
                                    </Flex>
                                </div>
                            </div>, document.body) }
                    </Column> }
                { (currentTab === 'Discord') &&
                    <div className="prp-subnav-layout">
                        <div className="prp-subnav">
                            <div className="prp-subnav-eyebrow">Discord</div>
                            <div className="prp-subnav-item is-active">Account</div>
                        </div>
                        <Column gap={ 2 } className="prp-subnav-page">
                            <Column center fullHeight gap={ 2 } className="rp-settings-discord">
                                <i className="fa-brands fa-discord rp-settings-discord-mark" aria-hidden="true" />
                                <Text bold>Discord</Text>
                                { (discordLinked === null) && <>
                                    <div className="rp-settings-skeleton rp-settings-skeleton--line" />
                                    <div className="rp-settings-skeleton rp-settings-skeleton--block" />
                                    <div className="rp-settings-skeleton rp-settings-skeleton--btn" />
                                </> }
                                { (discordLinked === true) && <>
                                    <Text className="rp-settings-discord-linked">Your Discord account is connected.</Text>
                                    <Text small className="text-muted">Your name in the PixelRP server matches your in-game name, and you carry the Verified role.</Text>
                                    { discordLinkedSince &&
                                        <Text small className="text-muted">Connected since { discordLinkedSince }.</Text> }
                                    { !confirmUnlink && (discordPending !== 'unlink') &&
                                        <div className="rp-settings-discord-btn rp-settings-discord-btn--danger"
                                            onClick={ () => setConfirmUnlink(true) }>Disconnect</div> }
                                    { confirmUnlink && (discordPending !== 'unlink') && <>
                                        <Text small className="text-muted">Disconnect this account? You will lose the Verified role.</Text>
                                        <Flex center gap={ 2 }>
                                            <div className="rp-settings-discord-btn rp-settings-discord-btn--danger"
                                                onClick={ disconnectDiscord }>Yes, disconnect</div>
                                            <Text small underline pointer className="text-muted"
                                                onClick={ () => setConfirmUnlink(false) }>Cancel</Text>
                                        </Flex>
                                    </> }
                                    { (discordPending === 'unlink') &&
                                        <Text small className="text-muted">Disconnecting. Your Discord roles are removed shortly.</Text> }
                                </> }
                                { (discordLinked === false) && <>
                                    <Text small className="text-muted">Link your Discord account to get the Verified role. Your Discord details are never shown in-game.</Text>
                                    { (discordPending !== 'connect') &&
                                        <div className="rp-settings-discord-btn" onClick={ connectDiscord }>Connect Discord</div> }
                                    { (discordPending === 'connect') &&
                                        <Text small className="text-muted">Waiting for Discord. Finish in the window that opened, then come back here.</Text> }
                                </> }
                            </Column>
                        </Column>
                    </div> }
                { /* pixelrp: General is one page in two columns (Settings canvas,
                     board L) - no rail. Each group sits on its own panel and
                     there are no divider lines. Trax is gone (PixelRP has no
                     Trax songs); Music is the level over all PixelRP music. The
                     shop switches are gone too: dragging furni from the shop
                     always buys it and keeps it on the cursor (useCatalog). */ }
                { (currentTab === 'General') &&
                    <div className="rp-settings-general">
                        <div className="rp-settings-general-col">
                            <section className="rp-settings-group" aria-labelledby="rp-settings-h-display">
                                <div id="rp-settings-h-display" className="rp-settings-group-head">Display</div>
                                <div className="rp-settings-panel">
                                    <div className="rp-settings-row">
                                        <label htmlFor="rp-settings-fps" className="rp-settings-row-label is-fps">FPS</label>
                                        <input id="rp-settings-fps" type="range" min={ FPS_MIN } max={ FPS_MAX } step={ 5 } value={ maxFps }
                                            onChange={ event => SetMaxFps(parseInt(event.target.value)) } />
                                        <span className="rp-settings-row-value">{ maxFps }</span>
                                    </div>
                                    { /* pixelrp: Slow computer mode (AutoFrameRate) - off by
                                         default; on, while this computer cannot keep up the
                                         game draws at half the screen's rate, and says so. */ }
                                    <div className="rp-settings-row">
                                        <span className="rp-settings-row-label" title="When the game keeps falling behind, it draws at half your screen's rate - 30 FPS on most laptops - until it can keep up again.">Slow computer mode</span>
                                        <button type="button" role="switch" aria-checked={ autoFrameRate.enabled } aria-label="Slow computer mode"
                                            className={ `rp-settings-env-switch${ autoFrameRate.enabled ? ' is-on' : '' }` }
                                            onClick={ () => SetSlowComputerMode(!autoFrameRate.enabled) }><span /></button>
                                    </div>
                                    { autoFrameRate.lowered &&
                                        <div className="rp-settings-row">
                                            <Text small className="text-muted">{ `Running at ${ autoFrameRate.fps } FPS for now - your computer was falling behind. It goes back up on its own.` }</Text>
                                        </div> }
                                    <div className="rp-settings-row">
                                        <span className="rp-settings-row-label">{ LocalizeText('memenu.settings.other.disable.room.camera.follow') }</span>
                                        <button type="button" role="switch" aria-checked={ !!userSettings?.cameraFollow } aria-label={ LocalizeText('memenu.settings.other.disable.room.camera.follow') } disabled={ !userSettings }
                                            className={ `rp-settings-env-switch${ userSettings?.cameraFollow ? ' is-on' : '' }` }
                                            onClick={ () => setCameraFollow(!userSettings.cameraFollow) }><span /></button>
                                    </div>
                                </div>
                            </section>
                            <section className="rp-settings-group" aria-labelledby="rp-settings-h-drag">
                                <div id="rp-settings-h-drag" className="rp-settings-group-head">Drag the room with</div>
                                <div className="rp-settings-panel">
                                    <div className="rp-settings-row">
                                        <div className="rp-settings-choice is-wide" role="radiogroup" aria-labelledby="rp-settings-h-drag">
                                            { ROOM_DRAG_BUTTONS.map(button => (
                                                <div key={ button } role="radio" aria-checked={ (dragButton === button) }
                                                    className={ `rp-settings-choice-option ${ (dragButton === button) ? 'is-selected' : '' }` }
                                                    onClick={ () => SetRoomDragButton(button) }>
                                                    { ROOM_DRAG_LABELS[button] }
                                                </div>
                                            )) }
                                        </div>
                                    </div>
                                </div>
                            </section>
                            { /* pixelrp: 12-hour (AM/PM) or 24-hour, for every clock in the
                                 game - the city's clock beside "online", the phone and its
                                 apps. The same setting as the phone's Settings > General
                                 (UnitsStore), kept on this computer. */ }
                            <section className="rp-settings-group" aria-labelledby="rp-settings-h-clock">
                                <div id="rp-settings-h-clock" className="rp-settings-group-head">Clock</div>
                                <div className="rp-settings-panel">
                                    <div className="rp-settings-row">
                                        <div className="rp-settings-choice is-wide" role="radiogroup" aria-labelledby="rp-settings-h-clock">
                                            <div role="radio" aria-checked={ !unitsClock24 } className={ `rp-settings-choice-option ${ !unitsClock24 ? 'is-selected' : '' }` } onClick={ () => SetClock24(false) }>12-hour (AM/PM)</div>
                                            <div role="radio" aria-checked={ unitsClock24 } className={ `rp-settings-choice-option ${ unitsClock24 ? 'is-selected' : '' }` } onClick={ () => SetClock24(true) }>24-hour</div>
                                        </div>
                                    </div>
                                </div>
                            </section>
                        </div>
                        <div className="rp-settings-general-col">
                            <section className="rp-settings-group" aria-labelledby="rp-settings-h-sound">
                                <div id="rp-settings-h-sound" className="rp-settings-group-head">Sound</div>
                                <div className="rp-settings-panel">
                                    { VOLUME_ROWS.map(row =>
                                    {
                                        // System and Furni are the account's, so they wait for it to load.
                                        const volume = (userSettings ? Math.round((row.kind === 'system') ? userSettings.volumeSystem : userSettings.volumeFurni) : 0);

                                        return (
                                            <div key={ row.kind } className="rp-settings-row">
                                                <label htmlFor={ `rp-settings-volume-${ row.kind }` } className="rp-settings-row-label is-sound">{ LocalizeText(row.text) }</label>
                                                <input id={ `rp-settings-volume-${ row.kind }` } type="range" min={ 0 } max={ 100 } step={ 1 } value={ volume } disabled={ !userSettings }
                                                    onChange={ event => setVolume(row.kind, parseInt(event.target.value)) }
                                                    onMouseUp={ saveVolumes } onTouchEnd={ saveVolumes } onKeyUp={ saveVolumes } />
                                                <span className="rp-settings-row-value">{ userSettings ? `${ volume }%` : '' }</span>
                                            </div>
                                        );
                                    }) }
                                    <div className="rp-settings-row">
                                        <label htmlFor="rp-settings-volume-music" className="rp-settings-row-label is-sound">Music</label>
                                        <input id="rp-settings-volume-music" type="range" min={ 0 } max={ 100 } step={ 1 } value={ musicVolume }
                                            onChange={ event => SetMusicVolume(parseInt(event.target.value)) } />
                                        <span className="rp-settings-row-value">{ musicVolume }%</span>
                                    </div>
                                    <div className="rp-settings-row">
                                        <label htmlFor="rp-settings-volume-ping" className="rp-settings-row-label is-sound">Ping</label>
                                        <input id="rp-settings-volume-ping" type="range" min={ 0 } max={ 100 } step={ 1 } value={ pingVolume }
                                            onChange={ event =>
                                            {
                                                const volume = parseInt(event.target.value);

                                                setPingVolumeState(volume);
                                                SetPingVolume(volume);
                                            } } />
                                        <span className="rp-settings-row-value">{ (pingVolume > 0) ? `${ pingVolume }%` : 'Off' }</span>
                                    </div>
                                </div>
                            </section>
                            { /* pixelrp: whether your avatar holds the phone while it is
                                 open (PhoneHoldStore). */ }
                            <section className="rp-settings-group" aria-labelledby="rp-settings-h-phone">
                                <div id="rp-settings-h-phone" className="rp-settings-group-head">Phone</div>
                                <div className="rp-settings-panel">
                                    <div className="rp-settings-row">
                                        { /* On = the phone is hidden, so the switch is the store's holdPhone flipped. */ }
                                        <span className="rp-settings-row-label">Hide phone</span>
                                        <button type="button" role="switch" aria-checked={ !holdPhone } aria-label="Hide phone"
                                            className={ `rp-settings-env-switch${ !holdPhone ? ' is-on' : '' }` }
                                            onClick={ () => SetHoldPhone(!holdPhone) }><span /></button>
                                    </div>
                                </div>
                            </section>
                        </div>
                    </div> }
                { !TABS.includes(currentTab) &&
                    <Column center fullHeight gap={ 1 } className="rp-settings-placeholder">
                        <Text bold>{ currentTab }</Text>
                        <Text className="text-muted">Nothing here yet.</Text>
                    </Column> }
            </NitroCardContentView>
        </NitroCardView>
    );
}
