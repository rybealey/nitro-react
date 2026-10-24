import { FC, KeyboardEvent, MouseEvent, ReactNode, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AddRecentEmoji, CloseEmojiPicker, GetEmoji, GetEmojiCategories, GetEmojiPickerAnchor, GetRecentEmojis, IEmoji, PickEmoji, SearchEmojis, useEmojiPickerOpen, WhenEmojisWarm } from '../../../../api';

// PixelRP: the chat bar's emoji picker, built ONCE and kept for the whole
// visit (mounted in MainView, not in the chat bar, which is made again with
// every room). It is built in the background soon after login - a category at
// a time, once the emojis have been drawn once (EmojiWarmUp) - and opening it
// only shows it: no buttons made, nothing laid out. Twist, 2026-10-25: "the
// emoji picker lags when i open it, especially when transitioning rooms". The
// chat bar's button (ChatInputEmojiSelectorView) opens and shuts it through
// EmojiPickerState, and a picked emoji goes into whichever chat bar is up.

const RECENT_SECTION = 'recent';
const RESULTS_SECTION = 'results';

const categoryKey = (index: number) => `category-${ index }`;

// The picker's distance above the button. Bootstrap's 8px left the box on the
// chat bar's top edge; 18 leaves a 10px gap, the arrow tip just above the bar.
const PICKER_GAP = 18;
// half the arrow's 16px, and how near the screen's edge the picker may come
const ARROW_HALF = 8;
const SCREEN_EDGE = 4;

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

const renderSection = (key: string, name: string, emojis: IEmoji[], topResult: IEmoji = null) => (
    <div key={ key } data-section={ key }>
        <div className="emoji-section-header">{ name }</div>
        { (emojis.length > 0) &&
            <div className="emoji-grid">
                { emojis.map(entry => <button key={ entry.emoji } type="button" data-emoji={ entry.emoji } aria-label={ entry.name } className={ `emoji-cell${ (entry === topResult) ? ' is-top' : '' }` }>{ entry.emoji }</button>) }
            </div> }
        { (key === RECENT_SECTION) && !emojis.length &&
            <div className="emoji-section-empty">Emojis you pick show up here.</div> }
    </div>
);

// one category a quiet moment, so building the picker never holds the game up
const nextQuietMoment = (callback: () => void): (() => void) =>
{
    if(typeof window.requestIdleCallback === 'function')
    {
        const handle = window.requestIdleCallback(() => callback(), { timeout: 1000 });

        return () => window.cancelIdleCallback(handle);
    }

    const timer = window.setTimeout(callback, 50);

    return () => window.clearTimeout(timer);
}

