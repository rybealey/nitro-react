// Per-session "clickthrough" toggle (the :ct chat command). When enabled,
// clicking another user walks you to the tile directly behind them instead of
// opening their context menu. A plain module singleton: it is read live inside
// the room click handler and flipped by the command, so no React state/reactivity
// is needed.
export const ClickthroughState = { enabled: false };
