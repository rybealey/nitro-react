import { FC, KeyboardEvent, MouseEvent, ReactNode, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Overlay, Popover } from 'react-bootstrap';
import { AddRecentEmoji, GetEmoji, GetEmojiCategories, GetRandomFaceEmoji, GetRecentEmojis, IEmoji, SearchEmojis } from '../../../../api';
import { Base } from '../../../../common';

interface ChatInputEmojiSelectorViewProps
{
    addEmoji: (emoji: string) => void;
}

interface EmojiSection
{
    key: string;
    name: string;
    emojis: IEmoji[];
}

const RECENT_SECTION = 'recent';
const RESULTS_SECTION = 'results';

const categoryKey = (index: number) => `category-${ index }`;

// The picker's distance above the button. Bootstrap's 8px left the box on the
// chat bar's top edge; 18 leaves a 10px gap, the arrow tip just above the bar.
const PICKER_OFFSET: [ number, number ] = [ 0, 18 ];

const RailIcon: FC<{ children: ReactNode }> = props => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{ props.children }</svg>;

const RECENT_ICON = <RailIcon><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></RailIcon>;

// One line icon per category, by its name in emoji-data.json. A category the
// data gains later falls back to a plain circle until it is given one.
const CATEGORY_ICONS: Record<string, ReactNode> = {
    'Smileys & Emotion': <RailIcon><circle cx="12" cy="12" r="9" /><path d="M8.5 14.5c1 1.2 2.2 1.8 3.5 1.8s2.5-.6 3.5-1.8" /><path d="M9 9.5h.01M15 9.5h.01" strokeWidth="2.6" /></RailIcon>,
    'People & Body': <RailIcon><circle cx="12" cy="8" r="4" /><path d="M4.5 20c0-4 3.4-6.5 7.5-6.5s7.5 2.5 7.5 6.5" /></RailIcon>,
    'Animals & Nature': <RailIcon><path d="M5 19c0-8 5-13 14-14 0 9-5 14-13 14z" /><path d="M5 19l7-7" /></RailIcon>,
    'Food & Drink': <RailIcon><path d="M4 9h12v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z" /><path d="M16 10h1.5a2.5 2.5 0 0 1 0 5H16" /><path d="M8 3v3M12 3v3" /></RailIcon>,
    'Travel & Places': <RailIcon><path d="M4 16v-3.5L6 7h12l2 5.5V16" /><path d="M3 16h18" /><path d="M6.5 16v2.5M17.5 16v2.5" /><path d="M7.5 12.5h.01M16.5 12.5h.01" strokeWidth="2.6" /></RailIcon>,
    'Activities': <RailIcon><circle cx="12" cy="12" r="9" /><path d="M3 12h18" /><path d="M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18" /></RailIcon>,
    'Objects': <RailIcon><path d="M9 18h6M10 21h4" /><path d="M12 3a6 6 0 0 0-4 10.5c.7.7 1 1.5 1 2.5h6c0-1 .3-1.8 1-2.5A6 6 0 0 0 12 3z" /></RailIcon>,
    'Symbols': <RailIcon><path d="M12 20s-7.5-4.6-7.5-10.2A4.2 4.2 0 0 1 12 7.2a4.2 4.2 0 0 1 7.5 2.6C19.5 15.4 12 20 12 20z" /></RailIcon>,
    'Flags': <RailIcon><path d="M5.5 21V4" /><path d="M5.5 4.5h11l-2.2 4 2.2 4h-11" /></RailIcon>
};

const FALLBACK_ICON = <RailIcon><circle cx="12" cy="12" r="8" /></RailIcon>;

