import EmojiJson from './emoji-data.json';

export interface IEmoji
{
    emoji: string;
    name: string;
    aliases: string[];
}

export interface IEmojiCategory
{
    name: string;
    emojis: IEmoji[];
}

const RAW = (EmojiJson as { categories: string[], emojis: [ string, number, string[], string ][] });

let categories: IEmojiCategory[] = null;
let aliasMap: Map<string, string> = null;

const buildCache = () =>
{
    if(categories) return;

    categories = RAW.categories.map(name => ({ name, emojis: [] }));
    aliasMap = new Map();

    for(const [ emoji, categoryIndex, aliases, name ] of RAW.emojis)
    {
        categories[categoryIndex].emojis.push({ emoji, name, aliases });

        for(const alias of aliases) aliasMap.set(alias, emoji);
    }
}

export const GetEmojiCategories = () =>
{
    buildCache();

    return categories;
}

export const GetRandomEmoji = () =>
{
    const entry = RAW.emojis[Math.floor(Math.random() * RAW.emojis.length)];

    return entry[0];
}

// :sob: -> 😭 once the closing colon completes the shortcode
export const ReplaceEmojiShortcodes = (text: string) =>
{
    if(!text || (text.indexOf(':') === -1)) return text;

    buildCache();

    return text.replace(/:([a-z0-9_+-]+):/gi, (match, alias) => (aliasMap.get(alias.toLowerCase()) ?? match));
}