export const EmojiPickerView: FC<{}> = props =>
{
    const isOpen = useEmojiPickerOpen();
    const [ search, setSearch ] = useState<string>('');
    const [ recent, setRecent ] = useState<IEmoji[]>([]);
    const [ hovered, setHovered ] = useState<IEmoji>(null);
    const [ activeSection, setActiveSection ] = useState<string>(RECENT_SECTION);
    // how many categories have been built so far, and whether building has begun
    const [ builtCount, setBuiltCount ] = useState(0);
    const [ building, setBuilding ] = useState(false);
    const [ place, setPlace ] = useState<{ left: number, top: number, arrow: number }>(null);
    const panelRef = useRef<HTMLDivElement>(null);
    const searchRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLDivElement>(null);
    const pendingJump = useRef<string>(null);

    const categories = GetEmojiCategories();
    const query = search.trim();
    const results = useMemo(() => (query ? SearchEmojis(query) : null), [ query ]);
    const topResult = ((results && results.length) ? results[0] : null);

    const railItems = useMemo(() => [
        { key: RECENT_SECTION, name: 'Recently Used', icon: RECENT_ICON },
        ...categories.map((category, index) => ({ key: categoryKey(index), name: category.name, icon: (CATEGORY_ICONS[category.name] ?? FALLBACK_ICON) }))
    ], [ categories ]);

    // Built once and left alone: opening, hovering and searching never make
    // these buttons again. A search hides them rather than removing them.
    const categoryViews = useMemo(() => categories.slice(0, builtCount).map((category, index) => renderSection(categoryKey(index), category.name, category.emojis)), [ categories, builtCount ]);
    const recentView = useMemo(() => renderSection(RECENT_SECTION, 'Recently Used', recent), [ recent ]);
    const resultsView = useMemo(() => ((results && results.length) ? renderSection(RESULTS_SECTION, 'Search Results', results, topResult) : null), [ results, topResult ]);

    useEffect(() => WhenEmojisWarm(() => setBuilding(true)), []);

    useEffect(() =>
    {
        if(!building || (builtCount >= categories.length)) return;

        return nextQuietMoment(() => setBuiltCount(value => (value + 1)));
    }, [ building, builtCount, categories ]);

    const placePanel = useCallback(() =>
    {
        const anchor = GetEmojiPickerAnchor();
        const panel = panelRef.current;

        if(!anchor || !panel) return;

        // above the button, centred on it, kept on the screen; whole pixels,
        // so nothing in it is drawn soft
        const rect = anchor.getBoundingClientRect();
        const centre = (rect.left + (rect.width / 2));
        const left = Math.round(Math.max(SCREEN_EDGE, Math.min((centre - (panel.offsetWidth / 2)), (window.innerWidth - panel.offsetWidth - SCREEN_EDGE))));
        const top = Math.round(rect.top - PICKER_GAP - panel.offsetHeight);

        setPlace({ left, top, arrow: Math.round(centre - left - ARROW_HALF) });
    }, []);

    useLayoutEffect(() =>
    {
        if(!isOpen) return;

        // Opened before it was built in the background: the rest now.
        setBuiltCount(categories.length);

        // Fresh each opening, as when it was made anew every time. Recently
        // Used is read once per opening, so the row does not reshuffle under
        // the pointer while several emojis are picked in a row.
        setRecent(GetRecentEmojis().map(GetEmoji).filter(Boolean));
        setSearch('');
        setHovered(null);
        setActiveSection(RECENT_SECTION);

        if(listRef.current) listRef.current.scrollTop = 0;

        placePanel();

        window.addEventListener('resize', placePanel);

        return () => window.removeEventListener('resize', placePanel);
    }, [ isOpen, categories, placePanel ]);

    useEffect(() =>
    {
        if(isOpen)
        {
            searchRef.current?.focus({ preventScroll: true });

            return;
        }

        // shut: typing goes back to the chat bar
        const focused = document.activeElement as HTMLElement;

        if(focused && panelRef.current?.contains(focused)) focused.blur();
    }, [ isOpen ]);

    // A click anywhere else, or Escape, shuts it. A click on the button is the
    // button's to handle (it toggles).
    useEffect(() =>
    {
        if(!isOpen) return;

        const onClick = (event: globalThis.MouseEvent) =>
        {
            const target = (event.target as Node);
            const anchor = GetEmojiPickerAnchor();

            if(panelRef.current?.contains(target) || anchor?.contains(target)) return;

            CloseEmojiPicker();
        }

        const onKey = (event: globalThis.KeyboardEvent) =>
        {
            if(event.key === 'Escape') CloseEmojiPicker();
        }

        document.addEventListener('click', onClick, true);
        document.addEventListener('keydown', onKey, true);

        return () =>
        {
            document.removeEventListener('click', onClick, true);
            document.removeEventListener('keydown', onKey, true);
        }
    }, [ isOpen ]);

    const selectEmoji = (emoji: string) =>
    {
        AddRecentEmoji(emoji);
        PickEmoji(emoji);
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
    // into only shows once that render is in, so the jump waits for it.
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

        list.querySelectorAll<HTMLElement>('.emoji-sections > [data-section]').forEach(section =>
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

    const onSearchChange = (value: string) =>
    {
        setSearch(value);
        setHovered(null);
    }

    const preview = (hovered ?? topResult);

    // Kept on the page while shut, hidden (ChatInputView.scss, .is-closed), so
    // it is ready to show; off the screen until it is first opened and placed.
    return createPortal(
        <div ref={ panelRef } role="dialog" aria-label="Emojis" aria-hidden={ !isOpen }
            className={ `popover bs-popover-top nitro-chat-emoji-selector-container${ isOpen ? '' : ' is-closed' }` }
            style={ place ? { position: 'fixed', left: place.left, top: place.top } : { position: 'fixed', left: -10000, top: 0 } }>
            <div className="popover-arrow" style={ place ? { left: place.arrow } : undefined } />
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
                        <input ref={ searchRef } type="text" spellCheck={ false } aria-label="Search emojis" placeholder="Search emojis" maxLength={ 32 } value={ search } onChange={ event => onSearchChange(event.target.value) } onKeyDown={ onSearchKeyDown } />
                    </label>
                    <div ref={ listRef } className="emoji-list" onScroll={ syncActiveSection } onMouseOver={ onListMouseOver } onMouseLeave={ () => setHovered(null) } onClick={ onListClick }>
                        { results && !results.length &&
                            <div className="emoji-empty">No emojis match “{ query }”.</div> }
                        { resultsView }
                        <div className="emoji-sections" hidden={ !!results }>
                            { recentView }
                            { categoryViews }
                        </div>
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
        </div>, document.body);
}
