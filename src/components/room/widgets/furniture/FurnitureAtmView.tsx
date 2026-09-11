import { FC, useEffect, useState } from 'react';
import { ATM_DEPOSIT, ATM_WITHDRAW, RpAtmState, SendRpAtmTransaction, SendRpCloseAtm, SubscribeRpAtm, SubscribeRpBankResult } from '../../../../api/rp-phone/RpBankMessages';
import { LayoutCurrencyIcon, NitroCardContentView, NitroCardHeaderView, NitroCardView } from '../../../../common';

// PixelRP: the ATM.
//
// SERVER-OPENED. This window appears because the player walked up to an ATM
// furni and used it, never because the client decided to show it - and the
// server refuses a deposit or a withdrawal unless that is still true. Closing
// it tells the server, so the permission does not outlive the window.
//
// It knows about CHECKING and the cash in hand, and nothing else.
// Savings is not sent here and cannot be named from here, which is what makes
// the two accounts different things: one you can reach from the floor, one you
// have to sit down with the Wallet to reach.
//
// Figures are credits with the hotel's own credits icon rather than a dollar
// sign. The HUD purse sits on the same screen, and a second currency symbol
// next to it would read as a second currency.

const QUICK_ADD: number[] = [ 3, 15, 100, 150, 500 ];

const FormatCredits = (value: number): string => Math.max(0, value || 0).toLocaleString('en-US');

