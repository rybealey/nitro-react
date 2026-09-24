import { RoomSessionChatEvent } from '@nitrots/nitro-renderer';
import { GetSessionDataManager } from '../nitro/session/GetSessionDataManager';
import { ParseGangAlert } from './GangAlert';

// PixelRP: is this incoming chat line a corporation alert (:ca)?
//
// CorporationAlertCommand whispers "[sender]: message" in bubble 11 to every
// on-duty employee, addressed to the RECIPIENT's own avatar - the same shape as
// a gang alert. Unlike gang alert's bubble 200, though, 11 is one of the
// imported collection styles, so the bubble alone cannot be the whole test: a
// player could chat in it. What only the server produces is all three at once -
// bubble 11, a whisper, and one that names yourself as the speaker (a whisper
// someone else sends you carries THEIR name) - plus the "[sender]:" prefix.
//
// Shared so the room and the Chat History window cannot disagree about what
// counts as corporation chat.
export const CORP_ALERT_BUBBLE_STYLE: number = 11;

export const CORP_ALERT_PREFIX = '[CA]';

export const IsCorpAlert = (styleId: number, chatType: number, senderName: string, text: string): boolean =>
{
    if(styleId !== CORP_ALERT_BUBBLE_STYLE) return false;

    if(chatType !== RoomSessionChatEvent.CHAT_TYPE_WHISPER) return false;

    const session = GetSessionDataManager();

    if(!session || !senderName || (senderName !== session.userName)) return false;

    return !!ParseGangAlert(text);
}

// The same "[sender]: message" split gang alerts use - see GangAlert.ts.
export const ParseCorpAlert = ParseGangAlert;
