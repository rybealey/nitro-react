// The player's currently selected HUD target (see PlayerHudWidgetView), exposed
// as a plain module singleton for non-React consumers — the chat input reads it
// live when expanding the "@x" target-mention shorthand. Mirrors the widget's
// React state; null when no target is selected. The lock action lets client
// commands reuse the HUD's lock state instead of maintaining a second copy.
export const TargetState = {
    name: null as string | null,
    toggleLock: null as (() => boolean | null) | null
};
