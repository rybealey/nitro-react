import { FC, useEffect, useState } from 'react';
import { GetSessionDataManager, SendMessageComposer } from '../../api';
import { RpBirthdayEvent, RpGetBirthdayComposer, RpSaveBirthdayComposer } from '../../api/rp-phone/RpBirthdayMessages';
import { useMessageEvent } from '../../hooks';
import { PhoneAvatar } from './PhoneAvatar';
import { PhoneIcon } from './PhoneIcon';

// Account sub-screen (reached from the Settings account row). For now it
// holds one thing: the player's birthday, month and day only - no year is
// ever asked for or stored. The Birthday row expands into an inline picker
// (month chips, then a day grid); Save sends it, Remove clears it. The value
// is server-authoritative: asked for on open, redrawn from every reply.

interface PhoneAccountViewProps
{
    onBack: () => void;
}

const MONTHS: string[] = [ 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December' ];
const DAYS_IN_MONTH: number[] = [ 31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31 ];

export const FormatBirthday = (month: number, day: number): string => ((month >= 1) && (month <= 12) && (day >= 1)) ? `${ day } ${ MONTHS[month - 1] }` : '';

export const PhoneAccountView: FC<PhoneAccountViewProps> = props =>
{
    const { onBack = null } = props;
    const [ month, setMonth ] = useState(0);
    const [ day, setDay ] = useState(0);
    const [ loaded, setLoaded ] = useState(false);
    const [ picking, setPicking ] = useState(false);
    const [ draftMonth, setDraftMonth ] = useState(0);
    const [ draftDay, setDraftDay ] = useState(0);

    const ownId = GetSessionDataManager().userId;
    const ownFigure = GetSessionDataManager().figure;
    const ownName = (GetSessionDataManager().userName || 'You');

    useMessageEvent<RpBirthdayEvent>(RpBirthdayEvent, event =>
    {
        const parser = event.getParser();

        setMonth(parser.month);
        setDay(parser.day);
        setLoaded(true);
        setPicking(false);
    });

    useEffect(() =>
    {
        SendMessageComposer(new RpGetBirthdayComposer());
    }, []);

    const openPicker = () =>
    {
        setDraftMonth(month || 1);
        setDraftDay(day || 1);
        setPicking(true);
    }

    const pickMonth = (value: number) =>
    {
        setDraftMonth(value);
        // a day the new month doesn't have snaps back to its last day
        setDraftDay(prevValue => Math.min(prevValue, DAYS_IN_MONTH[value - 1]));
    }

    const save = () => SendMessageComposer(new RpSaveBirthdayComposer(draftMonth, draftDay));
    const remove = () => SendMessageComposer(new RpSaveBirthdayComposer(0, 0));

    const isSet = (month > 0);
    const value = (picking ? FormatBirthday(draftMonth, draftDay) : (isSet ? FormatBirthday(month, day) : (loaded ? 'Not set' : '')));

    return (
        <div className="phone-screen phone-app-screen phone-settings phone-account">
            <div className="phone-app-scroll">
                <div className="phone-app-header">
                    <div className="phone-app-header-lead">
                        <div className="phone-tap phone-thread-back" onClick={ event => (onBack && onBack()) }>
                            <PhoneIcon icon="chevron-left" size={ 24 } />
                        </div>
                        <div>
                            <div className="phone-app-kicker">PIXELRP SETTINGS</div>
                            <div className="phone-app-title">Account</div>
                        </div>
                    </div>
                </div>
                <div className="phone-settings-list">
                    <div className="phone-settings-card">
                        <div className="phone-settings-account is-static">
                            <PhoneAvatar portrait id={ ownId } figure={ ownFigure } size={ 54 } />
                            <div className="phone-settings-account-body">
                                <div className="phone-settings-account-name">{ ownName }</div>
                                <div className="phone-settings-account-sub">Account</div>
                            </div>
                        </div>
                    </div>
                    <div className="phone-appearance-sublabel">Birthday</div>
                    <div className="phone-settings-card">
                        <div className={ `phone-settings-item phone-tap${ picking ? ' is-open' : '' }` } onClick={ event => (!picking && openPicker()) }>
                            <div className="phone-settings-icon" style={ { background: '#e93a7d' } }>
                                <PhoneIcon icon="cake" size={ 17 } />
                            </div>
                            <div className="phone-settings-item-label">Birthday</div>
                            <span className={ `phone-settings-item-value${ picking ? ' is-draft' : '' }` }>{ value }</span>
                            { !picking &&
                                <PhoneIcon icon="chevron-right" size={ 18 } className="phone-settings-chev" /> }
                        </div>
                        { picking &&
                            <div className="phone-birthday-picker">
                                <div className="phone-birthday-label">Month</div>
                                <div className="phone-birthday-months">
                                    { MONTHS.map((name, index) => (
                                        <div key={ name } className={ `phone-tap phone-birthday-month${ (draftMonth === (index + 1)) ? ' is-picked' : '' }` } onClick={ event => pickMonth(index + 1) }>{ name.substring(0, 3) }</div>
                                    )) }
                                </div>
                                <div className="phone-birthday-label">Day</div>
                                <div className="phone-birthday-days">
                                    { Array.from({ length: 31 }, (_, index) => (index + 1)).map(value =>
                                    {
                                        const inMonth = (value <= DAYS_IN_MONTH[draftMonth - 1]);

                                        return (
                                            <div key={ value } className={ `phone-birthday-day${ (draftDay === value) ? ' is-picked' : '' }${ inMonth ? ' phone-tap' : ' is-out' }` } onClick={ event => (inMonth && setDraftDay(value)) }>{ value }</div>
                                        );
                                    }) }
                                </div>
                                <div className="phone-birthday-actions">
                                    <div className="phone-tap phone-birthday-btn" onClick={ event => setPicking(false) }>Cancel</div>
                                    <div className="phone-tap phone-birthday-btn is-primary" onClick={ save }>Save</div>
                                </div>
                            </div> }
                        { isSet && !picking &&
                            <div className="phone-settings-item phone-tap phone-settings-item--danger" onClick={ remove }>
                                <div className="phone-settings-item-label">Remove birthday</div>
                            </div> }
                    </div>
                </div>
                <div className="phone-settings-footnote">Just the day and month - no year is stored.</div>
                <div className="phone-scroll-spacer" />
            </div>
        </div>
    );
}
