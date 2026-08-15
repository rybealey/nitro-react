import { FC, MouseEvent, useEffect, useRef, useState } from 'react';
import { Overlay, Popover } from 'react-bootstrap';
import { GetEmojiCategories, GetRandomEmoji } from '../../../../api';
import { Base, Column, Text } from '../../../../common';

interface ChatInputEmojiSelectorViewProps
{
    addEmoji: (emoji: string) => void;
}

export const ChatInputEmojiSelectorView: FC<ChatInputEmojiSelectorViewProps> = props =>
{
    const { addEmoji = null } = props;
    const [ buttonEmoji, setButtonEmoji ] = useState<string>(GetRandomEmoji);
    const [ target, setTarget ] = useState<(EventTarget & HTMLElement)>(null);
    const [ selectorVisible, setSelectorVisible ] = useState(false);
    const faceRef = useRef<HTMLSpanElement>(null);

    const rollEmoji = () =>
    {
        setButtonEmoji(GetRandomEmoji());

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

    const toggleSelector = (event: MouseEvent<HTMLElement>) =>
    {
        // Capture the target synchronously and derive the next state from the
        // current render's value, setting both together. The previous version
        // read a variable mutated inside the setSelectorVisible updater, which
        // React 18 runs AFTER this handler — so `target` was usually left null
        // and the popover needed several clicks before it finally opened.
        const element = (event.currentTarget as (EventTarget & HTMLElement));
        const next = !selectorVisible;

        setSelectorVisible(next);
        setTarget(next ? element : null);
    }

    const selectEmoji = (emoji: string) =>
    {
        addEmoji(emoji);
    }

    useEffect(() =>
    {
        if(selectorVisible) return;

        setTarget(null);
    }, [ selectorVisible ]);

    return (
        <>
            <Base pointer className="chat-emoji-button no-select" onMouseEnter={ rollEmoji } onClick={ toggleSelector }>
                <span ref={ faceRef } className="chat-emoji-button-face">{ buttonEmoji }</span>
            </Base>
            <Overlay show={ selectorVisible } target={ target } placement="top" rootClose onHide={ () => setSelectorVisible(false) }>
                <Popover className="nitro-chat-emoji-selector-container">
                    <Column gap={ 0 } className="emoji-drawer" overflow="auto">
                        { GetEmojiCategories().map(category =>
                        {
                            return (
                                <Column key={ category.name } gap={ 0 }>
                                    <Text small bold variant="muted" className="emoji-category-header px-2 pt-2 pb-1">{ category.name }</Text>
                                    <div className="emoji-grid px-2 pb-1">
                                        { category.emojis.map(entry => <span key={ entry.emoji } title={ entry.aliases.length ? `:${ entry.aliases[0] }:` : entry.name } className="emoji-cell no-select" onClick={ () => selectEmoji(entry.emoji) }>{ entry.emoji }</span>) }
                                    </div>
                                </Column>
                            );
                        }) }
                    </Column>
                </Popover>
            </Overlay>
        </>
    );
}
