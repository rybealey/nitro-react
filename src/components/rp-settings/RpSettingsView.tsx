import { AvatarFigurePartType, AvatarScaleType, AvatarSetType, ILinkEventTracker, RpDiscordStatusEvent, RpDiscordUnlinkComposer, RpGetDiscordStatusComposer, RpMacrosEvent, RpUiSettingsEvent } from '@nitrots/nitro-renderer';
import { RpSaveMacrosComposer, RpSaveUiSettingsComposer } from '@nitrots/nitro-renderer';
import { FC, PointerEvent as ReactPointerEvent, useEffect, useRef, useState } from 'react';
import { createPortal, flushSync } from 'react-dom';
import { AddEventLinkTracker, GetAvatarRenderManager, GetSessionDataManager, RemoveLinkEventTracker, SendMessageComposer } from '../../api';
import { Column, DraggableWindowPosition, Flex, NitroCardContentView, NitroCardHeaderView, NitroCardTabsItemView, NitroCardTabsView, NitroCardView, Text } from '../../common';
import { useMessageEvent } from '../../hooks';
import { ApplyUiChrome, CHROME_OPACITY_STEPS, CHROME_SCHEMES, ChromeSwatchColor, DEFAULT_CHROME_COLOR, DEFAULT_CHROME_OPACITY, DEFAULT_HEADER_KEY, HEADER_SCHEMES, IsValidChromeColor, IsValidHeaderKey } from './UiChrome';
import { FPS_MAX, FPS_MIN, SetMaxFps, useFpsPref } from '../../api/prefs/FpsStore';
import { ROOM_DRAG_BUTTONS, RoomDragButton, SetRoomDragButton, useRoomDragPref } from '../../api/prefs/RoomDragStore';
import { DEFAULT_USERNAME_COLOR, IsValidUsernameColor, USERNAME_COLORS } from './UsernameColors';
import { DEFAULT_USERNAME_ICON, IsValidUsernameIcon, USERNAME_ICONS } from './IconChoices';
import { UsernameIconGlyph } from './UsernameIconGlyph';
import { SetEnvironmentWeather, useEnvironmentPrefs, useWeatherSnapshot } from '../../api/environment/EnvironmentStore';
import { EnvironmentSkyPreview } from '../environment/EnvironmentSky';
import { SanFranciscoClock, SkyConditionLabel } from '../environment/SkyModel';
import { FormatTemp, useUnitsPrefs } from '../../api/prefs/UnitsStore';
import { ApplyMacroState, EmptyMacroDocument, IsBindingAllowed, IsModifierOnlyBinding, IsMouseBinding, MACRO_MAX_COMMAND_LENGTH, MACRO_MAX_NAME_LENGTH, MACRO_MAX_PER_KEY, MACRO_MAX_PER_PRESET, MACRO_MAX_PRESETS, MacroBinding, MacroDocument, NormalizeKeyBinding, NormalizeMouseBinding, ParseExportedPreset, ParseMacroDocument, SerializeMacroDocument, SerializePresetForExport, UniquePresetName } from './MacroState';

// PixelRP settings window, opened from the side drawer's Settings button
// (CreateLinkEvent('rp-settings/toggle')). Tabs beyond Interface are
// placeholders to be filled out as settings are decided.
const TABS: string[] = [ 'General', 'Macros', 'Social', 'Roleplay', 'UI' ];

// Macro row dragging: how far a press must move before it is a drag, and how
// close to the list's edge the pointer must be for the list to scroll itself.
const MACRO_DRAG_SLACK = 4;
const MACRO_DRAG_EDGE = 28;

// Roleplay tab sub-pages (left rail). Empty for now — pages exist so the
// settings can be furnished one by one. Macros moved out to its own top-level
// tab, so it is deliberately not listed here any more.
const ROLEPLAY_PAGES: string[] = [ 'Messages' ];

// The Macros tab is live: bindings are saved server-side (RpSaveMacrosComposer)
// so they follow the player to any browser, and ChatInputView fires them. See
// MacroState.ts for the document shape and the binding vocabulary.

// Social tab sub-pages (left rail), grouped under the Personalization
// eyebrow; the chat-bubble preview shows on both.
const SOCIAL_PAGES: string[] = [ 'Color', 'Icon' ];

