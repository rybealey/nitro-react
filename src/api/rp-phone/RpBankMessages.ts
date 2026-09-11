import { IMessageComposer, IMessageDataWrapper, IMessageEvent, IMessageParser, MessageEvent } from '@nitrots/nitro-renderer';
import { GetCommunication, GetConnection, SendMessageComposer } from '../nitro';

// PixelRP: a character's bank, for the Wallet's debit card and the ATM.
//
// Two accounts, opened together. The current account is where wages land once
// a character has opened accounts, and savings earns interest for every hour
// they are actually in a room. Money moves between the two here; it only
// crosses into cash in hand at an ATM.
//
// The ATM screen is SERVER-OPENED - it arrives because the player used the
// machine, never because the client asked - and it deliberately carries less
// than the Wallet does: the current account and the cash in hand, and never
// savings. Savings is a Wallet-only account, which is the whole difference
// between the two.

// server -> client
const RP_BANK_ACCOUNTS = 4112;
const RP_BANK_RESULT = 4113;
const RP_ATM_OPEN = 4114;
const RP_BANK_LEDGER = 4115;

// client -> server
const RP_GET_BANK_ACCOUNTS = 4114;
const RP_OPEN_BANK_ACCOUNT = 4115;
const RP_BANK_TRANSFER = 4116;
const RP_ATM_TRANSACTION = 4117;
const RP_CLOSE_ATM = 4118;
const RP_GET_BANK_LEDGER = 4119;

export interface RpBankAccounts
{
    hasAccount: boolean;
    current: number;
    savings: number;
    savingsCap: number;
    rateBps: number;
    /** Seconds still to run before the next interest payment. */
    secondsToInterest: number;
    interestTotal: number;
    wagesTotal: number;
}

/** One movement, exactly as rp_bank_transactions records it. */
export interface RpBankEntry
{
    id: number;
    /** open | wages | interest | transfer_in | transfer_out | deposit | withdraw */
    kind: string;
    /** current | savings */
    account: string;
    /** Signed: negative is money leaving that account. */
    amount: number;
    balanceAfter: number;
    source: string;
    /** unix seconds */
    createdAt: number;
}

export interface RpAtmState
{
    hasAccount: boolean;
    current: number;
    cash: number;
}

/** Matches BankResult on the server. */
export const BANK_OK = 0;
export const BANK_NO_ACCOUNT = 1;
export const BANK_ALREADY_OPEN = 2;
export const BANK_INVALID_AMOUNT = 3;
export const BANK_INSUFFICIENT = 4;
export const BANK_SAVINGS_FULL = 5;
export const BANK_FAILED = 6;

/** Direction on the transfer composer. */
export const TRANSFER_TO_SAVINGS = 0;
export const TRANSFER_TO_CURRENT = 1;

/** Mode on the ATM composer. */
export const ATM_DEPOSIT = 0;
export const ATM_WITHDRAW = 1;

const EMPTY_ACCOUNTS = (): RpBankAccounts => (
    { hasAccount: false, current: 0, savings: 0, savingsCap: 0, rateBps: 0, secondsToInterest: 0, interestTotal: 0, wagesTotal: 0 });

export class RpBankAccountsParser implements IMessageParser
{
    private _accounts: RpBankAccounts = EMPTY_ACCOUNTS();

    public flush(): boolean
    {
        this._accounts = EMPTY_ACCOUNTS();

        return true;
    }

    public parse(wrapper: IMessageDataWrapper): boolean
    {
        if(!wrapper) return false;

        this._accounts = {
            hasAccount: wrapper.readInt() === 1,
            current: wrapper.readInt(),
            savings: wrapper.readInt(),
            savingsCap: wrapper.readInt(),
            rateBps: wrapper.readInt(),
            secondsToInterest: wrapper.readInt(),
            interestTotal: wrapper.readInt(),
            wagesTotal: wrapper.readInt()
        };

        return true;
    }

    public get accounts(): RpBankAccounts 
    {
        return this._accounts; 
    }
}

export class RpBankAccountsEvent extends MessageEvent implements IMessageEvent
{
    constructor(callBack: Function)
    {
        super(callBack, RpBankAccountsParser);
    }

    public getParser(): RpBankAccountsParser
    {
        return this.parser as RpBankAccountsParser;
    }
}

