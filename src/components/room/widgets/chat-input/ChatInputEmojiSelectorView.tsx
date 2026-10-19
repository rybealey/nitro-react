import { FC, KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Overlay, Popover } from 'react-bootstrap';
import { AddRecentEmoji, GetEmoji, GetEmojiCategories, GetRandomFaceEmoji, GetRecentEmojis, IEmoji, SearchEmojis } from '../../../../api';
import { Base, Column, Text } from '../../../../common';

interface ChatInputEmojiSelectorViewProps
{
    addEmoji: (emoji: string) => void;
}

export const ChatInputEmojiSelectorView: FC<ChatInputEmojiSelectorViewProps> = props =>
{
    const { addEmoji = null } = props;
    const [ buttonEmoji, setButtonEmoji ] = useState<string>(GetRandomFaceEmoji);
    const [ selectorVisible, setSelectorVisible ] = useState(false);
    const [ search, setSearch ] = useState<string>('');
    const [ recent, setRecent ] = useState<IEmoji[]>([]);
    const buttonRef = useRef<HTMLDivElement>(null);
    const faceRef = useRef<HTMLSpanElement>(null);
    const searchRef = useRef<HTMLInputElement>(null);

    const query = search.trim();
    const results = useMemo(() => (query ? SearchEmojis(query) : null), [ query ]);

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

    const onSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) =>
    {
        if((event.key !== 'Enter') && (event.key !== 'NumpadEnter')) return;
        if(!results || !results.length) return;

        selectEmoji(results[0].emoji);
    }

    useEffect(() =>
    {
        if(!selectorVisible) return;

        searchRef.current?.focus({ preventScroll: true });
    }, [ selectorVisible ]);

    const renderSection = (key: string, title: string, emojis: IEmoji[]) =>
    {
        return (
            <Column key={ key } gap={ 0 }>
                <Text small bold variant="muted" className="emoji-category-header px-2 pt-2 pb-1">{ title }</Text>
                <div className="emoji-grid px-2 pb-1">
                    { emojis.map(entry => <span key={ entry.emoji } title={ entry.aliases.length ? `:${ entry.aliases[0] }:` : entry.name } className="emoji-cell no-select" onClick={ () => selectEmoji(entry.emoji) }>{ entry.emoji }</span>) }
                </div>
            </Column>
        );
    }

    return (
        <>
            <Base innerRef={ buttonRef } pointer className="chat-emoji-button no-select" onMouseEnter={ rollEmoji } onClick={ toggleSelector }>
                <span ref={ faceRef } className="chat-emoji-button-face">{ buttonEmoji }</span>
            </Base>
            <Overlay show={ selectorVisible } target={ buttonRef } placement="top" rootClose onHide={ hideSelector }>
                <Popover className="nitro-chat-emoji-selector-container">
                    <label className="emoji-search">
                        <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true"><circle cx="6" cy="6" r="4.5" /><path d="M9.5 9.5L13 13" /></svg>
                        <input ref={ searchRef } type="text" spellCheck={ false } aria-label="Search emojis" placeholder="Search emojis" maxLength={ 32 } value={ search } onChange={ event => setSearch(event.target.value) } onKeyDown={ onSearchKeyDown } />
                    </label>
                    <Column gap={ 0 } className="emoji-drawer" overflow="auto">
                        { results && (results.length > 0) && renderSection('results', 'Search Results', results) }
                        { results && (results.length === 0) &&
                            <div className="emoji-empty">No emojis match “{ query }”.</div> }
                        { !results && (recent.length > 0) && renderSection('recent', 'Recently Used', recent) }
                        { !results && GetEmojiCategories().map(category => renderSection(category.name, category.name, category.emojis)) }
                    </Column>
                </Popover>
            </Overlay>
        </>
    );
}
