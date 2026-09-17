import { GetSessionDataManager } from '../nitro/session/GetSessionDataManager';

// PixelRP: is this incoming chat line an @mention OF ME?
//
// The server delivers a message that @mentions you with bubble style 25 and
// sends everybody else the sender's ordinary bubble, so style 25 arriving is
// most of the answer. It is not all of it: 25 is also a bubble any player can
// pick for themselves (room_chat_styles has a row for it with no required
// right), and somebody who picked it would otherwise ping you with every
// sentence they said. The name has to be in the text as well.
//
// Shared, because two surfaces answer this same question and must never
// disagree: the alert sound in the room, and the Mentions tab in Chat History.
// A ping you can hear but cannot find afterwards is worse than no ping.
//
// Matched by scanning rather than a built RegExp: a username goes straight
// into the pattern, and names carrying regex characters would either need
// escaping or quietly match the wrong thing. indexOf cannot misread a name.
export const MENTION_BUBBLE_STYLE: number = 25;

export const IsMentionOfMe = (styleId: number, text: string, senderWebId: number): boolean =>
{
    if(styleId !== MENTION_BUBBLE_STYLE) return false;

    const session = GetSessionDataManager();

    if(!session || !text) return false;

    // your own line never pings you, whatever style it arrived carrying
    if(senderWebId === session.userId) return false;

    const ownName = (session.userName || '');

    if(!ownName.length) return false;

    const needle = ('@' + ownName.toLowerCase());
    const haystack = text.toLowerCase();
    let at = haystack.indexOf(needle);

    while(at >= 0)
    {
        // "@twist" must not match "@twistee" - the character after the name has
        // to end the word, exactly as the \b in the rule this replaced did
        const after = haystack.charAt(at + needle.length);

        if(!after.length || !/[a-z0-9_]/.test(after)) return true;

        at = haystack.indexOf(needle, (at + 1));
    }

    return false;
}
