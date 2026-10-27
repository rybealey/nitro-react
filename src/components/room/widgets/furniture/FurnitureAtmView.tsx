import { FC, SyntheticEvent, useEffect, useRef, useState } from 'react';
import { ATM_DEPOSIT, ATM_WITHDRAW, RpAtmState, SendRpAtmTransaction, SendRpCloseAtm, SubscribeRpAtm, SubscribeRpBankResult } from '../../../../api/rp-phone/RpBankMessages';
import { LayoutCurrencyIcon, NitroCardContentView, NitroCardHeaderView, NitroCardView } from '../../../../common';

// PixelRP: the ATM.
//
// SERVER-OPENED. This window appears because the player walked up to an ATM
// furni and used it, never because the client decided to show it - and the
// server refuses a deposit or a withdrawal unless that is still true. Closing
// it tells the server, so the permission does not outlive the window.
//
// It knows about CHECKING and the cash in hand, and nothing else. Savings is
// not sent here and cannot be named from here, which is what makes the two
// accounts different things: one you can reach from the floor, one you have to
// sit down with the Wallet to reach.
//
// A MACHINE in a hotel window (the "ATM redesign" canvas, board B1 in PixelRP
// orange - Twist, 2026-10-25). A dark screen carries the figures - the bank
// name, the balances, the amount being keyed in and the fee - and real keys
// sit under it: the Deposit/Withdraw switch, the quick amounts with Max, the
// orange go button and the card strip. Flat colours, one accent. The orange
// is fixed rather than the player's header colour: it is the machine's own
// paint, the way a real ATM wears its bank's colours.
//
// ONE screen, not two. The old design had a home screen, an amount screen, a
// back arrow and a drawn keypad, with a deliberate void in the middle that
// read as unfinished at this size. A field and the quick amounts is what every
// other widget uses, and it removes the back-navigation entirely.
//
// A balance carries the hotel's coin, the same sprite the HUD purse on the
// same screen shows, because they are the same money. Figures WRITTEN OUT in
// a sentence - the fee, the floor, the button - take a "$" instead: a sprite
// mid-sentence is a hole in the text, and the two are the same currency said
// two ways rather than two currencies.

const QUICK_ADD: number[] = [ 3, 15, 100, 150, 500 ];

// The machine's cut of a deposit - a percentage in basis points plus a flat
// dollar - using the same integer maths as the server so the preview matches the
// receipt exactly. Mirrors BankUtility.DepositFeeBps / DepositFeeFlat /
// DepositFee: change one and change the other. The server is the authority;
// this only ever tells you in advance.
//
// Withdrawals are free, so none of this touches that side.
const DEPOSIT_FEE_BPS = 290;
const DEPOSIT_FEE_FLAT = 3;

const DepositFee = (amount: number): number =>
    (amount <= 0) ? 0 : Math.floor((amount * DEPOSIT_FEE_BPS) / 10000) + DEPOSIT_FEE_FLAT;

// The flat charge can equal or exceed a small enough deposit, so there is a floor
// below which the machine refuses. Derived the same way the server derives it,
// rather than written down as 4: that is only right while the percentage
// rounds away at this size.
const MIN_DEPOSIT = ((): number =>
{
    for(let amount = 1; amount <= 100000; amount++) if(amount > DepositFee(amount)) return amount;

    return 100000;
})();

// The machine is busy from a press of the go button until the server answers
// it - a fresh state, or a refusal - so a double-click is one transaction, not
// two: the server takes every press on its own. A press that gets no answer at
// all frees the button again after this long.
const SEND_TIMEOUT_MS = 4000;

const FormatCredits = (value: number): string => Math.max(0, value || 0).toLocaleString('en-US');

const FormatRate = (bps: number): string => String(bps / 100).replace(/\.0$/, '');

