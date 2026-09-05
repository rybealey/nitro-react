import { AvatarFigurePartType, AvatarScaleType, AvatarSetType, ILinkEventTracker, RpDiscordStatusEvent, RpDiscordUnlinkComposer, RpGetDiscordStatusComposer, RpMacrosEvent, RpUiSettingsEvent } from '@nitrots/nitro-renderer';
import { RpSaveMacrosComposer, RpSaveUiSettingsComposer } from '@nitrots/nitro-renderer';
import { FC, PointerEvent as ReactPointerEvent, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FaTrash } from 'react-icons/fa';
import { AddEventLinkTracker, GetAvatarRenderManager, GetSessionDataManager, RemoveLinkEventTracker, SendMessageComposer } from '../../api';
import { Column, Flex, NitroCardContentView, NitroCardHeaderView, NitroCardTabsItemView, NitroCardTabsView, NitroCardView, Text } from '../../common';
import { useMessageEvent } from '../../hooks';
import { ApplyUiChrome, CHROME_OPACITY_STEPS, CHROME_SCHEMES, ChromeSwatchColor, DEFAULT_CHROME_COLOR, DEFAULT_CHROME_OPACITY, DEFAULT_HEADER_KEY, HEADER_SCHEMES, IsValidChromeColor, IsValidHeaderKey } from './UiChrome';
import { DEFAULT_USERNAME_COLOR, IsValidUsernameColor, USERNAME_COLORS } from './UsernameColors';
import { DEFAULT_USERNAME_ICON, IsValidUsernameIcon, USERNAME_ICONS } from './IconChoices';
import { UsernameIconGlyph } from './UsernameIconGlyph';
import { ApplyMacroState, EmptyMacroDocument, IsBindingAllowed, IsModifierOnlyBinding, IsMouseBinding, MACRO_MAX_COMMAND_LENGTH, MACRO_MAX_NAME_LENGTH, MACRO_MAX_PER_PRESET, MACRO_MAX_PRESETS, MacroBinding, MacroDocument, NormalizeKeyBinding, NormalizeMouseBinding, ParseExportedPreset, ParseMacroDocument, SerializeMacroDocument, SerializePresetForExport, UniquePresetName } from './MacroState';

