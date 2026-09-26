import { ParseGangAlert } from './GangAlert';

// PixelRP: is this incoming chat line a staff alert (:sa)?
//
// The gang alert's rules exactly (see GangAlert.ts), on its own bubble. 201 has
// no row in room_chat_styles, so no player can pick it or speak in it with
// :bubble - only StaffAlertCommand sends it, and only to staff. The bubble
// alone is the whole test.
//
// Shared so the room and the Chat History window cannot disagree about what
// counts as staff chat.
export const STAFF_ALERT_BUBBLE_STYLE: number = 201;

// The rank :sa is sent to, and the rank that sees the Staff tab. The server
// holds the real line (StaffAlertCommand.MinimumRank); this only decides
// whether an empty tab is worth showing.
export const STAFF_ALERT_MIN_RANK: number = 5;

export const IsStaffAlert = (styleId: number): boolean => (styleId === STAFF_ALERT_BUBBLE_STYLE);

export const STAFF_ALERT_PREFIX = '[Staff]';

// The same "[sender]: message" split gang alerts use - see GangAlert.ts.
export const ParseStaffAlert = ParseGangAlert;