export const FurnitureAtmView: FC<{}> = props =>
{
    const [ state, setState ] = useState<RpAtmState>(null);
    const [ withdrawing, setWithdrawing ] = useState(true);
    const [ amount, setAmount ] = useState(0);
    const [ note, setNote ] = useState('');
    const [ sending, setSending ] = useState(false);
    // also the guard itself: a second click can arrive before the disabled
    // button is drawn
    const sendTimer = useRef<ReturnType<typeof setTimeout>>(null);

    useEffect(() => SubscribeRpAtm(next =>
    {
        // null is the server closing the screen: the player walked away from
        // the machine.
        setState(next);
        // Every successful transaction pushes a fresh state, so this lands
        // after one too. Clearing the amount is the answer: the figures above
        // it are what changed.
        setAmount(0);
        setNote('');
        clearTimeout(sendTimer.current);
        sendTimer.current = null;
        setSending(false);
    }), []);

    useEffect(() => SubscribeRpBankResult((outcome, message) =>
    {
        setNote(message);
        clearTimeout(sendTimer.current);
        sendTimer.current = null;
        setSending(false);
    }), []);

    useEffect(() => () => clearTimeout(sendTimer.current), []);

    if(!state) return null;

    const available = withdrawing ? state.current : state.cash;
    const empty = (available <= 0);
    // Only deposits have a floor, and only because of the flat half of the fee.
    const tooSmall = (!withdrawing && !!amount && (amount < MIN_DEPOSIT));

    const close = () =>
    {
        SendRpCloseAtm();
        setState(null);
        setAmount(0);
        setNote('');
    };

    const pick = (next: boolean) =>
    {
        setWithdrawing(next);
        setAmount(0);
        setNote('');
    };

    // Clamped as it is typed rather than refused on submit: the machine knows
    // what it can give, so there is no reason to let somebody finish typing a
    // number it will never honour.
    const type = (value: string) =>
    {
        const digits = value.replace(/[^0-9]/g, '');

        setAmount(digits ? Math.min(available, parseInt(digits, 10)) : 0);
        setNote('');
    };

    const commit = () =>
    {
        if(!amount || tooSmall || sendTimer.current) return;

        setSending(true);
        sendTimer.current = setTimeout(() =>
        {
            sendTimer.current = null;
            setSending(false);
        }, SEND_TIMEOUT_MS);

        SendRpAtmTransaction(withdrawing ? ATM_WITHDRAW : ATM_DEPOSIT, amount);
    };

    // The keyed-in amount is drawn on the screen, with the real field lying
    // invisibly over it. Keys go on the end like a machine's keypad: the caret
    // is kept there, since the field itself cannot be seen to aim within it.
    const keepAtEnd = (event: SyntheticEvent<HTMLInputElement>) =>
    {
        const field = event.currentTarget;
        const end = field.value.length;

        if((field.selectionStart !== end) || (field.selectionEnd !== end)) field.setSelectionRange(end, end);
    };

    const word = (withdrawing ? 'Withdraw' : 'Deposit');

    return (
        <NitroCardView className="nitro-widget-atm" theme="primary-slim" uniqueKey="atm">
            <NitroCardHeaderView headerText="ATM" onCloseClick={ close } />
            <NitroCardContentView>
                <div className="atm-bezel">
                    <div className="atm-screen">
                        <div className="atm-screen-top">
                            <span className="atm-bank">Mercury Bank</span>
                            <span className="atm-tag">{ word }</span>
                        </div>
                        <div className="atm-screen-body">
                            { /* The bank balance is the figure people come to
                                 the machine to see, so it gets the room; the
                                 cash in hand sits beside it, smaller. */ }
                            <div className="atm-balances">
                                <div className="atm-balance is-bank">
                                    <span className="atm-label">Bank balance</span>
                                    <span className="atm-figure"><LayoutCurrencyIcon type={ -1 } />{ FormatCredits(state.current) }</span>
                                </div>
                                <div className="atm-balance is-cash">
                                    <span className="atm-label">Cash in hand</span>
                                    <span className="atm-figure"><LayoutCurrencyIcon type={ -1 } />{ FormatCredits(state.cash) }</span>
                                </div>
                            </div>
                            <label className="atm-amount">
                                <span className="atm-label">{ word }</span>
                                <span className="atm-amount-figure">
                                    <span className={ amount ? '' : 'is-empty' }>${ FormatCredits(amount) }</span>
                                    <span className="atm-cursor" />
                                </span>
                                <input className="atm-amount-input" type="text" inputMode="numeric"
                                    spellCheck={ false } autoComplete="off" maxLength={ 9 }
                                    value={ amount ? String(amount) : '' }
                                    onChange={ event => type(event.target.value) }
                                    onSelect={ keepAtEnd } />
                            </label>
                            { /* The fee is disclosed on the deposit side WHENEVER
                                 that side is showing, not only once an amount has
                                 been typed: a charge you find out about after
                                 committing to a number has not been disclosed, it
                                 has been confessed. With an amount in hand it
                                 stops being a rate and becomes two figures - what
                                 the machine keeps and what actually lands -
                                 because that is the part a player would otherwise
                                 work out by subtraction after the fact. */ }
                            { !withdrawing &&
                                <div className="atm-fee">
                                    { !amount &&
                                        <div className="atm-fee-row"><span>{ FormatRate(DEPOSIT_FEE_BPS) }% + ${ DEPOSIT_FEE_FLAT } machine fee on deposits</span></div> }
                                    { /* Below the floor the fee would take the
                                         whole thing, so say which figure is the
                                         problem rather than showing a net of zero
                                         and letting the server refuse it after the
                                         button has been pressed. */ }
                                    { (!!amount && (amount < MIN_DEPOSIT)) &&
                                        <div className="atm-fee-row is-net">{ `Pay in at least $${ MIN_DEPOSIT } - the fee would take it all` }</div> }
                                    { (!!amount && (amount >= MIN_DEPOSIT)) &&
                                        <>
                                            <div className="atm-fee-row">
                                                <span>Fee ({ FormatRate(DEPOSIT_FEE_BPS) }% + ${ DEPOSIT_FEE_FLAT })</span>
                                                <span className="atm-fee-figure">-${ FormatCredits(DepositFee(amount)) }</span>
                                            </div>
                                            <div className="atm-fee-row is-net">
                                                <span>Reaches your account</span>
                                                <span>${ FormatCredits(amount - DepositFee(amount)) }</span>
                                            </div>
                                        </> }
                                </div> }
                        </div>
                    </div>
                </div>
                <div className="atm-switch" role="group" aria-label="Deposit or withdraw">
                    <button type="button" className={ `atm-switch-option${ withdrawing ? '' : ' is-on' }` } aria-pressed={ !withdrawing } onClick={ event => pick(false) }>Deposit</button>
                    <button type="button" className={ `atm-switch-option${ withdrawing ? ' is-on' : '' }` } aria-pressed={ withdrawing } onClick={ event => pick(true) }>Withdraw</button>
                </div>
                { /* Keys grey out rather than disappear: a row that reflows
                     as you type is harder to aim at than one that dims. */ }
                <div className="atm-keys">
                    { QUICK_ADD.map(value => (
                        <button key={ value } type="button" className="atm-key" disabled={ ((amount + value) > available) }
                            onClick={ event => setAmount(amount + value) }>+{ value }</button>
                    )) }
                    <button type="button" className="atm-key" disabled={ empty } onClick={ event => setAmount(available) }>Max</button>
                </div>
                { /* One line that always names the figure limiting this screen.
                     With nothing to work with it says so instead - a row of dead
                     keys and no explanation reads as broken. */ }
                { !note &&
                    <div className={ `atm-helper${ empty ? ' is-error' : '' }` }>
                        { empty
                            ? (withdrawing ? 'Your bank account is empty.' : 'You have no cash to deposit.')
                            : (withdrawing ? `You can take out up to $${ FormatCredits(available) }.` : `You have $${ FormatCredits(available) } in hand.`) }
                    </div> }
                { !!note && <div className="atm-helper is-error">{ note }</div> }
                <button type="button" className="atm-go" disabled={ !amount || tooSmall || sending } onClick={ commit }>
                    { amount ? `${ word } $${ FormatCredits(amount) }` : word }
                </button>
                <div className="atm-card">
                    <span className="atm-card-icon" />
                    <span className="atm-card-state"><span className="atm-card-light" />Card inserted</span>
                    <button type="button" className="atm-eject" onClick={ close }>Eject card</button>
                </div>
            </NitroCardContentView>
        </NitroCardView>
    );
}
