import { FC, useEffect, useState } from 'react';
import { ATM_DEPOSIT, ATM_WITHDRAW, RpAtmState, SendRpAtmTransaction, SendRpCloseAtm, SubscribeRpAtm, SubscribeRpBankResult } from '../../../../api/rp-phone/RpBankMessages';
import { Button, Column, Flex, LayoutCurrencyIcon, NitroCardContentView, NitroCardHeaderView, NitroCardView, Text } from '../../../../common';

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
// It is a HOTEL WINDOW, not a machine. It used to draw its own dark screen and
// its own green-and-orange accents; now it is the same object as the Mannequin
// or the Exchange - the card's own light content area and the kit's own
// Buttons. The header is the one brand surface in a window and it is the
// PLAYER's choice (orange, pink or purple in Settings), so the body picks no
// brand colour of its own: it would clash with two of the three.
//
// ONE screen, not two. The old design had a home screen, an amount screen, a
// back arrow and a drawn keypad, with a deliberate void in the middle that
// read as unfinished at this size. The keypad belonged to the machine
// metaphor; a field and five quick-adds is what every other widget uses, and
// it removes the back-navigation entirely.
//
// Figures are credits with the hotel's own credits icon rather than a dollar
// sign. The HUD purse sits on the same screen, and a second currency symbol
// next to it would read as a second currency.

const QUICK_ADD: number[] = [ 3, 15, 100, 150, 500 ];

// The machine's cut of a deposit - a percentage in basis points plus a flat
// coin - using the same integer maths as the server so the preview matches the
// receipt exactly. Mirrors BankUtility.DepositFeeBps / DepositFeeFlat /
// DepositFee: change one and change the other. The server is the authority;
// this only ever tells you in advance.
//
// Withdrawals are free, so none of this touches that side.
const DEPOSIT_FEE_BPS = 290;
const DEPOSIT_FEE_FLAT = 3;

const DepositFee = (amount: number): number =>
    (amount <= 0) ? 0 : Math.floor((amount * DEPOSIT_FEE_BPS) / 10000) + DEPOSIT_FEE_FLAT;

// The flat coin can equal or exceed a small enough deposit, so there is a floor
// below which the machine refuses. Derived the same way the server derives it,
// rather than written down as 4: that is only right while the percentage
// rounds away at this size.
const MIN_DEPOSIT = ((): number =>
{
    for(let amount = 1; amount <= 100000; amount++) if(amount > DepositFee(amount)) return amount;

    return 100000;
})();

const FormatCredits = (value: number): string => Math.max(0, value || 0).toLocaleString('en-US');

const FormatRate = (bps: number): string => String(bps / 100).replace(/\.0$/, '');