export class RpBankResultParser implements IMessageParser
{
    private _outcome: number = BANK_FAILED;
    private _message: string = '';

    public flush(): boolean
    {
        this._message = '';

        return true;
    }

    public parse(wrapper: IMessageDataWrapper): boolean
    {
        if(!wrapper) return false;

        this._outcome = wrapper.readInt();
        this._message = wrapper.readString();

        return true;
    }

    public get outcome(): number 
    {
        return this._outcome; 
    }
    public get message(): string 
    {
        return this._message; 
    }
}

export class RpBankResultEvent extends MessageEvent implements IMessageEvent
{
    constructor(callBack: Function)
    {
        super(callBack, RpBankResultParser);
    }

    public getParser(): RpBankResultParser
    {
        return this.parser as RpBankResultParser;
    }
}

export class RpAtmOpenParser implements IMessageParser
{
    private _state: RpAtmState = { hasAccount: false, current: 0, cash: 0 };

    public flush(): boolean
    {
        this._state = { hasAccount: false, current: 0, cash: 0 };

        return true;
    }

    public parse(wrapper: IMessageDataWrapper): boolean
    {
        if(!wrapper) return false;

        this._state = {
            hasAccount: wrapper.readInt() === 1,
            current: wrapper.readInt(),
            cash: wrapper.readInt()
        };

        return true;
    }

    public get state(): RpAtmState 
    {
        return this._state; 
    }
}

export class RpAtmOpenEvent extends MessageEvent implements IMessageEvent
{
    constructor(callBack: Function)
    {
        super(callBack, RpAtmOpenParser);
    }

    public getParser(): RpAtmOpenParser
    {
        return this.parser as RpAtmOpenParser;
    }
}

export class RpBankLedgerParser implements IMessageParser
{
    private _entries: RpBankEntry[] = [];

    public flush(): boolean
    {
        this._entries = [];

        return true;
    }

    public parse(wrapper: IMessageDataWrapper): boolean
    {
        if(!wrapper) return false;

        this._entries = [];

        let count = wrapper.readInt();

        while(count > 0)
        {
            this._entries.push({
                id: wrapper.readInt(),
                kind: wrapper.readString(),
                account: wrapper.readString(),
                amount: wrapper.readInt(),
                balanceAfter: wrapper.readInt(),
                source: wrapper.readString(),
                createdAt: wrapper.readInt()
            });

            count--;
        }

        return true;
    }

    public get entries(): RpBankEntry[] 
    {
        return this._entries; 
    }
}

export class RpBankLedgerEvent extends MessageEvent implements IMessageEvent
{
    constructor(callBack: Function)
    {
        super(callBack, RpBankLedgerParser);
    }

    public getParser(): RpBankLedgerParser
    {
        return this.parser as RpBankLedgerParser;
    }
}

class RpBankComposerBase implements IMessageComposer<(string | number)[]>
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

export class RpGetBankAccountsComposer extends RpBankComposerBase
{
    constructor() 
    {
        super(); 
    }
}

export class RpOpenBankAccountComposer extends RpBankComposerBase
{
    constructor() 
    {
        super(); 
    }
}

export class RpBankTransferComposer extends RpBankComposerBase
{
    constructor(direction: number, amount: number) 
    {
        super(direction, amount); 
    }
}

export class RpAtmTransactionComposer extends RpBankComposerBase
{
    constructor(mode: number, amount: number) 
    {
        super(mode, amount); 
    }
}

export class RpCloseAtmComposer extends RpBankComposerBase
{
    constructor() 
    {
        super(); 
    }
}

export class RpGetBankLedgerComposer extends RpBankComposerBase
{
    constructor()
    {
        super();
    }
}

// ---- the store ----------------------------------------------------------
// A module singleton like the rest: login pushes the accounts long before the
// Wallet is opened, and the ATM can arrive at any moment because the server is
// the one that decides it should.

let accounts: RpBankAccounts = EMPTY_ACCOUNTS();
let ledger: RpBankEntry[] = [];
// Distinguishes "not asked yet" from "asked, and there is nothing" - the
// difference between a skeleton and an empty state.
let ledgerLoaded = false;

