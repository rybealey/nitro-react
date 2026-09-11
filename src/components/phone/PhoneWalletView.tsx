import { RpGetUserCorpComposer, RpUserCorpEvent } from '@nitrots/nitro-renderer';
import { FC, useEffect, useState } from 'react';
import { GetRoomSession, GetSessionDataManager, OwnMotto, SendMessageComposer } from '../../api';
import { DEFAULT_CORP_BADGE, GetRpEmployment, RpRankTitle, SetRpEmployment } from '../../api/rp-employment/RpEmploymentRegistry';
import { RpGetUserGangComposer, RpUserGangEvent } from '../../api/rp-gangs/RpGangMessages';
import { GetRpGang, SetRpGang } from '../../api/rp-gangs/RpGangRegistry';
import { RpBirthdayEvent, RpGetBirthdayComposer } from '../../api/rp-phone/RpBirthdayMessages';
import { GetRpCharacters, GetRpCurrentCharacterId, GetRpMaxCharacters, RpCharacter, SendRpSwitchCharacter, SubscribeRpCharacters } from '../../api/rp-phone/RpCharacterMessages';
import { FormatBirthday, GetRpBirthday, SetRpBirthday } from '../../api/rp-phone/RpBirthdayRegistry';
import { ResolveRpStaff } from '../../api/user/RpStaffFlag';
import { LayoutBadgeImageView } from '../../common';
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
// A wallet is a STACK: the cards overlap and only the one you tap is open, so
// three of them do not turn the screen into a list you scroll past. The card
// you are currently playing opens by default.
//
// The + makes a character (up to three), and a card that is not the one you
// are playing offers to become it - which is a reconnect, not a swap, so the
// client reloads into the new character.

interface PhoneWalletViewProps
{
    onBack: () => void;
    openCreate?: () => void;
}

// the same placeholder values the profile window shows until stats land
const COMBAT_LEVEL: number = 1;
const FARMING_LEVEL: number = 1;

export const PhoneWalletView: FC<PhoneWalletViewProps> = props =>
{
    const { onBack = null, openCreate = null } = props;
    const [ , setVersion ] = useState(0);
    const [ characters, setCharacters ] = useState<RpCharacter[]>(() => GetRpCharacters());
    const [ openId, setOpenId ] = useState(() => GetRpCurrentCharacterId());

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

    const card = (person: RpCharacter, index: number) =>
    {
        const isOpen = (person.userId === openId);
        const isCurrent = (person.userId === GetRpCurrentCharacterId() || (!characters.length && person.userId === ownId));
        const birthday = GetRpBirthday(person.userId);
        const employment = GetRpEmployment(person.userId);
        const gang = GetRpGang(person.userId);

        return (
            <div key={ person.userId }
                className={ `phone-wallet-card${ isOpen ? ' is-open' : ' is-stacked' }${ (index > 0) ? ' is-behind' : '' }` }
                onClick={ event => setOpenId(isOpen ? 0 : person.userId) }>
                <div className="phone-wallet-field" />
                <div className="phone-wallet-holo" />
                <div className="phone-wallet-band">
                    <div className="phone-wallet-band-title"><PhoneIcon icon="id-card" size={ 14 } /><span>San Francisco · Resident ID</span></div>
                    <span className="phone-wallet-band-number">No. { String(person.userId).padStart(6, '0') }</span>
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
                    { !isCurrent &&
                        <div className="phone-wallet-switchrow">
                            <div className="phone-wallet-switch phone-tap"
                                onClick={ event => { event.stopPropagation(); SendRpSwitchCharacter(person.userId); } }>
                                <PhoneIcon icon="arrow-right-arrow-left" size={ 13 } />
                                <span>Play as { person.username }</span>
                            </div>
                        </div> }
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
                         would read as a bug. */ }
                    <div className={ `phone-notes-iconbtn phone-wallet-add${ full ? ' is-off' : ' phone-tap' }` }
                        title={ full ? 'You have all three characters' : 'New character' }
                        onClick={ event => (!full && openCreate && openCreate()) }>
                        <PhoneIcon icon="plus" size={ 15 } />
                    </div>
                </div>
                <div className="phone-section-label">YOUR CARDS · { cards.length } OF { GetRpMaxCharacters() }</div>
                <div className="phone-wallet-stack">
                    { cards.map((person, index) => card(person, index)) }
                </div>
                <div className="phone-scroll-spacer" />
            </div>
        </div>
    );
}
