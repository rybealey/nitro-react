import { IMessageComposer } from '@nitrots/nitro-renderer';
import { GetConnection } from '../nitro';

// PixelRP: the browser guard telling the server why it is sending this player
// back to the website (emulator BrowserGuardLog). Defined in client source and
// registered at runtime, like the other RP packets; the wire id matches the
// emulator's Resources/Revisions/1.6.6.json.
const RP_BROWSER_GUARD = 4207; // client -> server: a reason and a line of detail

/** BrowserGuardLog.Reason* */
export const BrowserGuardReason = { Shortcut: 1, DevToolsOpen: 2, Automation: 3 };

export class RpBrowserGuardComposer implements IMessageComposer<[ number, string ]>
{
    private _data: [ number, string ];

    constructor(reason: number, detail: string)
    {
        this._data = [ reason, detail ];
    }

    public getMessageArray()
    {
        return this._data;
    }

    public dispose(): void
    { }
}

let registered = false;

export const RegisterRpBrowserGuardMessages = () =>
{
    if(registered) return;

    const connection = GetConnection();

    if(!connection) return;

    connection.registerMessages({
        events: new Map<number, Function>(),
        composers: new Map<number, Function>([
            [ RP_BROWSER_GUARD, RpBrowserGuardComposer ]
        ])
    });

    registered = true;
}
