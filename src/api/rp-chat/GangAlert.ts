// PixelRP: is this incoming chat line a gang alert (:ga)?
//
// Unlike a mention, the bubble alone IS the whole answer. 200 has no row in
// room_chat_styles, so no player can pick it in the style selector or speak in
// it with :bubble - only GangAlertCommand sends it. Compare the note in
// Mention.ts, where style 25 needed the username matched in the text as well
// precisely because anybody could choose that bubble.
//
// Shared so the room and the Chat History window cannot disagree about what
// counts as gang chat.
export const GANG_ALERT_BUBBLE_STYLE: number = 200;

export const IsGangAlert = (styleId: number): boolean => (styleId === GANG_ALERT_BUBBLE_STYLE);
