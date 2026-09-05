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

// Keys we refuse to bind ON THEIR OWN. Because a bound key is swallowed before
// the chat input sees it, binding any of these bare would leave the player
// unable to send or delete anything - Enter especially would make chat
// unusable with no obvious way to undo it from inside the client. With a
// modifier they are fine: only the exact combo is swallowed, so CTRL+ENTER
// leaves plain Enter alone. Tab is deliberately not reserved at all: the Macros
// design uses it as an example binding, and swallowing it also stops it tabbing
// focus out of the client. Escape is bindable too (a common macro key on
// other hotels): nothing in the client needs it to send or type, and the
// windows it dismisses all have close buttons.
export const MACRO_RESERVED_KEYS: string[] = [ 'ENTER', 'NUMPADENTER', 'BACKSPACE' ];

// Modifiers are bindable on their own AND act as prefixes for other keys, so
// they need both spellings. Held alone a modifier is a binding; held with
// something else it is that binding's prefix.
export const MACRO_MODIFIER_KEYS: string[] = [ 'CONTROL', 'SHIFT', 'ALT', 'META' ];

const MACRO_MODIFIER_PREFIXES: string[] = [ 'CTRL+', 'SHIFT+', 'ALT+', 'META+' ];

// Left click drives the entire room (walking, clicking avatars and furni), so
// binding it would make the hotel unusable. The other buttons are fair game.
export const MACRO_RESERVED_MOUSE: string[] = [ 'Mouse Left' ];

// Shift changes what a key REPORTS: KeyboardEvent.key for Shift+1 is "!", so a
// binding would read "SHIFT+!" when the player pressed Shift and the 1 key.
// event.code names the physical key instead, so it is unaffected - and for the
// digit row it is the same key on every Latin layout, where the shifted glyph
// is not (Shift+2 is @ on US but " on UK).
//
// Only consulted while Shift is held; unshifted keys already report the glyph
// the player sees on the keycap. Punctuation entries match a US layout, which
// is a limitation rather than a bug: on another layout that physical key still
// binds and still fires, it is only the label that may not match the keycap.
const SHIFTED_CODE_TO_KEY: { [code: string]: string } = {
    Digit1: '1', Digit2: '2', Digit3: '3', Digit4: '4', Digit5: '5',
    Digit6: '6', Digit7: '7', Digit8: '8', Digit9: '9', Digit0: '0',
    Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']',
    Backslash: '\\', Semicolon: ';', Quote: '\'', Comma: ',',
    Period: '.', Slash: '/', Backquote: '`'
};

// The same relationship the other way round, for repairing bindings that were
// stored as the shifted glyph before the above existed.
const SHIFTED_KEY_TO_KEY: { [glyph: string]: string } = {
    '!': '1', '@': '2', '#': '3', '$': '4', '%': '5',
    '^': '6', '&': '7', '*': '8', '(': '9', ')': '0',
    '_': '-', '+': '=', '{': '[', '}': ']', '|': '\\',
    ':': ';', '"': '\'', '<': ',', '>': '.', '?': '/', '~': '`'
};

const MOUSE_BUTTON_NAMES: { [index: number]: string } = {
    0: 'Mouse Left',
    1: 'Mouse Middle',
    2: 'Mouse Right',
    3: 'Mouse 4',
    4: 'Mouse 5'
};

// Modifier prefix in a FIXED order, so Ctrl+Shift+E and Shift+Ctrl+E are the
// same stored binding no matter which was pressed first.
interface ModifierFlags
{
    ctrlKey: boolean;
    shiftKey: boolean;
    altKey: boolean;
    metaKey: boolean;
}

const ModifierPrefix = (event: ModifierFlags): string =>
{
    let prefix = '';

    if(event.ctrlKey) prefix += 'CTRL+';
    if(event.shiftKey) prefix += 'SHIFT+';
    if(event.altKey) prefix += 'ALT+';
    if(event.metaKey) prefix += 'META+';

    return prefix;
};

