import { useEffect, useState } from 'react';

// PixelRP: the emoji picker is built once and kept for the whole visit
// (EmojiPickerView, mounted with the hotel), not by the chat bar. The chat bar
// is thrown away and built again with every room, and the picker inside it
// was ~1,900 buttons made from nothing on every opening - slowest of all just
// after a room change (Twist, 2026-10-25). The chat bar's button opens and
// shuts it through here, and says where the button is and what a picked
// emoji goes into.

let open = false;
let anchor: HTMLElement = null;
let pick: (emoji: string) => void = null;

const listeners = new Set<() => void>();

const notify = (): void => listeners.forEach(listener => listener());

// the chat bar showing now: its button, and what it does with an emoji
export const SetEmojiPickerTarget = (button: HTMLElement, onPick: (emoji: string) => void): void =>
{
    anchor = button;
    pick = onPick;
}

// that chat bar has gone (a room change, say): the picker shuts with it
export const ClearEmojiPickerTarget = (button: HTMLElement): void =>
{
    if(anchor !== button) return;

    anchor = null;
    pick = null;

    CloseEmojiPicker();
}

export const ToggleEmojiPicker = (): void =>
{
    if(!open && !anchor) return;

    open = !open;
    notify();
}

export const CloseEmojiPicker = (): void =>
{
    if(!open) return;

    open = false;
    notify();
}

export const PickEmoji = (emoji: string): void =>
{
    if(pick) pick(emoji);
}

export const GetEmojiPickerAnchor = (): HTMLElement => anchor;

export const useEmojiPickerOpen = (): boolean =>
{
    const [ , setTick ] = useState(0);

    useEffect(() =>
    {
        const listener = () => setTick(value => (value + 1));

        listeners.add(listener);

        return () =>
        {
            listeners.delete(listener);
        };
    }, []);

    return open;
}
