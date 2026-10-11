import { IMessageComposer, IMessageDataWrapper, IMessageEvent, IMessageParser, MessageEvent } from '@nitrots/nitro-renderer';
import { GetCommunication, GetConnection, SendMessageComposer } from '../nitro';

// PixelRP gym (emulator GymState): Strength and Stamina, levels 0-10.
//
// Three things live here:
//   - your own workout panel - shown while you stand on gym equipment - and
//     your membership's time left, which the Gym bot's menu shows too. The
//     server sends it on a change and every 30 seconds; both clocks are
//     counted down locally in between, the workout's only while unpaused
//     (the same receivedAt pattern as the jail countdown);
//   - which bots in this room are Gym bots (the teller push's twin);
//   - anybody's two levels and the XP toward each next one, for their
//     profile (the XP shows when the level is hovered).

// server -> client
const RP_GYM = 4194;
const RP_GYM_BOTS = 4195;
const RP_GYM_LEVELS = 4198;

// client -> server
const RP_GYM_BOT_ACTION = 4196;
const RP_GET_GYM_LEVELS = 4197;

export const GYM_MEMBERSHIP_COST = 30;

class RpGymParser implements IMessageParser
{
    public showing = false;
    public stat = '';
    public machine = '';
    public level = 0;
    public secondsLeft = 0;
    public secondsForLevel = 0;
    public membershipSeconds = 0;
    public pause = '';

    public flush(): boolean
    {
        this.showing = false;
        this.stat = '';
        this.machine = '';
        this.level = 0;
        this.secondsLeft = 0;
        this.secondsForLevel = 0;
        this.membershipSeconds = 0;
        this.pause = '';

        return true;
    }

    public parse(wrapper: IMessageDataWrapper): boolean
    {
        if(!wrapper) return false;

        this.showing = wrapper.readBoolean();
        this.stat = wrapper.readString();
        this.machine = wrapper.readString();
        this.level = wrapper.readInt();
        this.secondsLeft = wrapper.readInt();
        this.secondsForLevel = wrapper.readInt();
        this.membershipSeconds = wrapper.readInt();
        this.pause = wrapper.readString();

        return true;
    }
}

class RpGymEvent extends MessageEvent implements IMessageEvent
{
    constructor(callback: Function)
    {
        super(callback, RpGymParser);
    }

    public getParser(): RpGymParser
    {
        return this.parser as RpGymParser;
    }
}

class RpGymBotsParser implements IMessageParser
{
    public virtualIds: number[] = [];

    public flush(): boolean
    {
        this.virtualIds = [];

        return true;
    }

    public parse(wrapper: IMessageDataWrapper): boolean
    {
        if(!wrapper) return false;

        const total = wrapper.readInt();
        const ids: number[] = [];

        for(let i = 0; i < total; i++) ids.push(wrapper.readInt());

        this.virtualIds = ids;

        return true;
    }
}

class RpGymBotsEvent extends MessageEvent implements IMessageEvent
{
    constructor(callback: Function)
    {
        super(callback, RpGymBotsParser);
    }

    public getParser(): RpGymBotsParser
    {
        return this.parser as RpGymBotsParser;
    }
}

class RpGymLevelsParser implements IMessageParser
{
    public userId = 0;
    public strength = 0;
    public stamina = 0;
    public strengthXp = 0;
    public strengthXpNeeded = 0;
    public staminaXp = 0;
    public staminaXpNeeded = 0;

    public flush(): boolean
    {
        this.userId = 0;
        this.strength = 0;
        this.stamina = 0;
        this.strengthXp = 0;
        this.strengthXpNeeded = 0;
        this.staminaXp = 0;
        this.staminaXpNeeded = 0;

        return true;
    }

    public parse(wrapper: IMessageDataWrapper): boolean
    {
        if(!wrapper) return false;

        this.userId = wrapper.readInt();
        this.strength = wrapper.readInt();
        this.stamina = wrapper.readInt();
        // XP toward each next level, and what it takes - 0 / 0 at level 10.
        this.strengthXp = wrapper.readInt();
        this.strengthXpNeeded = wrapper.readInt();
        this.staminaXp = wrapper.readInt();
        this.staminaXpNeeded = wrapper.readInt();

        return true;
    }
}

class RpGymLevelsEvent extends MessageEvent implements IMessageEvent
{
    constructor(callback: Function)
    {
        super(callback, RpGymLevelsParser);
    }

    public getParser(): RpGymLevelsParser
    {
        return this.parser as RpGymLevelsParser;
    }
}

class RpGymComposer implements IMessageComposer<(string | number)[]>
{
    private _data: (string | number)[];