const listeners = new Set<() => void>();
const resultListeners = new Set<(outcome: number, message: string) => void>();
const atmListeners = new Set<(state: RpAtmState) => void>();
const ledgerListeners = new Set<() => void>();

export const GetRpBankAccounts = (): RpBankAccounts => accounts;

export const GetRpBankLedger = (): RpBankEntry[] => ledger;

export const IsRpBankLedgerLoaded = (): boolean => ledgerLoaded;

export const SubscribeRpBankLedger = (listener: () => void): (() => void) =>
{
    ledgerListeners.add(listener);

    return () => ledgerListeners.delete(listener);
}

export const SubscribeRpBankAccounts = (listener: () => void): (() => void) =>
{
    listeners.add(listener);

    return () => listeners.delete(listener);
}

/** Refusals land here; the Wallet and the ATM show the server's own wording. */
export const SubscribeRpBankResult = (listener: (outcome: number, message: string) => void): (() => void) =>
{
    resultListeners.add(listener);

    return () => resultListeners.delete(listener);
}

/** Fires when the server opens an ATM, and again after every transaction. */
export const SubscribeRpAtm = (listener: (state: RpAtmState) => void): (() => void) =>
{
    atmListeners.add(listener);

    return () => atmListeners.delete(listener);
}

export const SendRpGetBankAccounts = (): void => SendMessageComposer(new RpGetBankAccountsComposer());

export const SendRpOpenBankAccount = (): void => SendMessageComposer(new RpOpenBankAccountComposer());

export const SendRpBankTransfer = (direction: number, amount: number): void =>
    SendMessageComposer(new RpBankTransferComposer(direction, amount));

export const SendRpAtmTransaction = (mode: number, amount: number): void =>
    SendMessageComposer(new RpAtmTransactionComposer(mode, amount));

export const SendRpCloseAtm = (): void => SendMessageComposer(new RpCloseAtmComposer());

export const SendRpGetBankLedger = (): void => SendMessageComposer(new RpGetBankLedgerComposer());

const onAccounts = (event: RpBankAccountsEvent) =>
{
    const parser = event.getParser();

    if(!parser) return;

    accounts = parser.accounts;

    listeners.forEach(listener => listener());
}

const onResult = (event: RpBankResultEvent) =>
{
    const parser = event.getParser();

    if(!parser) return;

    resultListeners.forEach(listener => listener(parser.outcome, parser.message));
}

const onLedger = (event: RpBankLedgerEvent) =>
{
    const parser = event.getParser();

    if(!parser) return;

    ledger = parser.entries;
    ledgerLoaded = true;

    ledgerListeners.forEach(listener => listener());
}

const onAtm = (event: RpAtmOpenEvent) =>
{
    const parser = event.getParser();

    if(!parser) return;

    atmListeners.forEach(listener => listener(parser.state));
}

let registered = false;

export const RegisterRpBankMessages = () =>
{
    if(registered) return;

    const connection = GetConnection();

    if(!connection) return;

    connection.registerMessages({
        events: new Map<number, Function>([
            [ RP_BANK_ACCOUNTS, RpBankAccountsEvent ],
            [ RP_BANK_RESULT, RpBankResultEvent ],
            [ RP_ATM_OPEN, RpAtmOpenEvent ],
            [ RP_BANK_LEDGER, RpBankLedgerEvent ]
        ]),
        composers: new Map<number, Function>([
            [ RP_GET_BANK_ACCOUNTS, RpGetBankAccountsComposer ],
            [ RP_OPEN_BANK_ACCOUNT, RpOpenBankAccountComposer ],
            [ RP_BANK_TRANSFER, RpBankTransferComposer ],
            [ RP_ATM_TRANSACTION, RpAtmTransactionComposer ],
            [ RP_CLOSE_ATM, RpCloseAtmComposer ],
            [ RP_GET_BANK_LEDGER, RpGetBankLedgerComposer ]
        ])
    });

    GetCommunication().registerMessageEvent(new RpBankAccountsEvent(onAccounts));
    GetCommunication().registerMessageEvent(new RpBankResultEvent(onResult));
    GetCommunication().registerMessageEvent(new RpAtmOpenEvent(onAtm));
    GetCommunication().registerMessageEvent(new RpBankLedgerEvent(onLedger));

    registered = true;
}
