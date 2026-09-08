import { IMessageComposer, IMessageDataWrapper, IMessageEvent, IMessageParser, MessageEvent } from '@nitrots/nitro-renderer';
import { GetConnection } from '../nitro';

// PixelRP phone Stocks packets - client-source, registered at runtime.
// Wire ids match the emulator's Resources/Revisions/1.6.6.json.
const RP_STOCKS = 4022; // server -> client: the board
const RP_GET_STOCKS = 4022; // client -> server: give me the board for a window

// The windows the app offers. Anything else the server clamps to a day, so
// these are the only values worth sending.
export const STOCK_WINDOWS = [
    { key: '1D', minutes: 1440 },
    { key: '1W', minutes: 10080 },
    { key: '1M', minutes: 43200 },
    { key: '3M', minutes: 129600 }
];

export interface StockSample
{
    sampledAt: number;
    value: number;
}

// One corporation's stock room: what they are holding, what they can hold, and
// the readings behind the chart (oldest first, already thinned by the server).
export interface CorpStock
{
    id: number;
    // the ticker IS the acronym
    acronym: string;
    name: string;
    description: string;
    stock: number;
    capacity: number;
    samples: StockSample[];
}

export class RpStocksParser implements IMessageParser
{
    private _windowMinutes: number;
    private _corps: CorpStock[];

    public flush(): boolean
    {
        this._windowMinutes = 0;
        this._corps = [];

        return true;
    }

    public parse(wrapper: IMessageDataWrapper): boolean
    {
        if(!wrapper) return false;

        this._windowMinutes = wrapper.readInt();
        this._corps = [];

        const count = wrapper.readInt();

        for(let i = 0; i < count; i++)
        {
            const corp: CorpStock = {
                id: wrapper.readInt(),
                acronym: wrapper.readString(),
                name: wrapper.readString(),
                description: wrapper.readString(),
                stock: wrapper.readInt(),
                capacity: wrapper.readInt(),
                samples: []
            };

            const samples = wrapper.readInt();

            for(let s = 0; s < samples; s++)
            {
                corp.samples.push({ sampledAt: wrapper.readInt(), value: wrapper.readInt() });
            }

            this._corps.push(corp);
        }

        return true;
    }

    // echoed back, so a reply that lands after the range changed can be dropped
    public get windowMinutes(): number { return this._windowMinutes; }
    public get corps(): CorpStock[] { return this._corps; }
}

export class RpStocksEvent extends MessageEvent implements IMessageEvent
{
    constructor(callBack: Function)
    {
        super(callBack, RpStocksParser);
    }

    public getParser(): RpStocksParser
    {
        return this.parser as RpStocksParser;
    }
}

export class RpGetStocksComposer implements IMessageComposer<(string | number)[]>
{
    private _data: (string | number)[];

    constructor(windowMinutes: number)
    {
        this._data = [ windowMinutes ];
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

export const RegisterRpStocksMessages = () =>
{
    if(registered) return;

    const connection = GetConnection();

    if(!connection) return;

    connection.registerMessages({
        events: new Map<number, Function>([ [ RP_STOCKS, RpStocksEvent ] ]),
        composers: new Map<number, Function>([ [ RP_GET_STOCKS, RpGetStocksComposer ] ])
    });

    registered = true;
}
