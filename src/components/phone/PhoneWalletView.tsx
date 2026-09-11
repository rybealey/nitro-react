import { RpGetUserCorpComposer, RpUserCorpEvent } from '@nitrots/nitro-renderer';
import { FC, useEffect, useRef, useState } from 'react';
import { GetRoomSession, GetSessionDataManager, OwnMotto, SendMessageComposer } from '../../api';
import { DEFAULT_CORP_BADGE, GetRpEmployment, RpRankTitle, SetRpEmployment } from '../../api/rp-employment/RpEmploymentRegistry';
import { RpGetUserGangComposer, RpUserGangEvent } from '../../api/rp-gangs/RpGangMessages';
import { GetRpGang, SetRpGang } from '../../api/rp-gangs/RpGangRegistry';
import { RpBirthdayEvent, RpGetBirthdayComposer } from '../../api/rp-phone/RpBirthdayMessages';
import { GetRpBankAccounts, RpBankAccounts, SendRpGetBankAccounts, SubscribeRpBankAccounts } from '../../api/rp-phone/RpBankMessages';
import { GetRpCharacters, GetRpCurrentCharacterId, GetRpMaxCharacters, RpCharacter, SendRpSwitchCharacter, SubscribeRpCharacters } from '../../api/rp-phone/RpCharacterMessages';
import { FormatBirthday, GetRpBirthday, SetRpBirthday } from '../../api/rp-phone/RpBirthdayRegistry';
import { ResolveRpStaff } from '../../api/user/RpStaffFlag';
import { LayoutBadgeImageView, LayoutCurrencyIcon } from '../../common';
import { useMessageEvent } from '../../hooks';
import { GangCrest } from '../rp-gangs/RpGangsView';
import { PhoneFace } from './PhoneAvatar';
import { PhoneIcon } from './PhoneIcon';

// Wallet app: the Resident ID cards for every character on this account - a
// card-sized read of each profile. Name, staff mark and motto, birthday from
// the phone's birthday store, job and gang from their registries; the optional
// rows (birthday, job, gang) are simply absent when there is nothing to show.
// Combat and Farming read the same placeholder the profile shows.
//
// A wallet is a STACK, the way a wallet is: every card shows its whole top -
// band, photo, name, motto - and the card below covers its lower edge, which
// is what makes a stack read as a stack. Tapping one opens the DETAIL beneath
// that top (levels, employer, gang, the switch) and slides the cards under it
// down. The card you are playing opens by default.
//
// Nothing is ever cut through: what collapses is a whole section with its own
// height, not the card with a lid dropped on it.
//
// The + makes a character (up to three), and a card that is not the one you
// are playing offers to become it - which is a reconnect, not a swap, so the
// client reloads into the new character.
//
// The + is a MENU rather than one action, because there are now two things a
// wallet can gain: a character, and a bank account. Both rows stay visible
// when they are unavailable and go dim instead - same call as the + itself
// going quiet at three characters rather than disappearing, since a control
// that vanishes reads as a bug rather than as an answer.
//
// The debit card sits below the ID stack and there is only ever ONE, for the
// character being played: accounts are per character and the server tells a
// session about its own and nothing else, so a card per sibling would be a
// card the client cannot fill in.

interface PhoneWalletViewProps
{
    onBack: () => void;
    openCreate?: () => void;
}

// the same placeholder values the profile window shows until stats land
const COMBAT_LEVEL: number = 1;
const FARMING_LEVEL: number = 1;

// Matches the emulator's accrual tick. The countdown only moves when online
// time is actually stamped, so asking more often than that just repeats the
// same answer - and asking less often makes the number wrong.
const ACCOUNTS_POLL_MS = 60000;

const FormatCredits = (value: number): string => Math.max(0, value || 0).toLocaleString('en-US');

// d0b702e7 deliberately took the printed number OFF the Resident ID - an ID
// does not need one and it was noise. A debit card is the opposite: a card
// with no number does not read as a debit card at all.
//
// Derived from the character id rather than stored, so it is stable for a
// character and costs no column. It is decoration - nothing is ever keyed on
// it - which is why it can be invented here.
const CardNumber = (userId: number): string =>
{
    const seed = ((userId * 2654435761) >>> 0).toString().padStart(10, '0').slice(-10);
    const digits = (seed + String(userId).padStart(2, '0')).slice(0, 12);

    return `4923 ${ digits.slice(0, 4) } ${ digits.slice(4, 8) } ${ digits.slice(8, 12) }`;
}

