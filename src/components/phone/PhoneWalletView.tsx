import { RpGetUserCorpComposer, RpUserCorpEvent } from '@nitrots/nitro-renderer';
import { FC, useEffect, useState } from 'react';
import { GetRoomSession, GetSessionDataManager, OwnMotto, SendMessageComposer } from '../../api';
import { DEFAULT_CORP_BADGE, GetRpEmployment, RpRankTitle, SetRpEmployment } from '../../api/rp-employment/RpEmploymentRegistry';
import { RpGetUserGangComposer, RpUserGangEvent } from '../../api/rp-gangs/RpGangMessages';
import { GetRpGang, SetRpGang } from '../../api/rp-gangs/RpGangRegistry';
import { RpBirthdayEvent, RpGetBirthdayComposer } from '../../api/rp-phone/RpBirthdayMessages';
import { FormatBirthday, GetRpBirthday, SetRpBirthday } from '../../api/rp-phone/RpBirthdayRegistry';
import { ResolveRpStaff } from '../../api/user/RpStaffFlag';
import { LayoutBadgeImageView } from '../../common';
import { useMessageEvent } from '../../hooks';
import { GangCrest } from '../rp-gangs/RpGangsView';
import { PhoneFace } from './PhoneAvatar';
import { PhoneIcon } from './PhoneIcon';

// Wallet app: one card to start, the player's Resident ID - a card-sized read
// of their own profile. Name, staff mark and motto from the session, birthday
// from the phone's birthday store, job and gang from their registries; the
// optional rows (birthday, job, gang) are simply absent when there is nothing
// to show. Combat and Farming read the same placeholder the profile shows.

interface PhoneWalletViewProps
{
    onBack: () => void;
}

// the same placeholder values the profile window shows until stats land
const COMBAT_LEVEL: number = 1;
const FARMING_LEVEL: number = 1;

export const PhoneWalletView: FC<PhoneWalletViewProps> = props =>
{
    const { onBack = null } = props;
    const [ , setVersion ] = useState(0);

    const ownId = GetSessionDataManager().userId;
    const ownName = (GetSessionDataManager().userName || 'You');
    const ownFigure = GetSessionDataManager().figure;
    const motto = (OwnMotto.value || 'Welcome to my profile!');
    const staff = ResolveRpStaff(GetRoomSession()?.ownRoomIndex ?? -1);

    useEffect(() =>
    {
        if(!ownId) return;

        SendMessageComposer(new RpGetUserCorpComposer(ownId));
        SendMessageComposer(new RpGetUserGangComposer(ownId));
        SendMessageComposer(new RpGetBirthdayComposer(ownId));
    }, [ ownId ]);

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

    const birthday = GetRpBirthday(ownId);
    const employment = GetRpEmployment(ownId);
    const gang = GetRpGang(ownId);
    const cardNumber = String(ownId).padStart(6, '0');

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
                </div>
                <div className="phone-appearance-sublabel">Your cards</div>
                <div className="phone-wallet-card">
                    <div className="phone-wallet-field" />
                    <div className="phone-wallet-holo" />
                    <div className="phone-wallet-band">
                        <div className="phone-wallet-band-title"><PhoneIcon icon="id-card" size={ 14 } /><span>San Francisco · Resident ID</span></div>
                        <span className="phone-wallet-band-number">No. { cardNumber }</span>
                    </div>
                    <div className="phone-wallet-body">
                        <div className="phone-wallet-identity">
                            <div className="phone-wallet-photo">
                                <PhoneFace id={ ownId } figure={ ownFigure } name={ ownName } size={ 56 } />
                            </div>
                            <div className="phone-wallet-who">
                                <div className="phone-wallet-name">
                                    <span>{ ownName }</span>
                                    { staff &&
                                        <i className="fa-solid fa-badge-check phone-wallet-verified" title="PixelRP Staff" aria-hidden="true" /> }
                                </div>
                                <div className="phone-wallet-motto">{ motto }</div>
                                { birthday &&
                                    <div className="phone-wallet-birthday"><PhoneIcon icon="cake" size={ 12 } /><span>{ FormatBirthday(birthday.month, birthday.day) }</span></div> }
                            </div>
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
                                        <div className="phone-wallet-row-text"><b>{ employment.corpName }</b> · { RpRankTitle(employment.rankName, employment.tier) }</div>
                                    </div> }
                                { gang &&
                                    <div className="phone-wallet-row">
                                        <div className="phone-wallet-row-icon"><GangCrest primary={ gang.colourA } secondary={ gang.colourB } size={ 22 } /></div>
                                        <div className="phone-wallet-row-text"><b>{ gang.name }</b> · { gang.isOwner ? 'Leader' : 'Member' }</div>
                                    </div> }
                            </div> }
                    </div>
                </div>
                <div className="phone-settings-footnote">Your Resident ID keeps itself current: levels, job and gang change on the card the moment they change in the city.</div>
                <div className="phone-scroll-spacer" />
            </div>
        </div>
    );
}