export const ChatInputEmojiSelectorView: FC<ChatInputEmojiSelectorViewProps> = props =>
{
    const { addEmoji = null } = props;
    const [ buttonEmoji, setButtonEmoji ] = useState<string>(GetRandomFaceEmoji);
    const [ selectorVisible, setSelectorVisible ] = useState(false);
    const [ search, setSearch ] = useState<string>('');
    const [ recent, setRecent ] = useState<IEmoji[]>([]);
    const [ hovered, setHovered ] = useState<IEmoji>(null);
    const [ activeSection, setActiveSection ] = useState<string>(RECENT_SECTION);
    const buttonRef = useRef<HTMLDivElement>(null);
    const faceRef = useRef<HTMLSpanElement>(null);
    const searchRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLDivElement>(null);
    const pendingJump = useRef<string>(null);

    const query = search.trim();
    const results = useMemo(() => (query ? SearchEmojis(query) : null), [ query ]);
    const topResult = ((results && results.length) ? results[0] : null);

    const railItems = useMemo(() => [
        { key: RECENT_SECTION, name: 'Recently Used', icon: RECENT_ICON },
        ...GetEmojiCategories().map((category, index) => ({ key: categoryKey(index), name: category.name, icon: (CATEGORY_ICONS[category.name] ?? FALLBACK_ICON) }))
    ], []);

    const sections = useMemo<EmojiSection[]>(() =>
    {
        if(results) return (results.length ? [ { key: RESULTS_SECTION, name: 'Search Results', emojis: results } ] : []);

        return [
            { key: RECENT_SECTION, name: 'Recently Used', emojis: recent },
            ...GetEmojiCategories().map((category, index) => ({ key: categoryKey(index), name: category.name, emojis: category.emojis }))
        ];
    }, [ results, recent ]);

    const rollEmoji = () =>
    {
        setButtonEmoji(GetRandomFaceEmoji());

        // Replay the pop by restarting the CSS animation in place. The span must
        // NOT remount (no key): replacing the hovered node fires new mouseover
        // boundary events, which Safari attributes as a fresh parent enter —
        // React's synthetic onMouseEnter then re-rolls forever while hovered.
        const face = faceRef.current;

        if(face)
        {
            face.style.animation = 'none';
            void face.offsetWidth;
            face.style.animation = '';
        }
    }

    const toggleSelector = () =>
    {
        if(selectorVisible)
        {
            setSelectorVisible(false);

            return;
        }

        // Recently Used is read once per opening, so the row does not reshuffle
        // under the pointer while several emojis are picked in a row.
        setRecent(GetRecentEmojis().map(GetEmoji).filter(Boolean));
        setSearch('');
        setHovered(null);
        setActiveSection(RECENT_SECTION);
        setSelectorVisible(true);
    }

    // The Overlay's own close: a click anywhere else, or Escape. A click on the
    // button is the button's to handle. The Overlay counts it as outside too,
    // and its close landed after the button's toggle, so a click to reopen
    // while the picker was still fading out was undone straight away.
    const hideSelector = (event: Event) =>
    {
        const button = buttonRef.current;

        if(button && (event?.target instanceof Node) && button.contains(event.target)) return;

        setSelectorVisible(false);
    }

    const selectEmoji = (emoji: string) =>
    {
        AddRecentEmoji(emoji);
        addEmoji(emoji);
    }

    const scrollToSection = (key: string) =>
    {
        const list = listRef.current;
        const section = list?.querySelector<HTMLElement>(`[data-section="${ key }"]`);

        if(!list || !section) return;

        list.scrollTop = section.offsetTop;
        setActiveSection(key);
    }

    // A rail click while searching clears the search first; the list it jumps
    // into only exists once that render is in, so the jump waits for it.
    const jumpToSection = (key: string) =>
    {
        if(query)
        {
            pendingJump.current = key;
            setActiveSection(key);
            setSearch('');

            return;
        }

        scrollToSection(key);
    }

    // The rail follows the scroll: the active section is the last one whose
    // header has reached the top of the list.
    const syncActiveSection = () =>
    {
        const list = listRef.current;

        if(!list || results) return;

        let current = RECENT_SECTION;

        list.querySelectorAll<HTMLElement>('[data-section]').forEach(section =>
        {
            if(section.offsetTop <= (list.scrollTop + 4)) current = section.dataset.section;
        });

        setActiveSection(current);
    }

    useLayoutEffect(() =>
    {
        const list = listRef.current;

        if(!list) return;

        // each new search starts its results from the top
        if(query)
        {
            list.scrollTop = 0;

            return;
        }

        if(pendingJump.current)
        {
            scrollToSection(pendingJump.current);
            pendingJump.current = null;

            return;
        }

        syncActiveSection();
    }, [ query ]);

    // One listener on the list rather than one per cell: the grid holds every
    // emoji (about 1,900), and the preview strip changes on each hover, which
    // must not rebuild them all.
    const emojiAt = (event: MouseEvent<HTMLElement>) =>
    {
        const cell = (event.target as HTMLElement).closest<HTMLElement>('[data-emoji]');

        return (cell ? GetEmoji(cell.dataset.emoji) : null);
    }

    const onListMouseOver = (event: MouseEvent<HTMLElement>) =>
    {
        const entry = emojiAt(event);

        if(entry) setHovered(entry);
    }

    const onListClick = (event: MouseEvent<HTMLElement>) =>
    {
        const entry = emojiAt(event);

        if(entry) selectEmoji(entry.emoji);
    }

    const onSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) =>
    {
        if((event.key !== 'Enter') && (event.key !== 'NumpadEnter')) return;
        if(!topResult) return;

        selectEmoji(topResult.emoji);
    }

    useEffect(() =>
    {
        if(!selectorVisible) return;

        searchRef.current?.focus({ preventScroll: true });
    }, [ selectorVisible ]);

    const sectionViews = useMemo(() => sections.map(section => (
        <div key={ section.key } data-section={ section.key }>
            <div className="emoji-section-header">{ section.name }</div>
            { (section.emojis.length > 0) &&
                <div className="emoji-grid">
                    { section.emojis.map(entry => <button key={ entry.emoji } type="button" data-emoji={ entry.emoji } aria-label={ entry.name } className={ `emoji-cell${ (entry === topResult) ? ' is-top' : '' }` }>{ entry.emoji }</button>) }
                </div> }
            { (section.key === RECENT_SECTION) && !section.emojis.length &&
                <div className="emoji-section-empty">Emojis you pick show up here.</div> }
        </div>
    )), [ sections, topResult ]);

    const preview = (hovered ?? topResult);

    return (
        <>
            <Base innerRef={ buttonRef } pointer className={ `chat-emoji-button no-select${ selectorVisible ? ' is-open' : '' }` } onMouseEnter={ rollEmoji } onClick={ toggleSelector }>
                <span ref={ faceRef } className="chat-emoji-button-face">{ buttonEmoji }</span>
            </Base>
            <Overlay show={ selectorVisible } target={ buttonRef } placement="top" offset={ PICKER_OFFSET } rootClose onHide={ hideSelector }>
                <Popover className="nitro-chat-emoji-selector-container">
                    <div className="emoji-picker">
                        <nav className="emoji-rail" aria-label="Emoji categories">
                            { railItems.map(item =>
                            {
                                const active = (!results && (activeSection === item.key));

                                return (
                                    <button key={ item.key } type="button" title={ item.name } aria-label={ item.name } aria-current={ active ? 'true' : undefined } className={ `emoji-rail-item${ active ? ' is-active' : '' }` } onClick={ () => jumpToSection(item.key) }>
                                        { item.icon }
                                    </button>
                                );
                            }) }
                        </nav>
                        <div className="emoji-main">
                            <label className="emoji-search">
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="M15.5 15.5L20 20" /></svg>
                                <input ref={ searchRef } type="text" spellCheck={ false } aria-label="Search emojis" placeholder="Search emojis" maxLength={ 32 } value={ search } onChange={ event => { setSearch(event.target.value); setHovered(null); } } onKeyDown={ onSearchKeyDown } />
                            </label>
                            <div ref={ listRef } className="emoji-list" onScroll={ syncActiveSection } onMouseOver={ onListMouseOver } onMouseLeave={ () => setHovered(null) } onClick={ onListClick }>
                                { results && !results.length &&
                                    <div className="emoji-empty">No emojis match “{ query }”.</div> }
                                { sectionViews }
                            </div>
                            <div className="emoji-preview">
                                { preview &&
                                    <>
                                        <span className="emoji-preview-face">{ preview.emoji }</span>
                                        <div className="emoji-preview-text">
                                            <span className="emoji-preview-name">{ preview.name.charAt(0).toUpperCase() + preview.name.slice(1) }</span>
                                            <span className="emoji-preview-code">{ preview.aliases.length ? `:${ preview.aliases[0] }:` : 'No shortcode' }</span>
                                        </div>
                                        { !hovered &&
                                            <span className="emoji-preview-key">Enter</span> }
                                    </> }
                                { !preview &&
                                    <span className="emoji-preview-hint">Point at an emoji to see its name and shortcode</span> }
                            </div>
                        </div>
                    </div>
                </Popover>
            </Overlay>
        </>
    );
}
