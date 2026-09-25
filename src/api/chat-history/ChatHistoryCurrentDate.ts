// Chat History stamps are the player's own computer time, not the hotel's San
// Francisco clock the rest of the game runs on: they answer "when did I see
// this", which is a question about the player's day, not the game's.
export const ChatHistoryCurrentDate = () =>
{
    const currentTime = new Date();

    return `${ currentTime.getHours().toString().padStart(2, '0') }:${ currentTime.getMinutes().toString().padStart(2, '0') }:${ currentTime.getSeconds().toString().padStart(2, '0') }`;
}