// Canonical form of a keyboard binding: an optional modifier prefix plus the
// uppercased KeyboardEvent.key, which gives single characters as "`" / "=" and
// named keys as "TAB" / "ARROWLEFT" / "CAPSLOCK" - the vocabulary the Macros tab
// displays. With Shift held the key is taken from event.code instead, so the
// binding names the key the player actually pressed ("SHIFT+1", not "SHIFT+!").
export const NormalizeKeyBinding = (event: KeyboardEvent): string =>
{
    if(!event.key) return '';

    // " " would render as an invisible binding in the list.
    let base = ((event.key === ' ') ? 'SPACE' : event.key.toUpperCase());

    // A modifier held on its own is a binding in its own right, so it never
    // carries a prefix of itself.
    if(MACRO_MODIFIER_KEYS.includes(base)) return base;

    // Letters are unaffected (Shift+K already reports "K"); this only rescues
    // the keys whose glyph changes under Shift.
    if(event.shiftKey && event.code && SHIFTED_CODE_TO_KEY[event.code])
    {
        base = SHIFTED_CODE_TO_KEY[event.code];
    }

    return (ModifierPrefix(event) + base);
};

// Repairs a binding stored as the shifted glyph, from before NormalizeKeyBinding
// consulted event.code: "SHIFT+!" is what the player pressed as Shift and 1, so
// it becomes "SHIFT+1" and starts matching again.
//
// Only bindings that already carry a SHIFT+ prefix are touched. A BARE glyph is
// left alone deliberately - "+" and "*" are reachable on the numpad without
// Shift, so rewriting those would break a working binding to fix a theoretical
// one.
const RepairShiftedBinding = (binding: string): string =>
{
    if(!binding.includes('SHIFT+')) return binding;

    const base = BindingBaseKey(binding);
    const repaired = SHIFTED_KEY_TO_KEY[base];

    if(!repaired) return binding;

    return (binding.substring(0, (binding.length - base.length)) + repaired);
};

export const NormalizeMouseBinding = (button: number, event: ModifierFlags = null): string =>
{
    const name = (MOUSE_BUTTON_NAMES[button] ?? '');

    if(!name.length) return '';

    return ((event ? ModifierPrefix(event) : '') + name);
};

// The binding with its modifier prefix stripped. Peels prefixes one at a time
// rather than splitting on "+", because "+" is itself a bindable key - a naive
// split turns "CTRL++" into an empty base.
export const BindingBaseKey = (binding: string): string =>
{
    let rest = binding;

    for(;;)
    {
        const prefix = MACRO_MODIFIER_PREFIXES.find(candidate => rest.startsWith(candidate));

        if(!prefix) break;

        rest = rest.substring(prefix.length);
    }

    return rest;
};

export const IsModifierOnlyBinding = (binding: string): boolean => MACRO_MODIFIER_KEYS.includes(binding);

export const IsMouseBinding = (binding: string): boolean => BindingBaseKey(binding).startsWith('Mouse ');