export const FurnitureAtmView: FC<{}> = props =>
{
    const [ state, setState ] = useState<RpAtmState>(null);
    const [ withdrawing, setWithdrawing ] = useState(true);
    const [ amount, setAmount ] = useState(0);
    const [ note, setNote ] = useState('');

    useEffect(() => SubscribeRpAtm(next =>
    {
        setState(next);
        // Every successful transaction pushes a fresh state, so this lands
        // after one too. Clearing the amount is the answer: the figures above
        // it are what changed.
        setAmount(0);
        setNote('');
    }), []);

    useEffect(() => SubscribeRpBankResult((outcome, message) => setNote(message)), []);

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
        if(!amount || tooSmall) return;

        SendRpAtmTransaction(withdrawing ? ATM_WITHDRAW : ATM_DEPOSIT, amount);
    };

    return (
        <NitroCardView className="nitro-widget-atm" theme="primary-slim" uniqueKey="atm">
            <NitroCardHeaderView headerText="ATM" onCloseClick={ close } />
            <NitroCardContentView>
                <div className="atm-balances">
                    <div className="atm-balance">
                        <Text small>Bank balance</Text>
                        <span className="atm-figure"><LayoutCurrencyIcon type={ -1 } />{ FormatCredits(state.current) }</span>
                    </div>
                    <div className="atm-balance">
                        <Text small>Cash on hand</Text>
                        <span className="atm-figure"><LayoutCurrencyIcon type={ -1 } />{ FormatCredits(state.cash) }</span>
                    </div>
                </div>
                { /* The chosen side is the solid primary and the other is a
                     plain light button: two buttons of equal weight would make
                     you read both before knowing which one you are on. */ }
                <Flex gap={ 2 }>
                    <Button fullWidth variant={ withdrawing ? 'light' : 'primary' } onClick={ event => pick(false) }>Deposit</Button>
                    <Button fullWidth variant={ withdrawing ? 'primary' : 'light' } onClick={ event => pick(true) }>Withdraw</Button>
                </Flex>
                <Column gap={ 1 }>
                    <Text bold small>{ withdrawing ? 'How much to take out' : 'How much to pay in' }</Text>
                    <Flex gap={ 2 }>
                        <input className="form-control form-control-sm atm-amount" type="text" inputMode="numeric"
                            spellCheck={ false } maxLength={ 9 } placeholder="0"
                            value={ amount ? String(amount) : '' }
                            onChange={ event => type(event.target.value) } />
                        <Button variant="light" onClick={ event => setAmount(available) }>Max</Button>
                    </Flex>
                </Column>
                { /* Quick-adds grey out rather than disappear: a row that
                     reflows as you type is harder to aim at than one that dims. */ }
                <div className="atm-chips">
                    { QUICK_ADD.map(value =>
                    {
                        const off = ((amount + value) > available);

                        return (
                            <div key={ value } className={ `atm-chip${ off ? ' is-off' : '' }` }
                                onClick={ event => (!off && setAmount(amount + value)) }>+{ value }</div>
                        );
                    }) }
                </div>
                { /* One line that always names the figure limiting this screen.
                     With nothing to work with it says so instead - a row of dead
                     chips and no explanation reads as broken. */ }
                { !note &&
                    <Text small className={ empty ? 'text-danger' : 'atm-helper' }>
                        { empty
                            ? (withdrawing ? 'There is nothing in your account to take out.' : 'You are not carrying any cash to pay in.')
                            : (withdrawing ? `You can take out up to ${ FormatCredits(available) }c.` : `You are carrying ${ FormatCredits(available) }c.`) }
                    </Text> }
                { !!note && <Text small className="text-danger">{ note }</Text> }
                { /* The fee is disclosed on the deposit side WHENEVER that side
                     is showing, not only once an amount has been typed: a
                     charge you find out about after committing to a number has
                     not been disclosed, it has been confessed. With an amount
                     in hand it stops being a rate and becomes two figures -
                     what the machine keeps and what actually lands - because
                     that is the part a player would otherwise work out by
                     subtraction after the fact. */ }
                { !withdrawing &&
                    <div className="atm-fee">
                        <Text small className="atm-fee-rate">{ FormatRate(DEPOSIT_FEE_BPS) }% + { DEPOSIT_FEE_FLAT }c machine fee on deposits</Text>
                        { /* Below the floor the fee would take the whole thing,
                             so say which figure is the problem rather than
                             showing a net of zero and letting the server
                             refuse it after the button has been pressed. */ }
                        { (!!amount && (amount < MIN_DEPOSIT)) &&
                            <Text small bold className="atm-fee-under">{ `Pay in at least ${ MIN_DEPOSIT }c - the fee would take it all` }</Text> }
                        { /* Label and figure on one row each, the same shape as
                             the balances at the top of the card - a sentence
                             wraps to two lines the moment the numbers get long,
                             and these two are meant to be compared at a glance
                             rather than read. */ }
                        { (!!amount && (amount >= MIN_DEPOSIT)) &&
                            <>
                                <div className="atm-fee-row">
                                    <Text small>Fee</Text>
                                    <Text small>{ FormatCredits(DepositFee(amount)) }c</Text>
                                </div>
                                <div className="atm-fee-row is-net">
                                    <Text small bold>Reaches your account</Text>
                                    <Text small bold>{ FormatCredits(amount - DepositFee(amount)) }c</Text>
                                </div>
                            </> }
                    </div> }
                <Button fullWidth variant="success" disabled={ !amount || tooSmall } onClick={ commit }>
                    { amount
                        ? `${ withdrawing ? 'Withdraw' : 'Deposit' } ${ FormatCredits(amount) }c`
                        : (withdrawing ? 'Withdraw' : 'Deposit') }
                </Button>
                <Flex center>
                    <Text small underline pointer onClick={ close }>Eject card</Text>
                </Flex>
            </NitroCardContentView>
        </NitroCardView>
    );
}