    constructor(...data: (string | number)[])
    {
        this._data = data;
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

export class RpGymBotActionComposer extends RpGymComposer
{
    constructor(botVirtualId: number)
    {
        super(botVirtualId);
    }
}

export class RpGetGymLevelsComposer extends RpGymComposer
{
    constructor(userId: number)
    {
        super(userId);
    }
}

/**
 * Your workout as last sent, and when "then" was on performance.now(), so the
 * clocks run on locally between sends.
 */
export interface GymWorkout
{
    showing: boolean;
    stat: string;
    machine: string;
    level: number;
    secondsLeft: number;
    secondsForLevel: number;
    membershipSeconds: number;
    pause: string;
    receivedAt: number;
}

let workout: GymWorkout = { showing: false, stat: '', machine: '', level: 0, secondsLeft: 0, secondsForLevel: 0, membershipSeconds: 0, pause: '', receivedAt: 0 };
let gymBots: number[] = [];
/** One player's levels, and the XP toward each next level (needed 0 at level 10). */
export interface GymLevels
{
    strength: number;
    strengthXp: number;
    strengthXpNeeded: number;
    stamina: number;
    staminaXp: number;
    staminaXpNeeded: number;
}

const levelsByUserId: Map<number, GymLevels> = new Map();
const listeners = new Set<() => void>();

const notify = () => listeners.forEach(listener => listener());

export const GetGymWorkout = (): GymWorkout => workout;

/** Seconds since the last send, as of `now` (performance.now()). */
const elapsedOf = (now: number) => Math.max(0, (now - workout.receivedAt) / 1000);

/** Membership seconds left now - it counts down whenever you are online. */
export const GymMembershipLeft = (now: number = performance.now()): number =>
    Math.max(0, workout.membershipSeconds - elapsedOf(now));

/** Workout seconds left to the next level now - frozen while paused. */
export const GymSecondsLeft = (now: number = performance.now()): number =>
    workout.pause ? workout.secondsLeft : Math.max(0, workout.secondsLeft - elapsedOf(now));

export const IsGymBot = (virtualId: number): boolean => (gymBots.indexOf(virtualId) >= 0);

export const GetGymLevels = (userId: number): GymLevels => levelsByUserId.get(userId) ?? null;

/** The profile hover's line: "650 / 1,000 XP", or "Max level" at 10. */
export const GymXpText = (xp: number, needed: number): string =>
    (needed > 0) ? `${ xp.toLocaleString() } / ${ needed.toLocaleString() } XP` : 'Max level';

export const SubscribeGym = (listener: () => void): (() => void) =>
{
    listeners.add(listener);

    return () =>
    {
        listeners.delete(listener);
    };
}

export const SendGymBuyMembership = (botVirtualId: number): void =>
    SendMessageComposer(new RpGymBotActionComposer(botVirtualId));

/** Levels change, so a profile asks every time it opens. */
export const RequestGymLevels = (userId: number): void =>
{
    if(!userId) return;

    SendMessageComposer(new RpGetGymLevelsComposer(userId));
}

let registered = false;

// Called once from App at CONNECTION_AUTHENTICATED, with the other Rp packets,
// so a send that lands before the views mount is kept.
export const RegisterRpGymMessages = () =>
{
    if(registered) return;

    const connection = GetConnection();

    if(!connection) return;

    connection.registerMessages({
        events: new Map<number, Function>([
            [ RP_GYM, RpGymEvent ],
            [ RP_GYM_BOTS, RpGymBotsEvent ],
            [ RP_GYM_LEVELS, RpGymLevelsEvent ]
        ]),
        composers: new Map<number, Function>([
            [ RP_GYM_BOT_ACTION, RpGymBotActionComposer ],
            [ RP_GET_GYM_LEVELS, RpGetGymLevelsComposer ]
        ])
    });

    GetCommunication().registerMessageEvent(new RpGymEvent((event: RpGymEvent) =>
    {
        const parser = event.getParser();

        workout = {
            showing: parser.showing,
            stat: parser.stat,
            machine: parser.machine,
            level: parser.level,
            secondsLeft: parser.secondsLeft,
            secondsForLevel: parser.secondsForLevel,
            membershipSeconds: parser.membershipSeconds,
            pause: parser.pause,
            receivedAt: performance.now()
        };
        notify();
    }));

    GetCommunication().registerMessageEvent(new RpGymBotsEvent((event: RpGymBotsEvent) =>
    {
        gymBots = event.getParser().virtualIds;
        notify();
    }));

    GetCommunication().registerMessageEvent(new RpGymLevelsEvent((event: RpGymLevelsEvent) =>
    {
        const parser = event.getParser();

        if(!parser.userId) return;

        levelsByUserId.set(parser.userId, {
            strength: parser.strength,
            strengthXp: parser.strengthXp,
            strengthXpNeeded: parser.strengthXpNeeded,
            stamina: parser.stamina,
            staminaXp: parser.staminaXp,
            staminaXpNeeded: parser.staminaXpNeeded
        });
        notify();
    }));

    registered = true;
}
