import { FC, useEffect, useRef, useState } from 'react';
import { ClearEmojiPickerTarget, GetRandomFaceEmoji, SetEmojiPickerTarget, ToggleEmojiPicker, useEmojiPickerOpen, WarmUpEmojis } from '../../../../api';
import { Base } from '../../../../common';

interface ChatInputEmojiSelectorViewProps
{
    addEmoji: (emoji: string) => void;
}

// The chat bar's emoji button. The picker it opens is not built here: it is
// built once and kept for the whole visit (EmojiPickerView), since this chat
// bar is made again with every room.
export const ChatInputEmojiSelectorView: FC<ChatInputEmojiSelectorViewProps> = props =>
{
    const { addEmoji = null } = props;
    const [ buttonEmoji, setButtonEmoji ] = useState<string>(GetRandomFaceEmoji);
    const isOpen = useEmojiPickerOpen();
    const buttonRef = useRef<HTMLDivElement>(null);
    const faceRef = useRef<HTMLSpanElement>(null);

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

    // the picker puts what is picked into this chat bar while it is the one up
    useEffect(() => SetEmojiPickerTarget(buttonRef.current, addEmoji));

    useEffect(() =>
    {
        const button = buttonRef.current;

        return () => ClearEmojiPickerTarget(button);
    }, []);

    // every emoji drawn once out of sight, so the picker builds fast (EmojiWarmUp)
    useEffect(() => WarmUpEmojis(), []);

    return (
        <Base innerRef={ buttonRef } pointer className={ `chat-emoji-button no-select${ isOpen ? ' is-open' : '' }` } onMouseEnter={ rollEmoji } onClick={ () => ToggleEmojiPicker() }>
            <span ref={ faceRef } className="chat-emoji-button-face">{ buttonEmoji }</span>
        </Base>
    );
}