// Interface tab sub-pages (left rail).
const INTERFACE_PAGES: string[] = [ 'Windows', 'Components' ];
// Environment pages, same rail under their own eyebrow: the sky behind rooms.
const ENVIRONMENT_PAGES: string[] = [ 'Weather' ];

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
    // Which key group in the list a capture is rebinding (its index in
    // macroGroups), or null when it is for the new-macro bar. Set together
    // with isCapturing.
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
    // Key group being dragged, or null: only marks the held row. Set once when
    // a drag starts and once when it ends - never per pointer move.
    const [ macroDragIndex, setMacroDragIndex ] = useState<number>(null);
    const macroListRef = useRef<HTMLDivElement>(null);
    // The drag in progress. Everything that changes per frame lives here and
    // is written straight to the rows' style, not to React state.
    const macroDrag = useRef<{
        from: number, target: number, pointerId: number, startY: number, lastY: number, started: boolean,
        rows: HTMLElement[], centres: number[], slot: number, scrollStart: number,
        order: MacroBinding[][], frame: number, detach: () => void
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
    const { dragButton } = useRoomDragPref();
    const [ chromeColor, setChromeColor ] = useState<string>(DEFAULT_CHROME_COLOR);
    const [ chromeOpacity, setChromeOpacity ] = useState<number>(DEFAULT_CHROME_OPACITY);
    const [ headerKey, setHeaderKey ] = useState<string>(DEFAULT_HEADER_KEY);
    const [ roleplayPage, setRoleplayPage ] = useState<string>(ROLEPLAY_PAGES[0]);
    const [ socialPage, setSocialPage ] = useState<string>(SOCIAL_PAGES[0]);
    // null = unknown/loading; refreshed every time the Discord page opens
    const [ discordLinked, setDiscordLinked ] = useState<boolean>(null);
    const [ discordLinkedAt, setDiscordLinkedAt ] = useState<number>(0);
    // 'connect' while the OAuth popup is open, 'unlink' while a disconnect
    // is in flight, null otherwise.
    const [ discordPending, setDiscordPending ] = useState<string>(null);
    const [ confirmUnlink, setConfirmUnlink ] = useState<boolean>(false);
    const [ usernameColor, setUsernameColor ] = useState<string>(DEFAULT_USERNAME_COLOR);
    const [ usernameIcon, setUsernameIcon ] = useState<string>(DEFAULT_USERNAME_ICON);
    const [ usernameIconColor, setUsernameIconColor ] = useState<string>(DEFAULT_USERNAME_COLOR);
    const [ interfacePage, setInterfacePage ] = useState<string>(INTERFACE_PAGES[0]);
    const { weatherOn: environmentWeatherOn } = useEnvironmentPrefs();
    const weatherSnapshot = useWeatherSnapshot();
    const { clock24: unitsClock24 } = useUnitsPrefs();
    // Own avatar head + chest color for the preview bubble, built the same way
    // the chat widget builds them (useChatWidget's setFigureImage).
    const [ previewFigure, setPreviewFigure ] = useState<{ imageUrl: string, color: string }>(null);

    useEffect(() =>
    {
        if(!isVisible) return;

        let disposed = false;

        const buildFigure = (figure: string) =>
        {
            const avatarImage = GetAvatarRenderManager().createAvatarImage(figure, AvatarScaleType.LARGE, null, {
                resetFigure: figure =>
                {
                    if(!disposed) buildFigure(figure);
                },
                dispose: () => {},
                disposed: false
            });

            if(!avatarImage) return;

            const image = avatarImage.getCroppedImage(AvatarSetType.HEAD);
            const color = avatarImage.getPartColor(AvatarFigurePartType.CHEST);

            setPreviewFigure({ imageUrl: image.src, color: ('#' + ((color && color.rgb) || 16777215).toString(16).padStart(6, '0')) });
            avatarImage.dispose();
        }

        buildFigure(GetSessionDataManager().figure);

        return () =>
        {
            disposed = true;
        }
    }, [ isVisible ]);

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
        if(!isVisible || (currentTab !== 'Social') || (socialPage !== 'Discord')) return;

        setDiscordPending(null);
        setConfirmUnlink(false);
        SendMessageComposer(new RpGetDiscordStatusComposer());
    }, [ isVisible, currentTab, socialPage ]);

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

    // Snap any stored value onto the nearest of the five slider stops.
    const snapOpacity = (value: number) => CHROME_OPACITY_STEPS.reduce((prev, curr) => ((Math.abs(curr - value) < Math.abs(prev - value)) ? curr : prev));

    // Persisted UI settings arrive from the server at login; apply and track.
    useMessageEvent<RpUiSettingsEvent>(RpUiSettingsEvent, event =>
    {
        const parser = event.getParser();
        const color = (IsValidChromeColor(parser.chromeColor) ? parser.chromeColor : DEFAULT_CHROME_COLOR);
        const opacity = snapOpacity(parser.chromeOpacity);
        const header = (IsValidHeaderKey(parser.headerColor) ? parser.headerColor : DEFAULT_HEADER_KEY);
        const uname = (IsValidUsernameColor(parser.usernameColor) ? parser.usernameColor : DEFAULT_USERNAME_COLOR);
        const uicon = (IsValidUsernameIcon(parser.icon) ? parser.icon : DEFAULT_USERNAME_ICON);
        const uiconColor = (IsValidUsernameColor(parser.iconColor) ? parser.iconColor : DEFAULT_USERNAME_COLOR);

        setChromeColor(color);
        setChromeOpacity(opacity);
        setHeaderKey(header);
        setUsernameColor(uname);
        setUsernameIcon(uicon);
        setUsernameIconColor(uiconColor);
        ApplyUiChrome(color, opacity, header);
    });

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

    // Moves a command one place earlier or later among its OWN key's commands,
    // which is the only order that changes what a key does. The two rows swap
    // places in the list; rows of other keys between them stay put.
    const moveWithinKey = (index: number, offset: number) =>
    {
        if(!activePreset) return;

        const row = activePreset.macros[index];

        if(!row) return;

        let target = (index + offset);

        while((target >= 0) && (target < activePreset.macros.length) && (activePreset.macros[target].b !== row.b)) target += offset;

        if((target < 0) || (target >= activePreset.macros.length)) return;

        const macros = activePreset.macros.slice();

        macros[index] = macros[target];
        macros[target] = row;
        replaceActivePreset(macros);
    };

    const deleteKey = (binding: string) =>
    {
        if(!activePreset) return;

        replaceActivePreset(activePreset.macros.filter(macro => (macro.b !== binding)));
    };

    // Rebinds every command of one key at once. The same rules as adding
    // apply to the key it moves onto: no command twice, at most
    // MACRO_MAX_PER_KEY. Each row keeps its place, so both keys' run orders
    // survive a merge.
    const rebindKey = (from: string, to: string) =>
    {
        if(!activePreset || (from === to)) return;

        const moving = activePreset.macros.filter(macro => (macro.b === from));
        const existing = activePreset.macros.filter(macro => (macro.b === to));

        if(!moving.length) return;

        if(moving.some(macro => existing.some(other => (other.c === macro.c))))
        {
            notify(`${ to } already runs that command.`);

            return;
        }

        if((moving.length + existing.length) > MACRO_MAX_PER_KEY)
        {
            notify(`A key runs at most ${ MACRO_MAX_PER_KEY } commands.`);

            return;
        }

        replaceActivePreset(activePreset.macros.map(macro => ((macro.b === from) ? { ...macro, b: to } : macro)));

        if(existing.length) notify(`${ to } now runs ${ moving.length + existing.length } commands, top to bottom.`);
    };

    // The list shows one row per key, in the order each key first appears,
    // holding that key's commands in the order they run. Only the order WITHIN
    // a key matters to what fires, so grouping never changes behaviour.
    const macroGroups: { key: string, rows: { index: number, text: string }[] }[] = [];

    if(activePreset)
    {
        activePreset.macros.forEach((macro, index) =>
        {
            let group = macroGroups.find(existing => (existing.key === macro.b));

            if(!group)
            {
                group = { key: macro.b, rows: [] };
                macroGroups.push(group);
            }

            group.rows.push({ index, text: macro.c });
        });
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
        // keyed by their key name, so React moves these same elements.
        drag.rows.forEach(row =>
        {
            row.style.transition = 'none';
            row.style.transform = '';
        });

        flushSync(() =>
        {
            setMacroDragIndex(null);
            commitMacros(withActiveMacros(order.flat()));
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
        // A press anywhere on a row can become a drag - keycap and commands
        // included, since a press only turns into a drag once it moves. Only
        // the text box and the small delete / order buttons stay plain clicks.
        if((event.button !== 0) || !activePreset || macroDrag.current) return;
        if((event.target as HTMLElement).closest('input, .rp-mx-delete, .rp-mx-command-tools')) return;

        const list = macroListRef.current;

        if(!list) return;

        const rows = Array.from(list.querySelectorAll('[data-macro-group]')) as HTMLElement[];
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
            order: macroGroups.map(group => group.rows.map(row => activePreset.macros[row.index])),
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

            // Rebinding a key in the list moves all of its commands at once;
            // the new-macro bar only holds the key until Add.
            if(captureRow !== null)
            {
                const group = macroGroups[captureRow];

                if(group) rebindKey(group.key, binding);
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

    const saveSettings = (color: string, opacity: number, header: string, uname: string, icon: string, iconColor: string) =>
    {
        // '' resets the server row's color/header/username/icon to default
        SendMessageComposer(new RpSaveUiSettingsComposer(
            (color === DEFAULT_CHROME_COLOR) ? '' : color,
            opacity,
            (header === DEFAULT_HEADER_KEY) ? '' : header,
            (uname === DEFAULT_USERNAME_COLOR) ? '' : uname,
            icon,
            (iconColor === DEFAULT_USERNAME_COLOR) ? '' : iconColor));
    }

    const selectChrome = (color: string) =>
    {
        setChromeColor(color);
        ApplyUiChrome(color, chromeOpacity, headerKey);
        saveSettings(color, chromeOpacity, headerKey, usernameColor, usernameIcon, usernameIconColor);
    }

    const selectOpacity = (index: number) =>
    {
        const opacity = (CHROME_OPACITY_STEPS[index] ?? DEFAULT_CHROME_OPACITY);

        setChromeOpacity(opacity);
        ApplyUiChrome(chromeColor, opacity, headerKey);
        saveSettings(chromeColor, opacity, headerKey, usernameColor, usernameIcon, usernameIconColor);
    }

    const selectHeader = (key: string) =>
    {
        setHeaderKey(key);
        ApplyUiChrome(chromeColor, chromeOpacity, key);
        saveSettings(chromeColor, chromeOpacity, key, usernameColor, usernameIcon, usernameIconColor);
    }

    const selectUsernameColor = (color: string) =>
    {
        setUsernameColor(color);
        saveSettings(chromeColor, chromeOpacity, headerKey, color, usernameIcon, usernameIconColor);
    }

    const selectUsernameIcon = (icon: string) =>
    {
        setUsernameIcon(icon);
        saveSettings(chromeColor, chromeOpacity, headerKey, usernameColor, icon, usernameIconColor);
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
            <NitroCardContentView className={ `text-black${ (currentTab === 'Macros') ? ' rp-settings-content--light' : '' }` }>
                { (currentTab === 'UI') &&
                    <div className="prp-subnav-layout">
                        <div className="prp-subnav">
                            { /* sectioned links: eyebrow header per group */ }
                            <div className="prp-subnav-eyebrow">Interface</div>
                            { INTERFACE_PAGES.map(page => (
                                <div key={ page }
                                    className={ `prp-subnav-item ${ (interfacePage === page) ? 'is-active' : '' }` }
                                    onClick={ () => setInterfacePage(page) }>
                                    { page }
                                </div>
                            )) }
                            <div className="prp-subnav-eyebrow">Environment</div>
                            { ENVIRONMENT_PAGES.map(page => (
                                <div key={ page }
                                    className={ `prp-subnav-item ${ (interfacePage === page) ? 'is-active' : '' }` }
                                    onClick={ () => setInterfacePage(page) }>
                                    { page }
                                </div>
                            )) }
                        </div>
                        <Column gap={ 2 } className="prp-subnav-page">
                            { (interfacePage === 'Windows') &&
                                <div className="rp-settings-section">
                                    <div className="rp-settings-section-info">
                                        <Text bold>Header Style</Text>
                                        <Text small className="text-muted">The color of window title bars, in the classic two-tone style.</Text>
                                    </div>
                                    <div className="rp-settings-swatches rp-settings-swatches--headers">
                                        { HEADER_SCHEMES.map(scheme => (
                                            <div key={ scheme.key } title={ scheme.name }
                                                className={ `rp-settings-swatch ${ (headerKey === scheme.key) ? 'is-selected' : '' }` }
                                                style={ { background: `linear-gradient(${ scheme.top } 50%, ${ scheme.bottom } 50%)` } }
                                                onClick={ () => selectHeader(scheme.key) } />
                                        )) }
                                    </div>
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
                                            <Text bold>{ environmentWeatherOn ? `Right now: ${ SkyConditionLabel(weatherSnapshot) }${ weatherSnapshot ? ` · ${ FormatTemp(weatherSnapshot.temp) }°` : '' } · ${ SanFranciscoClock(Date.now(), unitsClock24) }` : 'Classic black background' }</Text>
                                            <Text small className="text-muted">{ environmentWeatherOn ? 'Follows the Weather app: San Francisco time and conditions, refreshed every 10 minutes. Skies stay darker than the room so nothing competes with play.' : 'Turn Weather on to paint the sky behind rooms from the Weather app: San Francisco time and conditions.' }</Text>
                                        </div>
                                    </div>
                                </> }
                            { (interfacePage === 'Components') &&
                                <div className="rp-settings-section">
                                    <div className="rp-settings-section-info">
                                        <Text bold>Color</Text>
                                        <Text small className="text-muted">The color and opacity of your interface: the HUDs, drawer, purse and toolbars.</Text>
                                    </div>
                                    <div className="rp-settings-color-control">
                                        <div className="rp-settings-swatches">
                                            { CHROME_SCHEMES.map(scheme => (
                                                <div key={ scheme.key } title={ scheme.name }
                                                    className={ `rp-settings-swatch ${ (chromeColor === scheme.color) ? 'is-selected' : '' }` }
                                                    style={ { backgroundColor: ChromeSwatchColor(scheme.color) } }
                                                    onClick={ () => selectChrome(scheme.color) } />
                                            )) }
                                        </div>
                                        <div className="rp-settings-opacity">
                                            <input type="range" min={ 0 } max={ CHROME_OPACITY_STEPS.length - 1 } step={ 1 }
                                                value={ CHROME_OPACITY_STEPS.indexOf(chromeOpacity) }
                                                onChange={ event => selectOpacity(parseInt(event.target.value)) } />
                                            <Text small className="rp-settings-opacity-value">{ chromeOpacity }%</Text>
                                        </div>
                                    </div>
                                </div> }
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
                                    <svg width="12" height="13" viewBox="0 0 12 13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M1.5 3.5h9M4.5 3.5V2h3v1.5M2.8 3.5l.6 8h5.2l.6-8" /></svg>
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
                            { /* keyed by the key name - groups are unique by key - so
                                 a drop moves these same elements rather than
                                 re-filling rows in place */ }
                            { macroGroups.map((group, groupIndex) => (
                                <div key={ group.key } data-macro-group={ groupIndex }
                                    className={ `rp-mx-row ${ (macroDragIndex === groupIndex) ? 'is-dragging' : '' }` }
                                    onPointerDown={ event => onMacroPointerDown(event, groupIndex) }>
                                    <span className="rp-mx-grip" aria-hidden="true">
                                        <svg width="8" height="14" viewBox="0 0 8 14" fill="currentColor"><circle cx="2" cy="2.5" r="1.2" /><circle cx="6" cy="2.5" r="1.2" /><circle cx="2" cy="7" r="1.2" /><circle cx="6" cy="7" r="1.2" /><circle cx="2" cy="11.5" r="1.2" /><circle cx="6" cy="11.5" r="1.2" /></svg>
                                    </span>
                                    <div className="rp-mx-key-cell">
                                        <button type="button" className={ `rp-mx-keycap ${ (isCapturing && (captureRow === groupIndex)) ? 'is-capturing' : '' }` }
                                            title={ `${ group.key } - click to change the key` }
                                            onClick={ () => { setEditingCommand(null); setCaptureRow(groupIndex); setIsCapturing(true); } }>
                                            { (isCapturing && (captureRow === groupIndex))
                                                ? (capturePrefix.length ? `${ capturePrefix }...` : 'Press a key')
                                                : group.key }
                                        </button>
                                    </div>
                                    <div className="rp-mx-commands">
                                        { group.rows.map((row, position) => (
                                            <div key={ row.index } className="rp-mx-command-slot">
                                                { (position > 0) &&
                                                    <svg className="rp-mx-then" aria-label="then" width="12" height="10" viewBox="0 0 12 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M1 5h9M7 2l3 3-3 3" /></svg> }
                                                { (editingCommand && (editingCommand.index === row.index))
                                                    ? <input type="text" autoFocus className="rp-mx-command-input"
                                                        aria-label="Edit macro command" maxLength={ MACRO_MAX_COMMAND_LENGTH } value={ editingCommand.text }
                                                        onChange={ event => setEditingCommand({ index: row.index, text: event.target.value }) }
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
                                                            onClick={ () => setEditingCommand({ index: row.index, text: row.text }) }>{ row.text }</button>
                                                        { /* Only a key with several commands needs its own
                                                             order and per-command delete; a single command
                                                             goes with the row's x. Shown on hover. */ }
                                                        { (group.rows.length > 1) &&
                                                            <span className="rp-mx-command-tools">
                                                                { (position > 0) &&
                                                                    <button type="button" title="Run earlier" aria-label="Run earlier" onClick={ () => moveWithinKey(row.index, -1) }>
                                                                        <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 1L2 4l3 3" /></svg>
                                                                    </button> }
                                                                { (position < (group.rows.length - 1)) &&
                                                                    <button type="button" title="Run later" aria-label="Run later" onClick={ () => moveWithinKey(row.index, 1) }>
                                                                        <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 1l3 3-3 3" /></svg>
                                                                    </button> }
                                                                <button type="button" title="Remove this command" aria-label="Remove this command" onClick={ () => deleteMacro(row.index) }>
                                                                    <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M1.5 1.5l5 5M6.5 1.5l-5 5" /></svg>
                                                                </button>
                                                            </span> }
                                                    </span> }
                                            </div>
                                        )) }
                                    </div>
                                    <button type="button" className="rp-mx-delete" title={ `Delete ${ group.key }` } aria-label={ `Delete ${ group.key }` } onClick={ () => deleteKey(group.key) }>
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
                { (currentTab === 'Roleplay') &&
                    <div className="prp-subnav-layout">
                        <div className="prp-subnav">
                            <div className="prp-subnav-eyebrow">Functions</div>
                            { ROLEPLAY_PAGES.map(page => (
                                <div key={ page }
                                    className={ `prp-subnav-item ${ (roleplayPage === page) ? 'is-active' : '' }` }
                                    onClick={ () => setRoleplayPage(page) }>
                                    { page }
                                </div>
                            )) }
                            { /* future group - links land here as their settings ship */ }
                            <div className="prp-subnav-eyebrow">Interactions</div>
                        </div>
                        <Column center fullHeight gap={ 1 } className="rp-settings-placeholder prp-subnav-page">
                            <Text bold>{ roleplayPage }</Text>
                            <Text className="text-muted">Nothing here yet.</Text>
                        </Column>
                    </div> }
                { (currentTab === 'Social') &&
                    <div className="prp-subnav-layout">
                        <div className="prp-subnav">
                            <div className="prp-subnav-eyebrow">Username</div>
                            { SOCIAL_PAGES.map(page => (
                                <div key={ page }
                                    className={ `prp-subnav-item ${ (socialPage === page) ? 'is-active' : '' }` }
                                    onClick={ () => setSocialPage(page) }>
                                    { page }
                                </div>
                            )) }
                            { /* future group - links land here as their settings ship */ }
                            <div className="prp-subnav-eyebrow">Verification</div>
                            <div className={ `prp-subnav-item ${ (socialPage === 'Discord') ? 'is-active' : '' }` }
                                onClick={ () => setSocialPage('Discord') }>
                                Discord
                            </div>
                        </div>
                        <Column gap={ 2 } className="prp-subnav-page">
                            <>
                                { ((socialPage === 'Color') || (socialPage === 'Icon')) &&
                                <div className="rp-settings-preview">
                                    <Text small className="text-muted">Preview</Text>
                                    <div className="bubble-container" style={ { position: 'relative' } }>
                                        <div className="user-container-bg" style={ { backgroundColor: previewFigure?.color } } />
                                        <div className="chat-bubble bubble-0 type-0" style={ { maxWidth: '100%' } }>
                                            <div className="user-container">
                                                { previewFigure?.imageUrl &&
                                                    <div className="user-image" style={ { backgroundImage: `url(${ previewFigure.imageUrl })` } } /> }
                                            </div>
                                            <div className="chat-content">
                                                { usernameIcon &&
                                                    <b className="username mr-1"><UsernameIconGlyph iconClass={ usernameIcon } />{ ' ' }</b> }
                                                <b className="username mr-1"><span style={ { color: usernameColor } }>{ GetSessionDataManager().userName }</span>{ ': ' }</b>
                                                <span className="message">Welcome to San Francisco!</span>
                                            </div>
                                            <div className="pointer" />
                                        </div>
                                    </div>
                                </div> }
                                { (socialPage === 'Color') &&
                                <div className="rp-settings-stack-section">
                                    <div className="rp-settings-stack-head">
                                        <Text bold>Color</Text>
                                        <Text small className="text-muted">The color of your username in your chat bubbles.</Text>
                                    </div>
                                    <div className="rp-settings-swatches rp-settings-swatches--wide">
                                        { USERNAME_COLORS.map(entry => (
                                            <div key={ entry.key } title={ entry.name }
                                                className={ `rp-settings-swatch ${ (usernameColor === entry.color) ? 'is-selected' : '' }` }
                                                style={ { backgroundColor: entry.color } }
                                                onClick={ () => selectUsernameColor(entry.color) } />
                                        )) }
                                    </div>
                                </div> }
                                { (socialPage === 'Icon') &&
                                <div className="rp-settings-stack-section">
                                    <div className="rp-settings-stack-head">
                                        <Text bold>Icon</Text>
                                        <Text small className="text-muted">An icon before your name in chat.</Text>
                                    </div>
                                    <div className="rp-settings-swatches rp-settings-swatches--wide">
                                        { USERNAME_ICONS.map(entry => (
                                            <div key={ entry.key } title={ entry.name }
                                                className={ `rp-settings-swatch rp-settings-swatch--icon ${ (usernameIcon === (entry.iconClass ?? '')) ? 'is-selected' : '' }` }
                                                onClick={ () => selectUsernameIcon(entry.iconClass ?? '') }>
                                                <UsernameIconGlyph iconClass={ entry.iconClass } />
                                            </div>
                                        )) }
                                    </div>
                                </div> }
                                { (socialPage === 'Discord') &&
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
                                </Column> }
                            </>
                        </Column>
                    </div> }
                { (currentTab === 'General') &&
                    <Column gap={ 2 } className="rp-settings-general">
                        { /* Plain sections rather than a subnav rail: one setting
                             behind a one-item rail reads as scaffolding. Macros is
                             laid out the same way, so the pattern is already here. */ }
                        <div className="rp-settings-section">
                            <div className="rp-settings-section-info">
                                <Text bold>Frame Rate</Text>
                                <Text small className="text-muted">How often the room is allowed to redraw, saved on this computer rather than to your account. The default of 75 keeps walking smooth on any screen - your screen sets the real ceiling, so a 60Hz monitor still draws 60. Lowering it is the lever to pull on an older machine.</Text>
                            </div>
                            <div className="rp-settings-fps">
                                <Text small className="rp-settings-fps-end">{ FPS_MIN }</Text>
                                <input type="range" min={ FPS_MIN } max={ FPS_MAX } step={ 5 } value={ maxFps }
                                    aria-label="Frame rate cap"
                                    onChange={ event => SetMaxFps(parseInt(event.target.value)) } />
                                <Text small className="rp-settings-fps-end">{ FPS_MAX }</Text>
                                <Text small className="rp-settings-fps-value">{ maxFps }</Text>
                            </div>
                        </div>
                        <div className="rp-settings-section">
                            <div className="rp-settings-section-info">
                                <Text bold>Drag the Room</Text>
                                <Text small className="text-muted">Which mouse button pans the room when you click and drag, saved on this computer. On a trackpad, Right click is the one to try: a left click then walks the moment you press, and dragging with two fingers held down pans. A right-click macro still fires on a right click that doesn't move.</Text>
                            </div>
                            <div className="rp-settings-choice" role="radiogroup" aria-label="Drag the room with">
                                { ROOM_DRAG_BUTTONS.map(button => (
                                    <div key={ button } role="radio" aria-checked={ (dragButton === button) }
                                        className={ `rp-settings-choice-option ${ (dragButton === button) ? 'is-selected' : '' }` }
                                        onClick={ () => SetRoomDragButton(button) }>
                                        { ROOM_DRAG_LABELS[button] }
                                    </div>
                                )) }
                            </div>
                        </div>
                    </Column> }
                { (currentTab !== 'General') && (currentTab !== 'UI') && (currentTab !== 'Roleplay') && (currentTab !== 'Social') && (currentTab !== 'Macros') &&
                    <Column center fullHeight gap={ 1 } className="rp-settings-placeholder">
                        <Text bold>{ currentTab }</Text>
                        <Text className="text-muted">Nothing here yet.</Text>
                    </Column> }
            </NitroCardContentView>
        </NitroCardView>
    );
}
