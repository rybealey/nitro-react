// PixelRP: which chat bubbles are NARRATED, and how their text is rendered.
//
// A narrated bubble reads "*Yavn slaps twist across the face*" - the actor's
// name sits INSIDE the asterisks - rather than "Yavn: *slaps twist across the
// face*". The server never puts the name in the text (it would print twice);
// the client moves the opening marker ahead of the name instead.
//
// Shared, because two surfaces render the same bubble: the in-room bubble and
// the Chat History window. They have to agree exactly, and they only do that
// if the rule lives in one place.

// Chat styles whose asterisk-wrapped messages render as an action: 4 is the
// blue combat/police bubble, 5 the yellow one used when a backpack item is
// consumed (and when a pet levels up), 23 the staff action bubble
// (:superhire and friends).
const ACTION_BUBBLE_STYLES: number[] = [ 4, 5, 23 ];

// Relationship bubbles are their own family, not combat: 16 carries the social
// commands (:hug, :kiss, :bite). They narrate the same way, so they get the
// same "*Name does a thing*" treatment - kept in a separate list because they
// are not action bubbles and should not inherit whatever those grow into.
const RELATIONSHIP_BUBBLE_STYLES: number[] = [ 16 ];

const NARRATED_BUBBLE_STYLES: number[] = [ ...ACTION_BUBBLE_STYLES, ...RELATIONSHIP_BUBBLE_STYLES ];

/**
 * Tested on the RAW text, not the formatted one: the asterisk test is what
 * makes this safe, since any of these styles may also be a player-selectable
 * chat style and ordinary chat in one must stay plain.
 */
export const IsNarratedBubble = (styleId: number, text: string): boolean =>
    (NARRATED_BUBBLE_STYLES.includes(styleId) && !!text && text.startsWith('*') && text.endsWith('*'));

/** The opening "*" moves ahead of the username, so the message loses it. */
export const NarratedBubbleText = (formattedText: string): string =>
    (formattedText ? formattedText.substring(1) : formattedText);
