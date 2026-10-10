import { IMessageComposer, IMessageDataWrapper, IMessageEvent, IMessageParser, MessageEvent } from '@nitrots/nitro-renderer';
import { GetConnection } from '../nitro';

// PixelRP bank deposit box (emulator DepositBox). Defined in client source and
// registered at runtime, like the turf and City Panel packets. Wire ids match
// the emulator's Resources/Revisions/1.6.6.json.
const RP_DEPOSIT_BOX = 4184; // server -> client: open with contents, or closed
const RP_DEPOSIT_MOVE = 4185; // client -> server: one move

/** DepositBox.Store / Withdraw / Rearrange */
export const DepositDirection = { Store: 0, Withdraw: 1, Rearrange: 2 };

export interface DepositBoxEntry
{
    slot: number;
    item: string;
    count: number;
}

export class RpDepositBoxParser implements IMessageParser
{
    private _open = false;
    private _openSlots = 0;
    private _items: DepositBoxEntry[] = [];
    private _notice = '';
    private _unstorable: string[] = [];

    public flush(): boolean
    {
        this._open = false;
        this._openSlots = 0;
        this._items = [];
        this._notice = '';
        this._unstorable = [];

        return true;
    }

    public parse(wrapper: IMessageDataWrapper): boolean
    {
        if(!wrapper) return false;

        this._open = wrapper.readBoolean();
        this._openSlots = wrapper.readInt();

        let count = wrapper.readInt();

        while(count-- > 0) this._items.push({ slot: wrapper.readInt(), item: wrapper.readString(), count: wrapper.readInt() });

        if(wrapper.bytesAvailable) this._notice = wrapper.readString();

        // Appended last: the items that cannot be stored (the emulator's
        // PoliceUtility.PoliceGear). Absent from an older emulator.
        if(wrapper.bytesAvailable)
        {
            let unstorable = wrapper.readInt();

            while(unstorable-- > 0) this._unstorable.push(wrapper.readString());
        }

        return true;
    }

    public get open(): boolean
    {
        return this._open;
    }

    /** Slots the player may use: 16, or 20 with VIP. */
    public get openSlots(): number
    {
        return this._openSlots;
    }

    public get items(): DepositBoxEntry[]
    {
        return this._items;
    }

    /** What to tell the player about their last move; '' for nothing. */
    public get notice(): string
    {
        return this._notice;
    }

    /** Item keys that cannot be stored - police equipment. Greyed out in the backpack. */
    public get unstorable(): string[]
    {
        return this._unstorable;
    }
}

export class RpDepositBoxEvent extends MessageEvent implements IMessageEvent
{
    constructor(callBack: Function)
    {
        super(callBack, RpDepositBoxParser);
    }

    public getParser(): RpDepositBoxParser
    {
        return this.parser as RpDepositBoxParser;
    }
}

export class RpDepositMoveComposer implements IMessageComposer<[ number, number, boolean, number ]>
{
    private _data: [ number, number, boolean, number ];

    /** One item (a click) or the whole stack (`all`, a drag); a rearrange names `toSlot`. */
    constructor(direction: number, slot: number, all: boolean, toSlot: number = 0)
    {
        this._data = [ direction, slot, all, toSlot ];
    }

    public getMessageArray()
    {
        return this._data;
    }

    public dispose(): void
    { }
}

let registered = false;

export const RegisterRpDepositBoxMessages = () =>
{
    if(registered) return;

    const connection = GetConnection();

    if(!connection) return;

    connection.registerMessages({
        events: new Map<number, Function>([
            [ RP_DEPOSIT_BOX, RpDepositBoxEvent ]
        ]),
        composers: new Map<number, Function>([
            [ RP_DEPOSIT_MOVE, RpDepositMoveComposer ]
        ])
    });

    registered = true;
}
