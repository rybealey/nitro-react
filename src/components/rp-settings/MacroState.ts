// PixelRP macros: a player's key and mouse bindings, each firing a chat
// command. Saved server-side (RpSaveMacrosComposer / RpMacrosEvent) rather than
// in localStorage, so they follow the player to any browser or machine.
//
// The settings window owns the editing state; this module holds the resolved
// lookup that the chat input's key and mouse handlers read on every event.
// A plain module singleton, exactly like targetState.ts, because those handlers
// are plain DOM listeners rather than React consumers - they must see the
// current bindings without a re-render or a stale closure.

export interface MacroBinding
{
    // Short keys: this shape goes over the wire and into the DB as JSON, and
    // the emulator validates these exact field names (RpSaveMacrosEvent).
    b: string;
    c: string;
}

export interface MacroPreset
{
    name: string;
    macros: MacroBinding[];
}

export interface MacroDocument
{
    v: number;
    enabled: boolean;
    active: string;
    presets: MacroPreset[];
}

// Limits mirrored from the emulator's RpSaveMacrosEvent. Enforced here too so
// the UI can refuse politely instead of silently having a save clamped.
export const MACRO_MAX_PRESETS = 8;
export const MACRO_MAX_PER_PRESET = 40;
export const MACRO_MAX_NAME_LENGTH = 24;
export const MACRO_MAX_COMMAND_LENGTH = 128;

export const MACRO_DEFAULT_PRESET_NAME = 'Default';

// Keys we refuse to bind. Because bound keys are swallowed before the chat
// input sees them, binding any of these would leave the player unable to send
// or dismiss anything - Enter especially would make chat unusable with no
// obvious way to undo it from inside the client. Tab is deliberately NOT
// reserved: the Macros design uses it as an example binding, and swallowing it
// also stops it tabbing focus out of the client.
export const MACRO_RESERVED_KEYS: string[] = [ 'ENTER', 'NUMPADENTER', 'ESCAPE', 'BACKSPACE' ];

// Left click drives the entire room (walking, clicking avatars and furni), so
// binding it would make the hotel unusable. The other buttons are fair game.
export const MACRO_RESERVED_MOUSE: string[] = [ 'Mouse Left' ];

const MOUSE_BUTTON_NAMES: { [index: number]: string } = {
    0: 'Mouse Left',
    1: 'Mouse Middle',
    2: 'Mouse Right',
    3: 'Mouse 4',
    4: 'Mouse 5'
};

// Canonical form of a keyboard binding. Uppercased KeyboardEvent.key, which
// gives single characters as "`" / "=" and named keys as "TAB" / "ARROWLEFT" /
// "CAPSLOCK" - the same vocabulary the Macros tab displays.
export const NormalizeKeyBinding = (event: KeyboardEvent): string =>
{
    if(!event.key) return '';

    // " " would render as an invisible binding in the list.
    if(event.key === ' ') return 'SPACE';

    return event.key.toUpperCase();
};

export const NormalizeMouseBinding = (button: number): string => (MOUSE_BUTTON_NAMES[button] ?? '');

export const IsMouseBinding = (binding: string): boolean => binding.startsWith('Mouse ');

export const IsBindingAllowed = (binding: string): boolean =>
{
    if(!binding || !binding.length) return false;

    if(IsMouseBinding(binding)) return !MACRO_RESERVED_MOUSE.includes(binding);

    return !MACRO_RESERVED_KEYS.includes(binding);
};

// Live state for the DOM handlers in ChatInputView. `bindings` is the ACTIVE
// preset flattened to binding -> command; rebuilt by the settings window
// whenever the macros, the active preset or the master switch change.
export const MacroState = {
    enabled: false,
    bindings: new Map<string, string>()
};

export const ApplyMacroState = (document: MacroDocument): void =>
{
    MacroState.bindings.clear();
    MacroState.enabled = document.enabled;

    const preset = document.presets.find(entry => (entry.name === document.active)) ?? document.presets[0] ?? null;

    if(!preset) return;

    for(const macro of preset.macros)
    {
        if(!macro.b || !macro.c) continue;

        // First binding wins: a duplicate can exist transiently while the
        // player is mid-edit, and firing two commands from one key is worse
        // than quietly honouring the earlier row.
        if(MacroState.bindings.has(macro.b)) continue;

        MacroState.bindings.set(macro.b, macro.c);
    }
};

export const EmptyMacroDocument = (): MacroDocument => ({
    v: 1,
    enabled: true,
    active: MACRO_DEFAULT_PRESET_NAME,
    presets: [ { name: MACRO_DEFAULT_PRESET_NAME, macros: [] } ]
});

// Parses what the server sent. An empty string means "nothing ever saved" -
// distinct from a saved-but-empty document - so a fresh account gets a starter
// preset instead of an unusable empty picker.
export const ParseMacroDocument = (payload: string): MacroDocument =>
{
    if(!payload || !payload.length) return EmptyMacroDocument();

    try
    {
        const parsed = JSON.parse(payload);

        if(!parsed || (typeof parsed !== 'object')) return EmptyMacroDocument();

        const presets: MacroPreset[] = Array.isArray(parsed.presets)
            ? parsed.presets
                .filter(preset => (preset && (typeof preset.name === 'string') && preset.name.length))
                .map(preset => ({
                    name: preset.name,
                    macros: Array.isArray(preset.macros)
                        ? preset.macros
                            .filter(macro => (macro && (typeof macro.b === 'string') && (typeof macro.c === 'string') && macro.b.length && macro.c.length))
                            .map(macro => ({ b: macro.b, c: macro.c }))
                        : []
                }))
            : [];

        // A document with no usable preset cannot be edited (nothing to add a
        // macro to), so fall back rather than render a dead tab.
        if(!presets.length) return EmptyMacroDocument();

        const active = ((typeof parsed.active === 'string') && presets.some(preset => (preset.name === parsed.active)))
            ? parsed.active
            : presets[0].name;

        return { v: 1, enabled: (parsed.enabled !== false), active, presets };
    }
    catch
    {
        // Corrupt row: better a working default than a broken tab.
        return EmptyMacroDocument();
    }
};

export const SerializeMacroDocument = (document: MacroDocument): string => JSON.stringify({
    v: 1,
    enabled: document.enabled,
    active: document.active,
    presets: document.presets.map(preset => ({
        name: preset.name,
        macros: preset.macros.map(macro => ({ b: macro.b, c: macro.c }))
    }))
});
