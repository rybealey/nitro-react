// The player's currently selected HUD target (see PlayerHudWidgetView), exposed
// as a plain module singleton for non-React consumers — the chat input reads it
// live when expanding the "@x" target-mention shorthand. Mirrors the widget's
// React state; null when no target is selected.
export const TargetState = { name: null as string | null };
