import { IMessageDataWrapper, IMessageEvent, IMessageParser, MessageEvent } from '@nitrots/nitro-renderer';
import { GetConnection } from '../nitro';

// PixelRP: "open the jukebox" - the server's answer to double-clicking any furni
// with the jukebox behaviour (emulator InteractorJukebox).
//
// Furni whose ART is a jukebox already opens Siri client-side: the renderer's
// FurnitureJukeboxLogic fires REQUEST_PLAYLIST_EDITOR (MusicPlayerView). Art
// with any other logic - a sound block, a plain multistate - only sends a use,
// so this packet is what lets the Function Tool make ANY furni a jukebox.
// Defined client-side and registered at runtime, like the gang packets; the
// wire id matches the emulator's Resources/Revisions/1.6.6.json.
const RP_JUKEBOX_OPEN = 4152; // server -> client

export class RpJukeboxOpenParser implements IMessageParser
{
    public flush(): boolean
    {
        return true;
    }

    public parse(wrapper: IMessageDataWrapper): boolean
    {
        return !!wrapper;
    }
}

export class RpJukeboxOpenEvent extends MessageEvent implements IMessageEvent
{
    constructor(callBack: Function)
    {
        super(callBack, RpJukeboxOpenParser);
    }

    public getParser(): RpJukeboxOpenParser
    {
        return this.parser as RpJukeboxOpenParser;
    }
}

let registered = false;

export const RegisterRpJukeboxOpenMessages = () =>
{
    if(registered) return;

    const connection = GetConnection();

    if(!connection) return;

    connection.registerMessages({
        events: new Map<number, Function>([
            [ RP_JUKEBOX_OPEN, RpJukeboxOpenEvent ]
        ]),
        composers: new Map<number, Function>()
    });

    registered = true;
}
