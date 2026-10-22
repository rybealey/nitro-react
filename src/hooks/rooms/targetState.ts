import { PresentUser } from '../../api/rp-chat/RpUserPresence';

// The player's currently selected HUD target (see PlayerHudWidgetView), exposed
// as a plain module singleton for non-React consumers — the chat input reads it
// live when expanding the "@x" target-mention shorthand. Mirrors the widget's
// React state; null when no target is selected. The lock action lets client
// commands reuse the HUD's lock state instead of maintaining a second copy.

// Outcome of a ":t" selection attempt. Three cases, because the command
// whispers something different for each: it landed, it was refused because
// a lock is held, or nobody by that name is in the room.
export type TargetSelectResult =
    | { status: 'selected', name: string }
    | { status: 'locked', name: string }
    | { status: 'missing' };

export const TargetState = {
    // The target's name - what "x" and "@x" expand to. A bot's is its shown
    // "bot-Name", which no player can have, so a command reads it as a bot.
    name: null as string | null,
    // Any target's name, bots included - only for the :t / :lt whispers.
    label: null as string | null,
    toggleLock: null as (() => boolean | null) | null,
    lockByName: null as ((name: string) => string | null) | null,
    // ":t" - select only. Never touches the lock, and refuses outright while
    // one is held, so a mistyped name cannot quietly steal a deliberate pin.
    selectByName: null as ((name: string) => TargetSelectResult) | null,
    // pixelrp: the same two for a player in another room, as the server
    // described them (RpUserPresence) - :t and :lt reach them wherever they are.
    selectRemote: null as ((user: PresentUser) => TargetSelectResult) | null,
    lockRemote: null as ((user: PresentUser) => string | null) | null
};
