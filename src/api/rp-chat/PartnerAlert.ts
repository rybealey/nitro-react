import { ParseGangAlert } from './GangAlert';

// PixelRP: is this incoming chat line partner chat (:pa)?
//
// The bubble alone is the answer, as for gang alerts (GangAlert.ts): 202 has
// no row in room_chat_styles, so only PartnerAlertCommand sends it. Its art is
// the pink bubble 16 without its hearts (RpChatBubbleStyles.scss); players can
// pick 16 itself, hence an id of its own.
export const PARTNER_ALERT_BUBBLE_STYLE: number = 202;

export const IsPartnerAlert = (styleId: number): boolean => (styleId === PARTNER_ALERT_BUBBLE_STYLE);

// The server writes a partner line exactly as a gang one - "[sender]: message",
// whispered to the reader's own avatar - so it reads "[PA] Twist: hello".
export const PARTNER_ALERT_PREFIX = '[PA]';

export const ParsePartnerAlert = (text: string): { sender: string; message: string } => ParseGangAlert(text);
