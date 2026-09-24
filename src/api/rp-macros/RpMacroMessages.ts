import { IMessageComposer } from '@nitrots/nitro-renderer';
import { GetConnection, SendMessageComposer } from '../nitro';

// PixelRP macros - a client-source packet, registered at runtime like the other
// rp-* packets. The wire id matches the emulator's Resources/Revisions/1.6.6.json.
const RP_FIRE_MACRO = 4054; // client -> server: one key press, several lines

// One macro key press that runs several lines, in order (the emulator's
// RpFireMacroEvent). The server counts the press against flood control ONCE for
// its commands, so a key bound to three commands cannot mute its owner for
// pressing it twice. Shape: the chat style, the line count, then each line.
class RpFireMacroComposer implements IMessageComposer<(string | number)[]>
{
    private _data: (string | number)[];

    constructor(styleId: number, lines: string[])
    {
        this._data = [ styleId, lines.length, ...lines ];
    }

    public getMessageArray()
    {
        return this._data;
    }

    public dispose(): void
    {
        return;
    }
}

export const SendRpFireMacro = (styleId: number, lines: string[]): void =>
{
    if(!lines || !lines.length) return;

    SendMessageComposer(new RpFireMacroComposer(styleId, lines));
}

let registered = false;

export const RegisterRpMacroMessages = () =>
{
    if(registered) return;

    const connection = GetConnection();

    if(!connection) return;

    connection.registerMessages({
        events: new Map<number, Function>(),
        composers: new Map<number, Function>([ [ RP_FIRE_MACRO, RpFireMacroComposer ] ])
    });

    registered = true;
}
