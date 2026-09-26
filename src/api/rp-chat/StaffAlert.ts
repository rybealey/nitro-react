import { RoomSessionChatEvent } from '@nitrots/nitro-renderer';
import { GetSessionDataManager } from '../nitro/session/GetSessionDataManager';
import { ParseGangAlert } from './GangAlert';

// PixelRP: is this incoming chat line a staff alert (:sa)?
//
// StaffAlertCommand whispers "[sender]: message" in bubble 5 to every online
// rank 5+, addressed to the RECIPIENT's own avatar - the shape of a gang alert.
// But 5 is a style any player can pick, so the bubble alone cannot be the test:
// this is corporation alert's rule (see CorpAlert.ts) on a different bubble.
// Only the server sends all of it at once - bubble 5, a whisper, one that names
// yourself as the speaker (a whisper someone else sends you carries THEIR
// name) - plus the "[sender]:" prefix.
//
// Shared so the room and the Chat History window cannot disagree about what
// counts as staff chat.
export const STAFF_ALERT_BUBBLE_STYLE: number = 5;

// The rank :sa is sent to, and the rank that sees the Staff tab. The server
// holds the real line (StaffAlertCommand.MinimumRank); this only decides
// whether an empty tab is worth showing.
export const STAFF_ALERT_MIN_RANK: number = 5;

export const IsStaffAlert = (styleId: number, chatType: number, senderName: string, text: string): boolean =>
{
    if(styleId !== STAFF_ALERT_BUBBLE_STYLE) return false;

    if(chatType !== RoomSessionChatEvent.CHAT_TYPE_WHISPER) return false;

    const session = GetSessionDataManager();

    if(!session || !senderName || (senderName !== session.userName)) return false;

    return !!ParseGangAlert(text);
}

export const STAFF_ALERT_PREFIX = '[Staff]';

// The same "[sender]: message" split gang alerts use - see GangAlert.ts.
export const ParseStaffAlert = ParseGangAlert;