export const FurnitureAtmView: FC<{}> = props =>
{
    const [ state, setState ] = useState<RpAtmState>(null);
    // null on the home screen; ATM_DEPOSIT or ATM_WITHDRAW on amount entry.
    const [ mode, setMode ] = useState<number>(null);
    const [ amount, setAmount ] = useState(0);
    const [ note, setNote ] = useState('');

    useEffect(() => SubscribeRpAtm(next =>
    {
        setState(next);
        // Every transaction sends a fresh state, so this also lands after a
        // successful deposit. Going back to the home screen with the amount
        // cleared is the answer: the figures on it are what changed.
        setMode(null);
        setAmount(0);
        setNote('');
    }), []);

    useEffect(() => SubscribeRpBankResult((outcome, message) => setNote(message)), []);

    if(!state) return null;

    const available = (mode === ATM_WITHDRAW) ? state.current : state.cash;

    const close = () =>
    {
        SendRpCloseAtm();
        setState(null);
        setMode(null);
        setAmount(0);
        setNote('');
    };

    const enter = (nextMode: number) =>
    {
        setMode(nextMode);
        setAmount(0);
        setNote('');
    };

    const press = (digit: number) =>
    {
        // Capped at the available figure while typing rather than refused on
        // submit: the machine knows what it can give, so there is no reason to
        // let somebody finish typing a number it will never honour.
        const next = Math.min(available, (amount * 10) + digit);

        setAmount(next);
        setNote('');
    };

    const add = (value: number) =>
    {
        setAmount(Math.min(available, amount + value));
        setNote('');
    };

    const commit = () =>
    {
        if(!amount) return;

        SendRpAtmTransaction(mode, amount);
    };

    return (
        <NitroCardView className="nitro-widget-atm" theme="primary-slim" uniqueKey="atm">
            <NitroCardHeaderView headerText="ATM" onCloseClick={ close } />
            <NitroCardContentView>
                <div className="atm-screen">
                    { (mode === null) &&
                        <>
                            <div className="atm-rows">
                                <div className="atm-row">
                                    <span className="atm-row-label">BANK BALANCE</span>
                                    <span className="atm-row-value"><LayoutCurrencyIcon type={ -1 } />{ FormatCredits(state.current) }</span>
                                </div>
                                <div className="atm-row">
                                    <span className="atm-row-label">CASH ON HAND</span>
                                    <span className="atm-row-value"><LayoutCurrencyIcon type={ -1 } />{ FormatCredits(state.cash) }</span>
                                </div>
                            </div>
                            { !!note && <div className="atm-note">{ note }</div> }
                            { /* The middle is deliberately empty. An ATM is two numbers
                                 and two decisions, and filling the gap with a promotion
                                 is what makes a real one feel like a kiosk. */ }
                            <div className="atm-spacer" />
                            <div className="atm-actions">
                                <div className={ `atm-key is-wide${ state.cash ? '' : ' is-off' }` }
                                    onClick={ event => (state.cash && enter(ATM_DEPOSIT)) }>DEPOSIT</div>
                                <div className={ `atm-key is-wide${ state.current ? '' : ' is-off' }` }
                                    onClick={ event => (state.current && enter(ATM_WITHDRAW)) }>WITHDRAW</div>
                            </div>
                            <div className="atm-key is-eject" onClick={ close }>EJECT CARD</div>
                        </> }
                    { (mode !== null) &&
                        <>
                            <div className="atm-entry-head">
                                <div className="atm-back" title="Back" onClick={ event => setMode(null) }>
                                    <i className="fa-solid fa-arrow-left" aria-hidden="true" />
                                </div>
                                <span>{ (mode === ATM_DEPOSIT) ? 'DEPOSIT' : 'WITHDRAW' }</span>
                            </div>
                            <div className="atm-row is-amount">
                                <span className="atm-row-label">AMOUNT</span>
                                <span className="atm-row-value"><LayoutCurrencyIcon type={ -1 } />{ FormatCredits(amount) }</span>
                            </div>
                            { /* Chips go DIM when they no longer fit rather than
                                 disappearing - the same call the Wallet's + makes.
                                 A control that vanishes reads as a bug; a dim one
                                 that still says +500 says why it cannot be used. */ }
                            <div className="atm-chips">
                                { QUICK_ADD.map(value =>
                                {
                                    const off = ((amount + value) > available);

                                    return (
                                        <div key={ value } className={ `atm-chip${ off ? ' is-off' : '' }` }
                                            onClick={ event => (!off && add(value)) }>+{ value }</div>
                                    );
                                }) }
                                <div className={ `atm-chip is-accent${ available ? '' : ' is-off' }` }
                                    onClick={ event => (available && setAmount(available)) }>MAX</div>
                            </div>
                            <div className="atm-spacer" />
                            { !!note && <div className="atm-note">{ note }</div> }
                            <div className="atm-pad">
                                { [ 1, 2, 3, 4, 5, 6, 7, 8, 9 ].map(digit =>
                                    <div key={ digit } className="atm-key" onClick={ event => press(digit) }>{ digit }</div>) }
                                <div className="atm-key is-accent is-clear" title="Clear"
                                    onClick={ event => 
                                    {
                                        setAmount(0); setNote(''); 
                                    } }>C</div>
                                { /* The reference left this cell empty. A blank key in a
                                     keypad is worse than a useful one, and backspace is
                                     the key a number pad is actually missing. */ }
                                <div className="atm-key is-backspace" title="Backspace"
                                    onClick={ event => setAmount(Math.floor(amount / 10)) }>
                                    <i className="fa-solid fa-delete-left" aria-hidden="true" />
                                </div>
                                <div className={ `atm-key is-commit${ amount ? '' : ' is-off' }` } onClick={ commit }>OK</div>
                                <div className="atm-key is-zero" onClick={ event => press(0) }>0</div>
                                <div className="atm-key is-back" onClick={ event => setMode(null) }>BACK</div>
                            </div>
                            { /* The footer restates the figure that limits this screen -
                                 what you are carrying when depositing, what the account
                                 holds when withdrawing. With checking
                                 uncapped those are the only two limits an ATM has. */ }
                            <div className="atm-row is-footer">
                                <span className="atm-row-label">{ (mode === ATM_DEPOSIT) ? 'CASH AVAILABLE' : 'BANK AVAILABLE' }</span>
                                <span className="atm-row-value"><LayoutCurrencyIcon type={ -1 } />{ FormatCredits(available) }</span>
                            </div>
                        </> }
                </div>
            </NitroCardContentView>
        </NitroCardView>
    );
}
