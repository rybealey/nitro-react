import { IRoomSession, RoomObjectCategory, RoomObjectVariable, RoomSessionChatEvent } from '@nitrots/nitro-renderer';
import { GetUiAccountSettings } from '../../components/rp-settings/UiAccountSettings';
import { GetRoomEngine } from '../nitro/room/GetRoomEngine';
import { GetRoomSessionManager } from '../nitro/session/GetRoomSessionManager';
import { ChatMessageTypeEnum } from '../room/widgets/ChatMessageTypeEnum';
import { IsNarratedBubble } from './NarratedBubble';

// PixelRP: your own line of chat, drawn the moment you send it.
//
// Stock waits for the server to send the line back before showing it - a
// whole round trip, so on a slow connection your own words took a quarter of
// a second or more to appear over your head. Now a talk or a shout goes up
// as soon as it is sent (a preview), and the server's copy, when it comes,
// confirms the preview instead of adding a second bubble (useChatWidget).
//
// The server still has the last word. It may change the line (the word
// filters, the 100-character cut) or its bubble (staff on duty speak in 23, a
// VIP bubble falls back once VIP lapses), and then the preview is put right
// where it stands. Or it may never send the line back at all - a mute, flood
// control, a wired "user says" that keeps it - and then the preview is taken
// down after a few seconds. Commands (":...") never preview: most of them
// never come back as chat.

/** How long a preview waits for the server's copy before it is taken down. */
export const OWN_CHAT_PREVIEW_TIMEOUT_MS: number = 3000;

export interface OwnChatPreview
{
    /** The bubble picked beside the chat box, which the server may swap. */
    chosenStyle: number;
}

// A preview is told apart from the server's copy by the event itself.
const previews = new WeakMap<RoomSessionChatEvent, OwnChatPreview>();

export const GetOwnChatPreview = (event: RoomSessionChatEvent): OwnChatPreview => (previews.get(event) ?? null);

// The bubble the server last showed instead of the chosen one, so a staff
// member on duty has their line put right once, not every time.
let swappedBubble: { chosen: number, shown: number } = null;

export const LearnOwnChatBubble = (chosen: number, shown: number): void =>
{
    swappedBubble = (chosen === shown) ? null : { chosen, shown };
}

const PredictBubble = (chosen: number): number => ((swappedBubble && (swappedBubble.chosen === chosen)) ? swappedBubble.shown : chosen);

// Own lines sent with no preview - a ':' line, which comes back as chat when
// it is not a command (":D"), and a macro's lines - so the server's copy of
// one is never taken for a preview's.
const UNPREVIEWED_KEEP_MS: number = 10000;
const unpreviewed: { text: string, at: number }[] = [];

export const ExpectUnpreviewedLine = (text: string): void =>
{
    const line = NormalizeOwnChatLine(text);

    if(!line.trim().length) return;

    unpreviewed.push({ text: line, at: Date.now() });

    while(unpreviewed.length > 20) unpreviewed.shift();
}

/** True, and forgotten, when the server's copy is of a line sent with no preview. */
export const TakeUnpreviewedLine = (line: string): boolean =>
{
    const now = Date.now();

    while(unpreviewed.length && ((now - unpreviewed[0].at) > UNPREVIEWED_KEEP_MS)) unpreviewed.shift();

    const index = unpreviewed.findIndex(entry => (entry.text === line));

    if(index < 0) return false;

    unpreviewed.splice(index, 1);

    return true;
}

/**
 * What the server does to a line before saying it (ChatEvent and
 * StringCharFilter.Escape): breaks become spaces, control characters go, it
 * is cut at 100, and the word filter trims the end.
 */
export const NormalizeOwnChatLine = (text: string): string =>
    // eslint-disable-next-line no-control-regex
    (text ?? '').replace(/[\r\n]/g, ' ').replace(/[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, '').substring(0, 100).trimEnd();

/**
 * The server's copy of a line the word filter changed: the same number of
 * words, at most half of them different. A filter swaps a word (or part of
 * one) for its replacement and leaves the rest, so a line it touched still
 * lines up with what was typed; a line the server says for you ("*swings at
 * twist, but misses*") does not.
 */
export const LooksLikeFilteredLine = (sent: string, shown: string): boolean =>
{
    const sentWords = sent.split(' ');
    const shownWords = shown.split(' ');

    if(sentWords.length !== shownWords.length) return false;

    const changed = sentWords.filter((word, index) => (word.toLowerCase() !== shownWords[index].toLowerCase())).length;

    return (changed <= Math.ceil(sentWords.length / 2));
}

/** Called once a talk or shout has been sent - see the note at the top. */
export const ShowOwnChatNow = (roomSession: IRoomSession, text: string, chatType: number, chosenStyle: number): void =>
{
    if(!roomSession || ((chatType !== ChatMessageTypeEnum.CHAT_DEFAULT) && (chatType !== ChatMessageTypeEnum.CHAT_SHOUT))) return;

    const line = NormalizeOwnChatLine(text);

    if(!line.trim().length) return;

    if(line.startsWith(':'))
    {
        ExpectUnpreviewedLine(line);

        return;
    }

    // not in the room yet, or spectating - nothing to draw the bubble over
    if(!GetRoomEngine().getRoomObject(roomSession.roomId, roomSession.ownRoomIndex, RoomObjectCategory.UNIT)) return;

    const style = PredictBubble(chosenStyle);
    const settings = GetUiAccountSettings();
    const event = new RoomSessionChatEvent(RoomSessionChatEvent.CHAT_EVENT, roomSession, roomSession.ownRoomIndex, line,
        ((chatType === ChatMessageTypeEnum.CHAT_SHOUT) ? RoomSessionChatEvent.CHAT_TYPE_SHOUT : RoomSessionChatEvent.CHAT_TYPE_SPEAK),
        style, null, -1, settings.usernameColor, settings.usernameIcon, settings.usernameIconColor);

    previews.set(event, { chosenStyle });

    GetRoomSessionManager().events.dispatchEvent(event);

    // The mouth starts with the bubble, as RoomMessageHandler starts it for
    // the server's copy - which starts it again, for the same length.
    if(!IsNarratedBubble(style, line)) GetRoomEngine().updateRoomObjectUserAction(roomSession.roomId, roomSession.ownRoomIndex, RoomObjectVariable.FIGURE_TALK, (line.length / 10));
}
