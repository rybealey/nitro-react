import EmojiJson from './emoji-data.json';

export interface IEmoji
{
    emoji: string;
    name: string;
    aliases: string[];
}

interface IEmojiCategory
{
    name: string;
    emojis: IEmoji[];
}

const RAW = (EmojiJson as { categories: string[], emojis: [ string, number, string[], string ][] });

// The face on the chat box's emoji button, re-rolled on hover. Classic faces
// only: a pick from the whole set could be a flag or a newer emoji that this
// computer draws as two symbols or an empty box.
const BUTTON_FACES = [ '😀', '😃', '😄', '😁', '😆', '😅', '😂', '🙂', '🙃', '😉', '😊', '😇', '😍', '😘', '😋', '😛', '😜', '😝', '😎', '🤓', '🤩', '🥳', '😏', '😮', '😲', '😳', '🥺', '😢', '😭', '😤', '😡', '🤯', '😱', '🤗', '🤔', '🤭', '😴', '🤤', '😵', '🤠' ];

let categories: IEmojiCategory[] = null;
let aliasMap: Map<string, string> = null;
let emojiMap: Map<string, IEmoji> = null;

const buildCache = () =>
{
    if(categories) return;

    categories = RAW.categories.map(name => ({ name, emojis: [] }));
    aliasMap = new Map();
    emojiMap = new Map();

    for(const [ emoji, categoryIndex, aliases, name ] of RAW.emojis)
    {
        const entry = { emoji, name, aliases };

        categories[categoryIndex].emojis.push(entry);
        emojiMap.set(emoji, entry);

        for(const alias of aliases) aliasMap.set(alias, emoji);
    }
}

export const GetEmojiCategories = () =>
{
    buildCache();

    return categories;
}

export const GetEmoji = (emoji: string): IEmoji =>
{
    buildCache();

    return (emojiMap.get(emoji) ?? null);
}

export const GetRandomFaceEmoji = () => BUTTON_FACES[Math.floor(Math.random() * BUTTON_FACES.length)];

// The picker's search: a shortcode (sob, :sob:) or any word of the name
// (crying). Exact matches come first, then the ones with a word that starts
// with what was typed, then the rest - each group in the picker's own order.
export const SearchEmojis = (query: string): IEmoji[] =>
{
    const text = (query ?? '').trim().toLowerCase().replace(/^:+|:+$/g, '');

    if(!text) return [];

    buildCache();

    const exact: IEmoji[] = [];
    const starts: IEmoji[] = [];
    const contains: IEmoji[] = [];

    for(const category of categories)
    {
        for(const entry of category.emojis)
        {
            const name = entry.name.toLowerCase();

            if((name === text) || entry.aliases.includes(text))
            {
                exact.push(entry);

                continue;
            }

            const words = [ ...name.split(' '), ...entry.aliases.flatMap(alias => alias.split('_')) ];

            if(name.startsWith(text) || entry.aliases.some(alias => alias.startsWith(text)) || words.some(word => word.startsWith(text)))
            {
                starts.push(entry);

                continue;
            }

            if(name.includes(text) || entry.aliases.some(alias => alias.includes(text))) contains.push(entry);
        }
    }

    return [ ...exact, ...starts, ...contains ];
}

// :sob: -> 😭 once the closing colon completes the shortcode
export const ReplaceEmojiShortcodes = (text: string) =>
{
    if(!text || (text.indexOf(':') === -1)) return text;

    buildCache();

    return text.replace(/:([a-z0-9_+-]+):/gi, (match, alias) => (aliasMap.get(alias.toLowerCase()) ?? match));
}