const NextInterest = (seconds: number): string =>
{
    if(seconds <= 0) return 'due now';

    const minutes = Math.ceil(seconds / 60);

    return (minutes >= 60) ? `in ${ Math.floor(minutes / 60) }h ${ minutes % 60 }m` : `in ${ minutes }m`;
}

export const PhoneWalletView: FC<PhoneWalletViewProps> = props =>
{
    const { onBack = null, openCreate = null } = props;
    const [ , setVersion ] = useState(0);
    const [ characters, setCharacters ] = useState<RpCharacter[]>(() => GetRpCharacters());
    const [ openId, setOpenId ] = useState(() => GetRpCurrentCharacterId());
    const [ bank, setBank ] = useState<RpBankAccounts>(() => GetRpBankAccounts());

    const ownId = GetSessionDataManager().userId;
    const ownName = (GetSessionDataManager().userName || 'You');
    const ownFigure = GetSessionDataManager().figure;
    const motto = (OwnMotto.value || 'Welcome to my profile!');
    const staff = ResolveRpStaff(GetRoomSession()?.ownRoomIndex ?? -1);

    // The roster lands at login; this follows it, and re-opens on the
    // character being played whenever the set changes (a create adds one).
    useEffect(() => SubscribeRpCharacters(() =>
    {
        setCharacters(GetRpCharacters());
        setOpenId(GetRpCurrentCharacterId());
    }), []);

    // The accounts land at login, after every movement, and on the minute poll
    // below. Nothing here changes them any more - the card only reads.
    useEffect(() => SubscribeRpBankAccounts(() => setBank(GetRpBankAccounts())), []);

    // Once a minute while this screen is open, and never otherwise: the server
    // stamps online time on its own minute tick, so anything faster asks the
    // same question twice and anything slower leaves the countdown lying.
    //
    // A poll rather than a push because the Wallet is shut almost all the time,
    // and pushing every balance to every player every minute would be paying
    // for a screen nobody is looking at.
    //
    // Both effects use a BLOCK body, not a concise one. IConnection.send is
    // declared void but SocketConnection.send actually returns a boolean, so
    // `() => Send...()` hands React a `true` where it expects a cleanup
    // function - and React calls it on unmount, which took the whole client to
    // a black screen the moment the phone was closed from this screen.
    useEffect(() =>
    {
        SendRpGetBankAccounts();
    }, []);

    useEffect(() =>
    {
        const timer = setInterval(() => SendRpGetBankAccounts(), ACCOUNTS_POLL_MS);

        return () => clearInterval(timer);
    }, []);

    // Each card's job, gang and birthday come from the composers that already
    // exist, asked per character. Privacy does not get in the way of your own
    // account - PrivacyUtility treats siblings as yourself.
    useEffect(() =>
    {
        const ids = characters.length ? characters.map(character => character.userId) : [ ownId ];

        ids.forEach(id =>
        {
            if(!id) return;

            SendMessageComposer(new RpGetUserCorpComposer(id));
            SendMessageComposer(new RpGetUserGangComposer(id));
            SendMessageComposer(new RpGetBirthdayComposer(id));
        });
    }, [ characters, ownId ]);

    useMessageEvent<RpUserCorpEvent>(RpUserCorpEvent, event =>
    {
        const parser = event.getParser();

        SetRpEmployment(parser.userId, { corpId: parser.corpId, badge: parser.badge, corpName: parser.corpName, rankName: parser.rankName, tier: parser.tier, shiftSeconds: parser.shiftSeconds, shiftSecondsWeek: parser.shiftSecondsWeek, onDuty: parser.onDuty, receivedAt: Date.now() });
        setVersion(value => (value + 1));
    });

    useMessageEvent<RpUserGangEvent>(RpUserGangEvent, event =>
    {
        const parser = event.getParser();

        SetRpGang(parser.userId, { gangId: parser.gangId, name: parser.name, colourA: parser.colourA, colourB: parser.colourB, isOwner: parser.isOwner });
        setVersion(value => (value + 1));
    });

    useMessageEvent<RpBirthdayEvent>(RpBirthdayEvent, event =>
    {
        const parser = event.getParser();

        SetRpBirthday(parser.userId, parser.month, parser.day);
        setVersion(value => (value + 1));
    });

    // One card per character. Before the roster lands (or on a hotel where
    // nobody has made a second) this is just the player themselves, which is
    // what the Wallet always showed.
    const cards: RpCharacter[] = characters.length
        ? characters
        : [ { userId: ownId, username: ownName, figure: ownFigure, motto, gender: 'M' } ];
    const full = (cards.length >= GetRpMaxCharacters());

    const newCharacter = () =>
    {
        if(full) return;

        if(openCreate) openCreate();
    };

    const card = (person: RpCharacter, index: number) =>
    {
        const isOpen = (person.userId === openId);
        const isCurrent = (person.userId === GetRpCurrentCharacterId() || (!characters.length && person.userId === ownId));
        const birthday = GetRpBirthday(person.userId);
        const employment = GetRpEmployment(person.userId);
        const gang = GetRpGang(person.userId);

        return (
            <div key={ person.userId }
                className={ `phone-wallet-card${ isOpen ? ' is-open' : '' }` }
                onClick={ event => setOpenId(isOpen ? 0 : person.userId) }>
                <div className="phone-wallet-field" />
                <div className="phone-wallet-holo" />
                <div className="phone-wallet-band">
                    <div className="phone-wallet-band-title"><PhoneIcon icon="id-card" size={ 14 } /><span>San Francisco · Resident ID</span></div>
                    { /* The band's right slot is the action, on any card that is not
                         the one being played. Nothing stands in for it on that card:
                         an empty slot reads as "this is you". */ }
                    { !isCurrent &&
                        <div className="phone-wallet-switch phone-tap"
                            title={ `Play as ${ person.username }` }
                            onClick={ event => 
                            {
                                event.stopPropagation(); SendRpSwitchCharacter(person.userId); 
                            } }>
                            <PhoneIcon icon="arrow-right-arrow-left" size={ 12 } />
                            <span>Play as { person.username }</span>
                        </div> }
                </div>
                <div className="phone-wallet-body">
                    <div className="phone-wallet-identity">
                        <div className="phone-wallet-photo">
                            <PhoneFace id={ person.userId } figure={ person.figure } name={ person.username } size={ 56 } />
                        </div>
                        <div className="phone-wallet-who">
                            <div className="phone-wallet-name">
                                <span>{ person.username }</span>
                                { isCurrent && staff &&
                                    <i className="fa-solid fa-badge-check phone-wallet-verified" title="PixelRP Staff" aria-hidden="true" /> }
                            </div>
                            <div className="phone-wallet-motto">{ person.motto || 'Welcome to my profile!' }</div>
                            { birthday &&
                                <div className="phone-wallet-birthday"><PhoneIcon icon="cake" size={ 12 } /><span>{ FormatBirthday(birthday.month, birthday.day) }</span></div> }
                        </div>
                        { isCurrent && <div className="phone-wallet-current">Playing</div> }
                    </div>
                    <div className="phone-wallet-detail">
                        <div className="phone-wallet-levels">
                            <div className="phone-wallet-level">
                                <PhoneIcon icon="sword" size={ 14 } />
                                <div><span className="phone-wallet-level-label">Combat</span><span className="phone-wallet-level-value">Level { COMBAT_LEVEL }</span></div>
                            </div>
                            <div className="phone-wallet-level">
                                <PhoneIcon icon="wheat-awn" size={ 14 } />
                                <div><span className="phone-wallet-level-label">Farming</span><span className="phone-wallet-level-value">Level { FARMING_LEVEL }</span></div>
                            </div>
                        </div>
                        { (employment || gang) &&
                        <div className="phone-wallet-rows">
                            { employment &&
                                <div className="phone-wallet-row">
                                    <div className="phone-wallet-row-icon is-badge"><LayoutBadgeImageView badgeCode={ employment.badge || DEFAULT_CORP_BADGE } /></div>
                                    { /* Employer over rank, on two lines. A corporation name and a
                                         rank title do not fit one 219px line, and the middot that used
                                         to join them ended up stranded at the end of the first. */ }
                                    <div className="phone-wallet-row-text">
                                        <b>{ employment.corpName }</b>
                                        <div className="phone-wallet-row-sub">{ RpRankTitle(employment.rankName, employment.tier) }</div>
                                    </div>
                                </div> }
                            { gang &&
                                <div className="phone-wallet-row">
                                    <div className="phone-wallet-row-icon"><GangCrest primary={ gang.colourA } secondary={ gang.colourB } size={ 22 } /></div>
                                    <div className="phone-wallet-row-text"><b>{ gang.name }</b> · { gang.isOwner ? 'Leader' : 'Member' }</div>
                                </div> }
                        </div> }
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className="phone-screen phone-app-screen phone-settings phone-wallet">
            <div className="phone-app-scroll">
                <div className="phone-app-header">
                    <div className="phone-app-header-lead">
                        <div className="phone-tap phone-thread-back" onClick={ event => (onBack && onBack()) }>
                            <PhoneIcon icon="chevron-left" size={ 24 } />
                        </div>
                        <div>
                            <div className="phone-app-kicker">WALLET</div>
                            <div className="phone-app-title">Wallet</div>
                        </div>
                    </div>
                    { /* Goes quiet at three rather than disappearing: a character
                         cannot be deleted to free a slot, so a vanished button
                         would read as a bug. Opening a bank account left this
                         menu when accounts moved to a branch, and a menu of one
                         is just a button. */ }
                    <div className={ `phone-notes-iconbtn phone-wallet-add${ full ? ' is-off' : ' phone-tap' }` }
                        title={ full ? 'You have all three characters' : 'New character' }
                        onClick={ event => newCharacter() }>
                        <PhoneIcon icon="plus" size={ 15 } />
                    </div>
                </div>
                <div className="phone-section-label">YOUR CARDS · { cards.length } OF { GetRpMaxCharacters() }</div>
                <div className="phone-wallet-stack">
                    { cards.map((person, index) => card(person, index)) }
                </div>
                { /* The Wallet holds the CARD; Mercury holds the account. So this
                     is plastic - number, holder, issuer, nothing that changes -
                     and the live balance sits underneath it the way a wallet
                     lists what a card is attached to. */ }
                { bank.hasAccount &&
                    <>
                        <div className="phone-section-label">BANKING</div>
                        <div className="phone-wallet-card phone-wallet-debit">
                            <div className="phone-wallet-field" />
                            <div className="phone-wallet-debit-rule" />
                            <div className="phone-wallet-debit-sheen" />
                            <div className="phone-wallet-debit-face">
                                <div className="phone-wallet-debit-top">
                                    <div className="phone-wallet-debit-brand">
                                        <div className="phone-wallet-debit-mark"><PhoneIcon icon="right-left" size={ 12 } /></div>
                                        <div className="phone-wallet-debit-wordmark">Mercury</div>
                                    </div>
                                    <div className="phone-wallet-debit-kind">DEBIT<br />CHECKING</div>
                                </div>
                                <div className="phone-wallet-debit-chip">
                                    <i className="h1" /><i className="h2" /><i className="v1" /><i className="v2" />
                                </div>
                                <div className="phone-wallet-debit-number">{ CardNumber(GetRpCurrentCharacterId() || ownId) }</div>
                                <div className="phone-wallet-debit-bottom">
                                    <div>
                                        <div className="phone-wallet-debit-label">CARDHOLDER</div>
                                        <div className="phone-wallet-debit-value">{ ownName }</div>
                                    </div>
                                    <div className="phone-wallet-debit-issuer">SAN FRANCISCO<br />PIXELRP</div>
                                </div>
                            </div>
                        </div>
                        <div className="phone-wallet-debit-caption">
                            <span className="phone-wallet-debit-caption-label">CHECKING</span>
                            <span className="phone-wallet-debit-caption-value">
                                <LayoutCurrencyIcon type={ -1 } />{ FormatCredits(bank.current) }
                            </span>
                        </div>
                        <div className="phone-wallet-debit-foot">
                            <PhoneIcon icon="right-left" size={ 13 } />
                            <span>Savings and transfers live in Mercury</span>
                        </div>
                    </> }
                <div className="phone-scroll-spacer" />
            </div>
        </div>
    );
}
