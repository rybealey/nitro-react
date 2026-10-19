import { RoomObjectVariable, RoomUnitEffectEvent } from '@nitrots/nitro-renderer';
import { GetCommunication } from '../nitro/GetCommunication';
import { GetRoomEngine } from '../nitro/room/GetRoomEngine';

// PixelRP vape - a hit (the emulator's RpVape). The server puts the vape in the
// hand (hand item 1129) and then the puff effect (640) on the avatar. The
// puff draws nothing for its first second, and for that second the vape goes
// to the mouth: the stock drinking pose, which the client never plays for 1129
// on its own (hand items over 999 are only carried). The smoke comes as it
// goes down. Every client in the room does this for every avatar, so everyone
// sees the hit.
const VAPE_PUFF_EFFECT = 640;
const RAISE_MS = 1000;

let registered = false;

export const RegisterRpVapeRaise = () =>
{
    if(registered) return;

    const communication = GetCommunication();

    if(!communication) return;

    communication.registerMessageEvent(new RoomUnitEffectEvent((event: RoomUnitEffectEvent) =>
    {
        const parser = event.getParser();

        if(!parser || (parser.effectId !== VAPE_PUFF_EFFECT)) return;

        const roomEngine = GetRoomEngine();
        const roomId = roomEngine.activeRoomId;
        const unitId = parser.unitId;

        roomEngine.updateRoomObjectUserAction(roomId, unitId, RoomObjectVariable.FIGURE_USE_OBJECT, 1);

        setTimeout(() => roomEngine.updateRoomObjectUserAction(roomId, unitId, RoomObjectVariable.FIGURE_USE_OBJECT, 0), RAISE_MS);
    }));

    registered = true;
}
