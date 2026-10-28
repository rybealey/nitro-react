import { NitroRectangle, TextureUtils } from '@nitrots/nitro-renderer';
import { GetRoomEngine, GetRoomSession } from '../nitro';
import { SendRpApartmentSnapshot } from './RpRealEstateMessages';

// The picture of an apartment for the real estate board (Twist, 2026-10-28:
// "make the game take it automatically"). The server asks for it with
// "apartments/snapshot" as the owner walks onto their door arrow
// (RpApartments.LeaveSoon), before it moves them out, so the room is still on
// screen: the middle of the view, 3:2 like the board's picture box, drawn at
// twice that box's size (250 x 166) so it stays sharp.

const WIDTH = 498;
const HEIGHT = 332;

export const TakeApartmentSnapshot = (): void =>
{
    const session = GetRoomSession();

    if(!session) return;

    try
    {
        const viewWidth = window.innerWidth;
        const viewHeight = window.innerHeight;
        const width = Math.max(1, Math.min(viewWidth, Math.round(viewHeight * 1.5), 1050));
        const height = Math.max(1, Math.round(width / 1.5));
        const bounds = new NitroRectangle(Math.floor((viewWidth - width) / 2), Math.floor((viewHeight - height) / 2), width, height);
        const texture = GetRoomEngine().createTextureFromRoom(session.roomId, 1, bounds);

        if(!texture) return;

        const source = TextureUtils.generateCanvas(texture);

        texture.destroy(true);

        if(!source) return;

        const canvas = document.createElement('canvas');

        canvas.width = WIDTH;
        canvas.height = HEIGHT;

        const context = canvas.getContext('2d');

        if(!context) return;

        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = 'high';
        context.drawImage(source, 0, 0, WIDTH, HEIGHT);

        SendRpApartmentSnapshot(canvas.toDataURL('image/png'));
    }
    catch
    {
        // No picture this time; the board keeps the last one.
    }
}
