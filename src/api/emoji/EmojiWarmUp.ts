import { GetEmojiCategories } from './EmojiData';

// PixelRP: the first time this browser draws an emoji it has to look it up in
// the emoji font. The picker draws all ~1,900 at once, so its first opening
// stalled for over a second, and a second click in that time closed it again
// (Twist, 2026-10-25: "not responsive when you first click it"). Once drawn,
// the browser remembers them: after that the whole picker lays out in about
// 20ms. So every emoji is drawn once, out of sight, a few at a time in quiet
// moments soon after the chat bar first appears - by the time the button is
// clicked, the picker opens straight away with every emoji in it.
const START_DELAY_MS = 4000;
// pixelrp (Twist, 2026-10-27, from the lag reports): a few at a time, as many
// as a quiet moment has room for. It drew 24 in every quiet moment whatever
// was left of it, and on a laptop's graphics that was ~50 ms each time - some
// 80 small stutters after every login. Now a group of GROUP, and more groups
// only while the moment still has SPARE_MS to spare; a moment the browser ran
// out of waiting for (the 1 s timeout) gets one group.
const GROUP = 6;
const SPARE_MS = 4;

let started = false;
let warm = false;
const waiting: (() => void)[] = [];

// The picker (EmojiPickerView) builds itself once the emojis are drawn: built
// before then, it would be the slow first drawing all at once.
export const WhenEmojisWarm = (callback: () => void): void =>
{
    if(warm) callback();
    else waiting.push(callback);
}

export const WarmUpEmojis = (): void =>
{
    if(started || (typeof document === 'undefined')) return;

    started = true;

    const emojis = GetEmojiCategories().flatMap(category => category.emojis.map(entry => entry.emoji));

    // the picker's own classes, so each is drawn at the size and in the font
    // the picker draws it in
    const host = document.createElement('div');
    const grid = document.createElement('div');

    host.className = 'nitro-chat-emoji-selector-container';
    host.setAttribute('aria-hidden', 'true');
    host.style.cssText = 'position: fixed; left: -10000px; top: 0; width: 352px; visibility: hidden; pointer-events: none;';
    grid.className = 'emoji-grid';
    host.appendChild(grid);

    let next = 0;

    const schedule = (step: (deadline?: IdleDeadline) => void) =>
    {
        if(typeof window.requestIdleCallback === 'function') window.requestIdleCallback(deadline => step(deadline), { timeout: 1000 });
        else window.setTimeout(() => step(), 50);
    }

    const drawGroup = () =>
    {
        grid.textContent = '';

        for(const emoji of emojis.slice(next, (next + GROUP)))
        {
            const cell = document.createElement('button');

            cell.type = 'button';
            cell.tabIndex = -1;
            cell.className = 'emoji-cell';
            cell.textContent = emoji;
            grid.appendChild(cell);
        }

        next += GROUP;

        // laid out now, in this quiet moment, rather than in the next frame
        void grid.offsetHeight;
    }

    const step = (deadline?: IdleDeadline) =>
    {
        if(next >= emojis.length)
        {
            host.remove();

            warm = true;
            waiting.splice(0).forEach(callback => callback());

            return;
        }

        if(!host.isConnected) document.body.appendChild(host);

        // one group always, so it finishes however busy the game is; more
        // while the quiet moment lasts
        do drawGroup();
        while((next < emojis.length) && deadline && !deadline.didTimeout && (deadline.timeRemaining() > SPARE_MS));

        schedule(step);
    }

    window.setTimeout(() => schedule(step), START_DELAY_MS);
}
