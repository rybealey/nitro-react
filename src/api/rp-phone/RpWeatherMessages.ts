import { IMessageComposer, IMessageDataWrapper, IMessageEvent, IMessageParser, MessageEvent } from '@nitrots/nitro-renderer';
import { GetConnection } from '../nitro';

// PixelRP phone Weather packets - client-source, registered at runtime.
// Wire ids match the emulator's Resources/Revisions/1.6.6.json.
const RP_WEATHER = 4009; // server -> client: the hotel's weather snapshot
const RP_GET_WEATHER = 4010; // client -> server: phone opened the app

export interface WeatherHour
{
    label: string;
    temp: number;
    code: number;
    precip: number;
    isDay: boolean;
}

export interface WeatherDay
{
    label: string;
    code: number;
    lo: number;
    hi: number;
}

// One reading of the real San Francisco, labels already in Pacific time.
export interface WeatherSnapshot
{
    fetchedAt: number;
    localTime: string;
    temp: number;
    feelsLike: number;
    humidity: number;
    code: number;
    isDay: boolean;
    wind: number;
    gusts: number;
    windDir: number;
    // tenths of a mile / tenths of an index
    visibilityTenths: number;
    dewPoint: number;
    uvTenths: number;
    hi: number;
    lo: number;
    sunrise: string;
    sunset: string;
    hourly: WeatherHour[];
    daily: WeatherDay[];
}

export class RpWeatherParser implements IMessageParser
{
    private _failures: number;
    private _snapshot: WeatherSnapshot;

    public flush(): boolean
    {
        this._failures = 0;
        this._snapshot = null;

        return true;
    }

    public parse(wrapper: IMessageDataWrapper): boolean
    {
        if(!wrapper) return false;

        this._failures = wrapper.readInt();

        if(wrapper.readInt() !== 1)
        {
            this._snapshot = null;

            return true;
        }

        const snapshot: WeatherSnapshot = {
            fetchedAt: wrapper.readInt(),
            localTime: wrapper.readString(),
            temp: wrapper.readInt(),
            feelsLike: wrapper.readInt(),
            humidity: wrapper.readInt(),
            code: wrapper.readInt(),
            isDay: (wrapper.readInt() === 1),
            wind: wrapper.readInt(),
            gusts: wrapper.readInt(),
            windDir: wrapper.readInt(),
            visibilityTenths: wrapper.readInt(),
            dewPoint: wrapper.readInt(),
            uvTenths: wrapper.readInt(),
            hi: wrapper.readInt(),
            lo: wrapper.readInt(),
            sunrise: wrapper.readString(),
            sunset: wrapper.readString(),
            hourly: [],
            daily: []
        };

        const hourCount = wrapper.readInt();

        for(let i = 0; i < hourCount; i++)
        {
            snapshot.hourly.push({ label: wrapper.readString(), temp: wrapper.readInt(), code: wrapper.readInt(), precip: wrapper.readInt(), isDay: (wrapper.readInt() === 1) });
        }

        const dayCount = wrapper.readInt();

        for(let i = 0; i < dayCount; i++)
        {
            snapshot.daily.push({ label: wrapper.readString(), code: wrapper.readInt(), lo: wrapper.readInt(), hi: wrapper.readInt() });
        }

        this._snapshot = snapshot;

        return true;
    }

    // refreshes that have failed since the last good reading
    public get failures(): number { return this._failures; }
    public get snapshot(): WeatherSnapshot { return this._snapshot; }
}

export class RpWeatherEvent extends MessageEvent implements IMessageEvent
{
    constructor(callBack: Function)
    {
        super(callBack, RpWeatherParser);
    }

    public getParser(): RpWeatherParser
    {
        return this.parser as RpWeatherParser;
    }
}

export class RpGetWeatherComposer implements IMessageComposer<(string | number)[]>
{
    private _data: (string | number)[];

    constructor()
    {
        this._data = [];
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

export const RegisterRpWeatherMessages = () =>
{
    if(registered) return;

    const connection = GetConnection();

    if(!connection) return;

    connection.registerMessages({
        events: new Map<number, Function>([ [ RP_WEATHER, RpWeatherEvent ] ]),
        composers: new Map<number, Function>([ [ RP_GET_WEATHER, RpGetWeatherComposer ] ])
    });

    registered = true;
}
