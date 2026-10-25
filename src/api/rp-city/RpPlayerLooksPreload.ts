import { IAvatarImageListener, IMessageDataWrapper, IMessageEvent, IMessageParser, MessageEvent } from '@nitrots/nitro-renderer';
import { GetAvatarRenderManager, GetCommunication, GetConnection } from '../nitro';

// PixelRP: the clothes everyone online is wearing, downloaded in the
// background after login (emulator RpPlayerLooksComposer). A player whose
// clothes this client has not downloaded is drawn as a placeholder until they
// arrive, and each piece of clothing is its own download - so walking into a
// room of people met for the first time showed them a moment late. Sent once
// at login, as looks (no names).
const RP_PLAYER_LOOKS = 4230; // server -> client

// After the first room and the city's furni (RpCityFurniPreload, 6 s) have
// had the line to themselves.
const START_DELAY_MS = 8000;

// Two looks at a time: the avatar downloader starts every library a look
// needs at once, with no limit of its own.
const AT_ONCE = 2;

// A look whose download failed is never answered (the downloader lets its
// waiters go); move on after this long.
const LOOK_TIMEOUT_MS = 10000;

export class RpPlayerLooksParser implements IMessageParser
{
    private _looks: string[] = [];

    public flush(): boolean
    {
        this._looks = [];

        return true;
    }

    public parse(wrapper: IMessageDataWrapper): boolean
    {
        if(!wrapper) return false;

        let count = wrapper.readInt();

        while(count-- > 0) this._looks.push(wrapper.readString());

        return true;
    }

    public get looks(): string[]
    {
        return this._looks;
    }
}

export class RpPlayerLooksEvent extends MessageEvent implements IMessageEvent
{
    constructor(callback: Function)
    {
        super(callback, RpPlayerLooksParser);
    }

    public getParser(): RpPlayerLooksParser
    {
        return this.parser as RpPlayerLooksParser;
    }
}

let started = false;

// One look's clothes, or nothing once LOOK_TIMEOUT_MS has passed.
const downloadLook = (look: string): Promise<void> => new Promise(resolve =>
{
    const manager = GetAvatarRenderManager();

    if(!manager || !look) return resolve();

    const container = manager.createFigureContainer(look);

    if(manager.isFigureContainerReady(container)) return resolve();

    let done = false;

    const finish = () =>
    {
        if(done) return;

        done = true;
        listener.disposed = true;
        clearTimeout(timer);
        resolve();
    };

    const listener: IAvatarImageListener = {
        resetFigure: () => finish(),
        dispose: () => finish(),
        disposed: false
    };

    const timer = setTimeout(finish, LOOK_TIMEOUT_MS);

    manager.downloadAvatarFigure(container, listener);
});

const download = async (looks: string[]) =>
{
    const next = async () =>
    {
        while(looks.length)
        {
            try
            {
                await downloadLook(looks.shift());
            }
            catch(e)
            {
                // A look that cannot be read is downloaded by whoever wears it.
            }
        }
    }

    await Promise.all(Array.from({ length: AT_ONCE }, next));
}

const onPlayerLooks = (event: RpPlayerLooksEvent) =>
{
    if(started) return;

    const looks = event.getParser().looks.slice();

    if(!looks.length) return;

    started = true;

    setTimeout(() => download(looks), START_DELAY_MS);
}

let registered = false;

export const RegisterRpPlayerLooksPreload = () =>
{
    if(registered) return;

    const connection = GetConnection();

    if(!connection) return;

    connection.registerMessages({
        events: new Map<number, Function>([ [ RP_PLAYER_LOOKS, RpPlayerLooksEvent ] ]),
        composers: new Map<number, Function>()
    });

    GetCommunication().registerMessageEvent(new RpPlayerLooksEvent(onPlayerLooks));

    registered = true;
}