// PixelRP settings window, opened from the side drawer's Settings button
// (CreateLinkEvent('rp-settings/toggle')). Tabs beyond Interface are
// placeholders to be filled out as settings are decided.
const TABS: string[] = [ 'General', 'Macros', 'Social', 'Roleplay', 'UI' ];

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
    // Row index currently being dragged, or null. The list reorders live as the
    // pointer crosses row midpoints, so this tracks where the held row is NOW.
    const [ macroDragIndex, setMacroDragIndex ] = useState<number>(null);
    const macroListRef = useRef<HTMLDivElement>(null);
    const macroDragStart = useRef<{ index: number, y: number }>(null);
    // The order being built up during a drag. A ref, not state, because each
    // pointermove reads the previous order and a state read would lag a frame.
    const macroDragOrder = useRef<MacroBinding[]>(null);
    // 'export' | 'import' | null. One at a time; both are the same overlay.
    const [ macroDialog, setMacroDialog ] = useState<string>(null);
    const [ importText, setImportText ] = useState<string>('');
    // Shown on the Copy button for a moment after a successful copy.
    const [ exportCopied, setExportCopied ] = useState<boolean>(false);
    const exportTextRef = useRef<HTMLTextAreaElement>(null);
    const [ currentTab, setCurrentTab ] = useState<string>(TABS[0]);
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
        applyMacrosLocally(next);
        SendMessageComposer(new RpSaveMacrosComposer(SerializeMacroDocument(next)));
    };

    // Same as commitMacros without the save. Used while a row is being dragged:
    // the order changes on every midpoint crossing, and sending each one would
    // be a packet per pixel - the drop saves once.
    const applyMacrosLocally = (next: MacroDocument) =>
    {
        setMacroDoc(next);
        ApplyMacroState(next);
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

        // Rebinding an in-use key replaces it rather than adding a second row
        // for the same key, which would leave one of them permanently dead.
        const macros = activePreset.macros
            .filter(macro => (macro.b !== capturedBinding))
            .concat([ { b: capturedBinding, c: command.substring(0, MACRO_MAX_COMMAND_LENGTH) } ]);

        replaceActivePreset(macros);
        setCapturedBinding(null);
        setDraftCommand('');
    };

    const deleteMacro = (index: number) =>
    {
        if(!activePreset) return;

        replaceActivePreset(activePreset.macros.filter((macro, position) => (position !== index)));
    };

    const moveMacro = (index: number, offset: number) =>
    {
        if(!activePreset) return;

        const target = (index + offset);

        if((target < 0) || (target >= activePreset.macros.length)) return;

        const macros = activePreset.macros.slice();
        const [ moved ] = macros.splice(index, 1);

        macros.splice(target, 0, moved);
        replaceActivePreset(macros);
    };

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
    // and drop targets fight both. This is the same approach the phone's home
    // screen uses for reordering app tiles.

    const withActiveMacros = (macros: MacroBinding[]): MacroDocument => ({
        ...macroDoc,
        presets: macroDoc.presets.map(preset => ((preset.name === (activePreset ? activePreset.name : '')) ? { ...preset, macros } : preset))
    });

    // Which slot the pointer is over, by row midpoints. Read from the DOM so it
    // stays correct as the list reorders under the cursor mid-drag.
    const macroRowAt = (clientY: number): number =>
    {
        const list = macroListRef.current;

        if(!list) return -1;

        const rows = Array.from(list.querySelectorAll('[data-macro-index]')) as HTMLElement[];

        for(let index = 0; index < rows.length; index++)
        {
            const rect = rows[index].getBoundingClientRect();

            if(clientY < (rect.top + (rect.height / 2))) return index;
        }

        return (rows.length - 1);
    };

    const onMacroPointerDown = (event: ReactPointerEvent<HTMLDivElement>, index: number) =>
    {
        // Move and Delete live inside the row; a press on either is a click,
        // not the start of a drag.
        if((event.target as HTMLElement).closest('.rp-macros-btn')) return;
        if(!activePreset) return;

        try
        {
            event.currentTarget.setPointerCapture(event.pointerId);
        }
        catch(error)
        {}

        macroDragStart.current = { index, y: event.clientY };
        macroDragOrder.current = activePreset.macros.slice();
    };

    const onMacroPointerMove = (event: ReactPointerEvent<HTMLDivElement>) =>
    {
        const start = macroDragStart.current;

        if(!start || !macroDragOrder.current) return;

        // A few pixels of slack, so a sloppy click on a row is not a reorder.
        if(macroDragIndex === null)
        {
            if(Math.abs(event.clientY - start.y) <= 4) return;

            setMacroDragIndex(start.index);

            return;
        }

        const target = macroRowAt(event.clientY);

        if((target < 0) || (target === macroDragIndex)) return;

        const macros = macroDragOrder.current.slice();
        const [ moved ] = macros.splice(macroDragIndex, 1);

        macros.splice(target, 0, moved);
        macroDragOrder.current = macros;
        setMacroDragIndex(target);
        applyMacrosLocally(withActiveMacros(macros));
    };

    const onMacroPointerUp = () =>
    {
        const wasDragging = (macroDragIndex !== null);
        const order = macroDragOrder.current;

        macroDragStart.current = null;
        macroDragOrder.current = null;
        setMacroDragIndex(null);

        // Only the drop saves, and only if the order actually moved.
        if(wasDragging && order) commitMacros(withActiveMacros(order));
    };

    const clearDraft = () =>
    {
        setCapturedBinding(null);
        setDraftCommand('');
        setIsCapturing(false);
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

                return;
            }

            setCapturedBinding(binding);
            setIsCapturing(false);
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
    }, [ isCapturing ]);

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
        <NitroCardView resizable uniqueKey="rp-settings" className="rp-settings-window" theme="primary-slim">
            <NitroCardHeaderView headerText="Settings" onCloseClick={ () => setIsVisible(false) } />
            <NitroCardTabsView>
                { TABS.map(tab => (
                    <NitroCardTabsItemView key={ tab } isActive={ currentTab === tab } onClick={ () => setCurrentTab(tab) }>
                        { tab }
                    </NitroCardTabsItemView>
                )) }
            </NitroCardTabsView>
            <NitroCardContentView className="text-black">
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
                        <div className="rp-settings-section rp-macros-bar">
                            { /* Preset leads the row so it lines up with "Click to
                                 bind" below - both bands carry the same 4px inset.
                                 The switch sits directly after the picker; both are
                                 the same 30px box, so they align exactly. */ }
                            <Flex alignItems="center" gap={ 2 }>
                                <span className="rp-macros-preset-label">Preset</span>
                                { (presetDraft === null) &&
                                    <div className="rp-macros-select-wrap">
                                        <div className="rp-macros-select" onClick={ () => setPresetOpen(value => !value) }>
                                            <span>{ activePreset ? activePreset.name : '' }</span>
                                            <i className="rp-macros-caret" />
                                        </div>
                                        { presetOpen &&
                                            <div className="rp-macros-select-menu">
                                                { macroDoc.presets.map(preset => (
                                                    <div key={ preset.name }
                                                        className={ `rp-macros-select-option ${ (preset.name === macroDoc.active) ? 'is-active' : '' }` }
                                                        onClick={ () => selectPreset(preset.name) }>
                                                        { preset.name }
                                                    </div>
                                                )) }
                                            </div> }
                                    </div> }
                                { /* Inline name entry: the design has no dialog for
                                     creating a preset, so New swaps the picker for a
                                     field and Enter or blur commits it. */ }
                                { (presetDraft !== null) &&
                                    <input autoFocus type="text" className="rp-macros-input rp-macros-preset-input"
                                        placeholder="Preset name" aria-label="New preset name"
                                        maxLength={ MACRO_MAX_NAME_LENGTH } value={ presetDraft }
                                        onChange={ event => setPresetDraft(event.target.value) }
                                        onBlur={ savePresetDraft }
                                        onKeyDown={ event =>
                                        {
                                            if(event.key === 'Enter') savePresetDraft();
                                            if(event.key === 'Escape') setPresetDraft(null);
                                        } } /> }
                                <div className="rp-macros-switch-wrap">
                                    <div className={ `rp-macros-switch ${ macroDoc.enabled ? 'is-on' : '' }` } role="switch"
                                        aria-checked={ macroDoc.enabled } aria-label="Macros enabled"
                                        onClick={ () => commitMacros({ ...macroDoc, enabled: !macroDoc.enabled }) }><span /></div>
                                    <span className={ `rp-macros-switch-label ${ macroDoc.enabled ? 'is-on' : 'is-off' }` }>{ macroDoc.enabled ? 'On' : 'Off' }</span>
                                </div>
                            </Flex>
                            <Flex alignItems="center" gap={ 2 }>
                                <div className="rp-macros-btn rp-macros-btn--accent" onClick={ newPreset }>New</div>
                                <div className="rp-macros-btn" onClick={ () => { setExportCopied(false); openMacroDialog('export'); } }>Export</div>
                                <div className="rp-macros-btn" onClick={ () => { setImportText(''); openMacroDialog('import'); } }>Import</div>
                                { /* Deleting the preset belongs with the other
                                     preset-level actions, and sits last so the
                                     destructive one is not next to New. */ }
                                <div className="rp-macros-btn rp-macros-btn--danger rp-macros-trash"
                                    title="Delete this preset" aria-label="Delete this preset"
                                    onClick={ deleteActivePreset }><FaTrash /></div>
                            </Flex>
                        </div>
                        { /* new-macro row: capture a key or mouse button, type the
                             command, Add. The trash deletes the whole preset. */ }
                        <Flex alignItems="center" gap={ 2 } className="rp-macros-new">
                            <div className={ `rp-macros-btn rp-macros-bind ${ isCapturing ? 'is-capturing' : '' }` }
                                onClick={ () => setIsCapturing(true) }>
                                { isCapturing
                                    ? (capturePrefix.length ? `${ capturePrefix }...` : 'Press any key')
                                    : (capturedBinding ?? 'Click to bind') }
                            </div>
                            <input type="text" className="rp-macros-input" placeholder="Type command" aria-label="Macro command"
                                maxLength={ MACRO_MAX_COMMAND_LENGTH } value={ draftCommand }
                                onChange={ event => setDraftCommand(event.target.value) }
                                onKeyDown={ event => (event.key === 'Enter') && addMacro() } />
                            <div className="rp-macros-btn" onClick={ addMacro }>Add</div>
                            <div className="rp-macros-btn" title="Clear the binding and command"
                                onClick={ clearDraft }>Clear</div>
                        </Flex>
                        { (macroNotice.length > 0) &&
                            <Text className="text-muted">{ macroNotice }</Text> }
                        <div ref={ macroListRef } className="rp-macros-list">
                            { /* index keys: the same binding can legitimately appear twice
                                 while a player is mid-edit, so the binding is not unique */ }
                            { activePreset && activePreset.macros.map((row, index) => (
                                <div key={ index } data-macro-index={ index }
                                    className={ `rp-macros-row ${ (macroDragIndex === index) ? 'is-dragging' : '' }` }
                                    onPointerDown={ event => onMacroPointerDown(event, index) }
                                    onPointerMove={ onMacroPointerMove }
                                    onPointerUp={ onMacroPointerUp }
                                    onPointerCancel={ onMacroPointerUp }>
                                    <div className="rp-macros-binding" title={ row.b }>{ row.b }</div>
                                    <div className="rp-macros-command">{ row.c }</div>
                                    <div className="rp-macros-btn rp-macros-btn--sm rp-macros-move">
                                        Move
                                        <span className="rp-macros-move-arrows">
                                            <i className="is-up" title="Move up" onClick={ () => moveMacro(index, -1) } />
                                            <i className="is-down" title="Move down" onClick={ () => moveMacro(index, 1) } />
                                        </span>
                                    </div>
                                    <div className="rp-macros-btn rp-macros-btn--sm rp-macros-btn--danger"
                                        onClick={ () => deleteMacro(index) }>Delete</div>
                                </div>
                            )) }
                            { activePreset && !activePreset.macros.length &&
                                <Text className="text-muted">No macros in this preset yet.</Text> }
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
                { (currentTab !== 'UI') && (currentTab !== 'Roleplay') && (currentTab !== 'Social') && (currentTab !== 'Macros') &&
                    <Column center fullHeight gap={ 1 } className="rp-settings-placeholder">
                        <Text bold>{ currentTab }</Text>
                        <Text className="text-muted">Nothing here yet.</Text>
                    </Column> }
            </NitroCardContentView>
        </NitroCardView>
    );
}