export const IsBindingAllowed = (binding: string): boolean =>
{
    if(!binding || !binding.length) return false;

    const base = BindingBaseKey(binding);

    if(!base.length) return false;

    // Left click drives the whole room, and the client has modified left-click
    // gestures of its own, so it stays reserved even with a modifier.
    if(base.startsWith('Mouse ')) return !MACRO_RESERVED_MOUSE.includes(base);

    // Reserved keys are only reserved bare - a combo swallows just that combo.
    if(base === binding) return !MACRO_RESERVED_KEYS.includes(base);

    return true;
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
                            .map(macro => ({ b: RepairShiftedBinding(macro.b), c: macro.c }))
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

// ---- The shared preset format -----------------------------------------------
// What a player copies out of Export and pastes into Import. Deliberately NOT
// the storage shape: storage uses short keys because the emulator validates
// those exact field names (RpSaveMacrosEvent), while this is read by people, so
// it spells them out. Both directions live here so the two formats have a single
// definition and cannot drift apart across two files.
//
//   { "name": "Cop", "macros": [ { "key": "F1", "command": ":ct", "type": 0 } ] }

// Reserved marker. Always written as 0, and ignored on import whatever it says.
// It exists so a later format change can be told apart from exports made now.
const EXPORT_MACRO_TYPE = 0;

export const SerializePresetForExport = (preset: MacroPreset): string => JSON.stringify({
    name: preset.name,
    macros: preset.macros.map(macro => ({ key: macro.b, command: macro.c, type: EXPORT_MACRO_TYPE }))
}, null, 2);

export interface ImportedPreset
{
    name: string;
    macros: MacroBinding[];
    // Rows dropped because they were unusable or refused, so the UI can say so
    // rather than silently importing fewer macros than the file listed.
    skipped: number;
}

// Other hotels spell bindings their own way. HabRP exports the raw
// KeyboardEvent.key ("4", "`", "q", "Shift+1"); other clients write
// event.code ("Digit4", "KeyQ", "Backquote") or friendly names ("Space",
// "Esc", "Ctrl+Q"). All of those become this client's canonical form - fixed
// modifier order, uppercased base, the digit-row glyph repaired under Shift -
// so a pasted file just works instead of importing bindings that never fire.
const IMPORT_MODIFIER_WORDS: { [word: string]: keyof ModifierFlags } = {
    CTRL: 'ctrlKey', CONTROL: 'ctrlKey',
    SHIFT: 'shiftKey',
    ALT: 'altKey', OPTION: 'altKey',
    META: 'metaKey', CMD: 'metaKey', COMMAND: 'metaKey', WIN: 'metaKey', WINDOWS: 'metaKey', SUPER: 'metaKey'
};

const IMPORT_KEY_ALIASES: { [name: string]: string } = {
    ' ': 'SPACE', SPACEBAR: 'SPACE',
    ESC: 'ESCAPE', RETURN: 'ENTER', DEL: 'DELETE', INS: 'INSERT',
    PGUP: 'PAGEUP', PGDN: 'PAGEDOWN', PGDOWN: 'PAGEDOWN',
    UP: 'ARROWUP', DOWN: 'ARROWDOWN', LEFT: 'ARROWLEFT', RIGHT: 'ARROWRIGHT',
    BACKQUOTE: '`', MINUS: '-', EQUAL: '=', BRACKETLEFT: '[', BRACKETRIGHT: ']',
    BACKSLASH: '\\', SEMICOLON: ';', QUOTE: '\'', COMMA: ',', PERIOD: '.', SLASH: '/',
    MOUSE1: 'Mouse Left', MOUSE2: 'Mouse Right', MOUSE3: 'Mouse Middle', MOUSE4: 'Mouse 4', MOUSE5: 'Mouse 5',
    MOUSELEFT: 'Mouse Left', MOUSERIGHT: 'Mouse Right', MOUSEMIDDLE: 'Mouse Middle',
    MMB: 'Mouse Middle', RMB: 'Mouse Right', LMB: 'Mouse Left'
};

export const NormalizeImportedBinding = (raw: string): string =>
{
    let rest = (raw ?? '').trim();

    if(!rest.length) return '';

    // already in this client's shape (a preset exported from here)
    if(rest.startsWith('Mouse ')) return rest;

    const flags: ModifierFlags = { ctrlKey: false, shiftKey: false, altKey: false, metaKey: false };

    // Peel "Ctrl+", "shift +", "CMD+" prefixes in any order and case. A prefix
    // only counts when something follows it, so "+" alone stays a key.
    for(;;)
    {
        const match = rest.match(/^([A-Za-z]+)\s*\+\s*(.+)$/s);

        if(!match) break;

        const flag = IMPORT_MODIFIER_WORDS[match[1].toUpperCase()];

        if(!flag) break;

        flags[flag] = true;
        rest = match[2];
    }

    let base = rest;

    // event.code spellings: "Digit4" -> "4", "KeyQ" -> "Q", "Numpad7" -> "7", "F1" stays
    const codeMatch = base.match(/^(?:Digit|Key|Numpad)([A-Za-z0-9])$/);

    if(codeMatch) base = codeMatch[1];

    const alias = (IMPORT_KEY_ALIASES[base.toUpperCase()] ?? IMPORT_KEY_ALIASES[base]);

    if(alias) base = alias;

    // a bare modifier word is a binding in its own right ("Shift")
    if(!base.startsWith('Mouse ')) base = base.toUpperCase();

    if(MACRO_MODIFIER_KEYS.includes(base)) return base;

    return RepairShiftedBinding(ModifierPrefix(flags) + base);
};

// null means the text is not a preset at all. Anything past that is imported as
// far as it can be, reporting what it had to drop.
export const ParseExportedPreset = (text: string): ImportedPreset =>
{
    if(!text || !text.trim().length) return null;

    let parsed: any = null;

    try
    {
        parsed = JSON.parse(text);
    }
    catch
    {
        return null;
    }

    // a bare array of macros is a preset with no name
    if(Array.isArray(parsed)) parsed = { macros: parsed };

    if(!parsed || (typeof parsed !== 'object')) return null;
    if(!Array.isArray(parsed.macros)) return null;

    const name = (((typeof parsed.name === 'string') && parsed.name.trim().length)
        ? parsed.name.trim().substring(0, MACRO_MAX_NAME_LENGTH)
        : 'Imported');

    const macros: MacroBinding[] = [];
    let skipped = 0;

    for(const entry of parsed.macros)
    {
        if(macros.length >= MACRO_MAX_PER_PRESET)
        {
            skipped++;

            continue;
        }

        // "key"/"command" is the documented shape. "b"/"c" is tolerated as well
        // because it is what the raw saved value looks like, and someone pasting
        // that deserves it to work rather than a puzzling refusal.
        const rawBinding = ((entry && (typeof entry.key === 'string')) ? entry.key : ((entry && (typeof entry.b === 'string')) ? entry.b : ''));
        const command = ((entry && (typeof entry.command === 'string')) ? entry.command : ((entry && (typeof entry.c === 'string')) ? entry.c : ''));
        // another hotel's spelling of the key becomes ours (see NormalizeImportedBinding)
        const binding = NormalizeImportedBinding(rawBinding);

        if(!binding.trim().length || !command.trim().length)
        {
            skipped++;

            continue;
        }

        // A shared file could carry a binding this client refuses - Enter, or
        // Mouse Left. Importing one would hand the player a macro that either
        // cannot fire or breaks chat, so drop it here rather than store it.
        if(!IsBindingAllowed(binding.trim()))
        {
            skipped++;

            continue;
        }

        // First binding wins, matching how the active preset is flattened.
        if(macros.some(existing => (existing.b === binding.trim())))
        {
            skipped++;

            continue;
        }

        macros.push({ b: binding.trim(), c: command.trim().substring(0, MACRO_MAX_COMMAND_LENGTH) });
    }

    return { name, macros, skipped };
};

// An imported preset must not take a name already in use, or the picker would
// have two entries that look identical and one would be unreachable.
export const UniquePresetName = (name: string, taken: string[]): string =>
{
    if(!taken.includes(name)) return name;

    for(let suffix = 2; suffix < 100; suffix++)
    {
        // Keep room for the suffix rather than overflowing the length cap.
        const trimmed = name.substring(0, (MACRO_MAX_NAME_LENGTH - (` ${ suffix }`).length));
        const candidate = `${ trimmed } ${ suffix }`;

        if(!taken.includes(candidate)) return candidate;
    }

    return name;
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
