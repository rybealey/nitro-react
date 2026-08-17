// Per-session "clickthrough" toggle (the :ct chat command). When enabled,
// clicking another user walks you onto their exact tile instead of opening their
// context menu. A plain module singleton: it is read live inside the room click
// handler and flipped by the command, so no React state/reactivity is needed.
export const ClickthroughState = { enabled: false };

// Also expose the live singleton on globalThis so the nitro-renderer (which can't
// import client modules) can read the toggle in its yarn patch — it suppresses the
// hover pointer over players while clickthrough is on. Same object reference, so
// reads see the current `enabled` value.
(globalThis as any).__pixelrpClickthrough = ClickthroughState;
