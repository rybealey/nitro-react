// Server-authoritative station state (see JukeboxStore / JukeboxAudioEngine,
// which owns the packet). Kept as the room panel's entry point.
export { useJukeboxState as useJukebox } from './JukeboxStore';
export type { JukeboxCurrent, JukeboxQueueEntry } from './JukeboxStore';
