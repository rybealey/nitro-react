// The emoji picker's Recently Used row: the last emojis picked from it, newest
// first. Per device, like the other prefs kept in localStorage.

const RECENT_KEY = 'pixelrp.prefs.chat.recentEmoji';

const RECENT_EMOJI_LIMIT = 20;

let recent: string[] = null;

const load = (): string[] =>
{
    if(recent) return recent;

    recent = [];

    try
    {
        const stored = JSON.parse(window.localStorage.getItem(RECENT_KEY));

        if(Array.isArray(stored)) recent = stored.filter(emoji => (typeof emoji === 'string')).slice(0, RECENT_EMOJI_LIMIT);
    }
    catch(e)
    {
        // storage blocked or unreadable: start the row empty
    }

    return recent;
}

export const GetRecentEmojis = (): string[] => [ ...load() ];

export const AddRecentEmoji = (emoji: string): void =>
{
    if(!emoji) return;

    recent = [ emoji, ...load().filter(existing => (existing !== emoji)) ].slice(0, RECENT_EMOJI_LIMIT);

    try
    {
        window.localStorage.setItem(RECENT_KEY, JSON.stringify(recent));
    }
    catch(e)
    {
        // per-session only, then
    }
}
