import { IMessageComposer, IMessageDataWrapper, IMessageEvent, IMessageParser, MessageEvent } from '@nitrots/nitro-renderer';
import { GetCommunication, GetConnection } from '../nitro';

// PixelRP jury trials (emulator JuryTrials). Defined in client source and
// registered at runtime, like the jail packets. Wire ids match the emulator's
// Resources/Revisions/1.6.6.json.
const RP_JURY_VOTE = 4221; // server -> client: your vote card, open or closed
const RP_JURY_CAST = 4222; // client -> server: Guilty (1) or Not Guilty (2)

/** A juror's vote (emulator JuryTrials.Vote*); None = not voted yet. */
export const JuryVote = { None: 0, Guilty: 1, NotGuilty: 2 };

class RpJuryVoteParser implements IMessageParser
{
    public open = false;
    public name = '';
    public look = '';
    public gender = 'M';
    public secondsLeft = 0;
    public myVote = JuryVote.None;
    public voted = 0;
    public jurors = 0;

    public flush(): boolean
    {
        this.open = false;
        this.name = '';
        this.look = '';
        this.gender = 'M';
        this.secondsLeft = 0;
        this.myVote = JuryVote.None;
        this.voted = 0;
        this.jurors = 0;

        return true;
    }

    public parse(wrapper: IMessageDataWrapper): boolean
    {
        this.open = wrapper.readBoolean();

        if(!this.open) return true;

        this.name = wrapper.readString();
        this.look = wrapper.readString();
        this.gender = wrapper.readString();
        this.secondsLeft = wrapper.readInt();
        this.myVote = wrapper.readInt();
        this.voted = wrapper.readInt();
        this.jurors = wrapper.readInt();

        return true;
    }
}

class RpJuryVoteEvent extends MessageEvent implements IMessageEvent
{
    constructor(callback: Function)
    {
        super(callback, RpJuryVoteParser);
    }

    public getParser(): RpJuryVoteParser
    {
        return this.parser as RpJuryVoteParser;
    }
}

/** The vote card's Guilty / Not Guilty. */
export class RpJuryCastComposer implements IMessageComposer<[ number ]>
{
    private _data: [ number ];

    constructor(vote: number)
    {
        this._data = [ vote ];
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

/**
 * Your vote card as last sent - closed when you are not a juror with the
 * vote open - and when it arrived on performance.now(), so the ten seconds run
 * on locally between sends.
 */
export interface JuryVoteCard { open: boolean; name: string; look: string; gender: string; secondsLeft: number; myVote: number; voted: number; jurors: number; receivedAt: number; }

let juryVoteCard: JuryVoteCard = { open: false, name: '', look: '', gender: 'M', secondsLeft: 0, myVote: JuryVote.None, voted: 0, jurors: 0, receivedAt: 0 };
const juryListeners = new Set<() => void>();

export const GetJuryVoteCard = (): JuryVoteCard => juryVoteCard;

export const SubscribeJuryVoteCard = (listener: () => void): (() => void) =>
{
    juryListeners.add(listener);

    return () =>
    {
        juryListeners.delete(listener);
    };
}

let registered = false;

// Called once from App at CONNECTION_AUTHENTICATED, with the other Rp packets.
export const RegisterRpJuryMessages = () =>
{
    if(registered) return;

    const connection = GetConnection();

    if(!connection) return;

    connection.registerMessages({
        events: new Map<number, Function>([
            [ RP_JURY_VOTE, RpJuryVoteEvent ]
        ]),
        composers: new Map<number, Function>([
            [ RP_JURY_CAST, RpJuryCastComposer ]
        ])
    });

    GetCommunication().registerMessageEvent(new RpJuryVoteEvent((event: RpJuryVoteEvent) =>
    {
        const parser = event.getParser();

        juryVoteCard = { open: parser.open, name: parser.name, look: parser.look, gender: parser.gender, secondsLeft: parser.secondsLeft, myVote: parser.myVote, voted: parser.voted, jurors: parser.jurors, receivedAt: performance.now() };
        juryListeners.forEach(listener => listener());
    }));

    registered = true;
}
