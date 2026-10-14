import { IMessageComposer, IMessageDataWrapper, IMessageEvent, IMessageParser, MessageEvent } from '@nitrots/nitro-renderer';
import { useEffect, useState } from 'react';
import { GetCommunication, GetConnection, SendMessageComposer } from '../nitro';

// PixelRP: a player's favourite shop categories (RpCatalogFavouriteEvent).
// The list lives on the server, per account, and is asked for once - the
// first time the shop's category list is drawn. Starring changes it here at
// once and the server's reply, always the whole list, has the last word: a
// star it refused (a full list, a page this player cannot open) comes back off.
//
// Kept out of useCatalog on purpose - see CatalogMoveFurniView.

// client -> server
const RP_CATALOG_FAVOURITES_REQUEST = 4202;
const RP_CATALOG_FAVOURITE = 4204;

// server -> client
const RP_CATALOG_FAVOURITES = 4203;

class CatalogFavouritesParser implements IMessageParser
{
    public pageIds: number[] = [];

    public flush(): boolean
    {
        this.pageIds = [];

        return true;
    }

    public parse(wrapper: IMessageDataWrapper): boolean
    {
        this.pageIds = [];

        let count = wrapper.readInt();

        while(count > 0)
        {
            this.pageIds.push(wrapper.readInt());

            count--;
        }

        return true;
    }
}

class CatalogFavouritesEvent extends MessageEvent implements IMessageEvent
{
    constructor(callback: Function)
    {
        super(callback, CatalogFavouritesParser);
    }

    public getParser(): CatalogFavouritesParser
    {
        return this.parser as CatalogFavouritesParser;
    }
}

class CatalogFavouritesRequestComposer implements IMessageComposer<[]>
{
    public getMessageArray(): []
    {
        return [];
    }

    public dispose(): void
    {
        return;
    }
}

// The constructor arguments ARE the wire payload, in order.
class CatalogFavouriteComposer implements IMessageComposer<(number | boolean)[]>
{
    private _data: (number | boolean)[];

    constructor(pageId: number, favourite: boolean)
    {
        this._data = [ pageId, favourite ];
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

let registered = false;
let requested = false;
let favourites: number[] = [];
// The Favourites category starts unfolded; folding it is remembered for the
// rest of the session, in either tab it shows in.
let folderOpen = true;
const listeners = new Set<() => void>();

const notify = () =>
{
    for(const listener of Array.from(listeners)) listener();
}

const register = (): boolean =>
{
    if(registered) return true;

    const connection = GetConnection();

    if(!connection) return false;

    connection.registerMessages({
        events: new Map<number, Function>([ [ RP_CATALOG_FAVOURITES, CatalogFavouritesEvent ] ]),
        composers: new Map<number, Function>([
            [ RP_CATALOG_FAVOURITES_REQUEST, CatalogFavouritesRequestComposer ],
            [ RP_CATALOG_FAVOURITE, CatalogFavouriteComposer ]
        ])
    });

    GetCommunication().registerMessageEvent(new CatalogFavouritesEvent((event: CatalogFavouritesEvent) =>
    {
        favourites = event.getParser().pageIds.slice();
        notify();
    }));

    registered = true;

    return true;
}

const EnsureCatalogFavourites = () =>
{
    if(requested || !register()) return;

    requested = true;

    SendMessageComposer(new CatalogFavouritesRequestComposer());
}

export const ToggleCatalogFavourite = (pageId: number) =>
{
    if(!register()) return;

    const favourite = (favourites.indexOf(pageId) < 0);

    favourites = (favourite ? [ ...favourites, pageId ] : favourites.filter(id => (id !== pageId)));
    notify();

    SendMessageComposer(new CatalogFavouriteComposer(pageId, favourite));
}

export const SetCatalogFavouritesOpen = (open: boolean) =>
{
    folderOpen = open;
    notify();
}

export const useCatalogFavourites = () =>
{
    const [ , setTick ] = useState(0);

    useEffect(() =>
    {
        const listener = () => setTick(value => (value + 1));

        listeners.add(listener);
        EnsureCatalogFavourites();

        return () =>
        {
            listeners.delete(listener);
        };
    }, []);

    return { favourites, folderOpen, isFavourite: (pageId: number) => (favourites.indexOf(pageId) >= 0) };
}
