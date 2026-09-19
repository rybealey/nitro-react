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

// GangAlertCommand writes every alert as "[sender]: message", and the whisper
// it rides is addressed to the RECIPIENT's own avatar - so without this the
// bubble reads "You: [Ryan]: hello", naming two people and crediting the wrong
// one. Lift the sender out and the line becomes "[GA] Ryan: hello".
//
// Anchored to a leading bracket, and a username cannot contain ']', so the
// first "]:" is the boundary. Safe to run on the FORMATTED text: the formatter
// only HTML-encodes <, & and characters above  , none of which appear in
// "[name]: ", and its colour-tag branch needs a leading '@'.
//
// Returns null for anything that does not match, so a line that somehow lacks
// the prefix is left exactly as it arrived rather than mangled.
export const GANG_ALERT_PREFIX = '[GA]';

export const ParseGangAlert = (text: string): { sender: string; message: string } =>
{
    if(!text) return null;

    const match = /^\[([^\]]+)\]:\s?([\s\S]*)$/.exec(text);

    if(!match) return null;

    return { sender: match[1], message: match[2] };
}
