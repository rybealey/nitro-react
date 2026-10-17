import { IMessageDataWrapper, IMessageEvent, IMessageParser, MessageEvent } from '@nitrots/nitro-renderer';
import { useEffect, useState } from 'react';
import { GetConnection } from '../nitro';

// PixelRP: the city's clock (emulator GameClock, Twist 2026-10-18). A whole
// in-game day passes in 90 real minutes - day 7 AM to 7 PM, night 7 PM to
// 7 AM, 45 minutes each - and everybody sees the same time.
//
// The server sends how far into the 90-minute cycle it is (packet 4210, at
// login and whenever staff pin or free the time) and this runs the clock on
// from there, so a player's own computer clock being wrong never moves it.
// The cycle is Unix time modulo 90 minutes on both ends, so until that packet
// arrives the computer's own clock gives the same answer, give or take its
// error.
//
// Only the day/night look follows this clock. The weather itself stays the
// real San Francisco reading.

const RP_GAME_CLOCK = 4210; // server -> client: cycle offset, cycle length, staff pin

const MINUTES_PER_DAY = (24 * 60);

/** Morning: 7 AM, in minutes after midnight. */
export const GAME_DAY_STARTS = (7 * 60);

/** Night: 7 PM, in minutes after midnight. */
export const GAME_NIGHT_STARTS = (19 * 60);

let cycleMs = (90 * 60 * 1000);
let cycleOffsetMs = -1;
let receivedAt = 0;
let pinnedMinutes = -1;

export class RpGameClockParser implements IMessageParser
{
    private _cycleOffsetMs = 0;
    private _cycleMs = 0;
    private _pinnedMinutes = -1;

    public flush(): boolean
    {
        this._cycleOffsetMs = 0;
        this._cycleMs = 0;
        this._pinnedMinutes = -1;

        return true;
    }

    public parse(wrapper: IMessageDataWrapper): boolean
    {
        if(!wrapper) return false;

        this._cycleOffsetMs = wrapper.readInt();
        this._cycleMs = wrapper.readInt();
        this._pinnedMinutes = wrapper.readInt();

        return true;
    }

    public get cycleOffsetMs(): number { return this._cycleOffsetMs; }
    public get cycleMs(): number { return this._cycleMs; }
    public get pinnedMinutes(): number { return this._pinnedMinutes; }
}

export class RpGameClockEvent extends MessageEvent implements IMessageEvent
{
    constructor(callBack: Function)
    {
        super(callBack, RpGameClockParser);
    }

    public getParser(): RpGameClockParser
    {
        return this.parser as RpGameClockParser;
    }
}

let registered = false;

export const RegisterRpGameClockMessages = () =>
{
    if(registered) return;

    const connection = GetConnection();

    if(!connection) return;

    connection.registerMessages({
        events: new Map<number, Function>([ [ RP_GAME_CLOCK, RpGameClockEvent ] ]),
        composers: new Map<number, Function>()
    });

    registered = true;
}

const listeners = new Set<() => void>();

export const SetGameClock = (offsetMs: number, lengthMs: number, pinned: number) =>
{
    if(lengthMs > 0) cycleMs = lengthMs;

    cycleOffsetMs = offsetMs;
    receivedAt = Date.now();
    pinnedMinutes = pinned;

    listeners.forEach(listener => listener());
}

/** The in-game time of day in minutes after midnight (fractional), or where staff have pinned it. */
export const GameMinutes = (): number =>
{
    if(pinnedMinutes >= 0) return pinnedMinutes;

    const into = ((cycleOffsetMs >= 0) ? (cycleOffsetMs + (Date.now() - receivedAt)) : Date.now());
    const ms = (((into % cycleMs) + cycleMs) % cycleMs);

    return ((ms * MINUTES_PER_DAY) / cycleMs);
}

/** 7 AM up to (not including) 7 PM. */
export const IsGameDay = (minutes: number = GameMinutes()): boolean => ((minutes >= GAME_DAY_STARTS) && (minutes < GAME_NIGHT_STARTS));

/**
 * The in-game minutes, re-read every `everyMs` and whenever the server
 * re-sends the clock. One in-game minute is 3.75 real seconds.
 */
export const useGameMinutes = (everyMs: number = 1000): number =>
{
    const [ minutes, setMinutes ] = useState(() => GameMinutes());

    useEffect(() =>
    {
        const update = () => setMinutes(GameMinutes());
        const interval = window.setInterval(update, everyMs);

        listeners.add(update);

        return () =>
        {
            window.clearInterval(interval);
            listeners.delete(update);
        }
    }, [ everyMs ]);

    return minutes;
}
