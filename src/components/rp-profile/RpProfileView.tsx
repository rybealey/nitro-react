import { ILinkEventTracker, RelationshipStatusEnum, RelationshipStatusInfoEvent, RpGetUserCorpComposer, RpUserCorpEvent, UserRelationshipsComposer } from '@nitrots/nitro-renderer';
import { FC, useEffect, useState } from 'react';
import { LuBuilding2, LuUsers } from 'react-icons/lu';
import { AddEventLinkTracker, CreateLinkEvent, GetSessionDataManager, RemoveLinkEventTracker, SendMessageComposer } from '../../api';
import { DEFAULT_CORP_BADGE, FormatShifts, GetRpEmployment, RpRankTitle, SetRpEmployment } from '../../api/rp-employment/RpEmploymentRegistry';
import { RpGetUserGangComposer, RpUserGangEvent } from '../../api/rp-gangs/RpGangMessages';
import { GetRpGang, SetRpGang } from '../../api/rp-gangs/RpGangRegistry';
import { GetGymLevels, GymXpText, RequestGymLevels, SubscribeGym } from '../../api/rp-gym/RpGymMessages';
import { GetRpRegion, RequestRpRegion, RpRegionLabel, SubscribeRpRegion } from '../../api/rp-region/RpRegionMessages';
import { OpenSitchProfile } from '../../api/rp-phone/SitchOpenProfile';
import { GangCrest } from '../rp-gangs/RpGangsView';
import { RpBirthdayEvent, RpGetBirthdayComposer } from '../../api/rp-phone/RpBirthdayMessages';
import { FormatBirthday, GetRpBirthday, SetRpBirthday } from '../../api/rp-phone/RpBirthdayRegistry';
import { HoverBubble, LayoutAvatarImageView, LayoutBadgeImageView, NitroCardContentView, NitroCardHeaderView, NitroCardView } from '../../common';
import { useMessageEvent } from '../../hooks';
import { RpProfileState } from './RpProfileState';

// PixelRP player profile window (Player Profile Header canvas, board E). Opened
// by clicking a portrait in the player HUD: your own portrait shows your
// profile, the target's portrait shows theirs (RpProfileState carries who;
// CreateLinkEvent('rp-profile/show')).
//
// A header runs edge to edge under the title bar - one colour for now, the
// place custom headers will go - with the avatar overlapping its bottom-left
// corner and the name card beside it. Two tabs below: Profile (levels, gang,
// jobs, stats) and Skills.
const STAT_ROWS: { label: string, value: string }[] = [
    { label: 'Kills', value: '0' },
    { label: 'Deaths', value: '0' },
    { label: 'Arrests', value: '0' },
    { label: 'Damage Dealt', value: '0' },
    { label: 'Damage Taken', value: '0' },
    { label: 'Stun Accuracy', value: '0%' },
    { label: 'All Time Shifts', value: '0' },
    { label: 'Sales', value: '0' },
    { label: 'Tasks Completed', value: '0' },
];

// Strength and Stamina are the gym's and live on the Profile tab. These four
// are still to be built, so everyone is at 0 for now.
const SKILL_ROWS: { key: string, label: string, max: number }[] = [
    { key: 'fishing', label: 'Fishing', max: 50 },
    { key: 'crafting', label: 'Crafting', max: 25 },
    { key: 'intellect', label: 'Intellect', max: 10 },
    { key: 'farming', label: 'Farming', max: 50 },
];

type ProfileTab = 'profile' | 'skills';

export const RpProfileView: FC<{}> = props =>
{
    const [ isVisible, setIsVisible ] = useState(false);
    const [ , setVersion ] = useState(0);
    const [ tab, setTab ] = useState<ProfileTab>('profile');
    // the viewed player's partner (:propose), from the same relationship row
    // the infostand shows; null when they have none
    const [ partner, setPartner ] = useState<string>(null);
    // drives the on-duty employee's live shift counters; only worth ticking
    // while the profile is actually open
    const [ tickNow, setTickNow ] = useState(Date.now());

    useEffect(() =>
    {
        if(!isVisible) return;

        // refresh immediately on open - without this, tickNow (set once at
        // mount) can sit well behind receivedAt for up to 60s, driving
        // profileLiveExtra negative on first open
        setTickNow(Date.now());

        const interval = setInterval(() => setTickNow(Date.now()), 60000);

        return () => clearInterval(interval);
    }, [ isVisible ]);

    useEffect(() =>
    {
        const linkTracker: ILinkEventTracker = {
            linkReceived: (url: string) =>
            {
                const parts = url.split('/');

                if(parts.length < 2) return;

                switch(parts[1])
                {
                    case 'show':
                        setVersion(value => (value + 1));
                        setTab('profile');
                        setPartner(null);
                        setIsVisible(true);

                        // Ask for live employment unless the opener already
                        // supplied it. Room entry seeds the registry for
                        // everyone present, but a profile can be opened for
                        // someone who is not in the room.
                        if(!RpProfileState.employment && RpProfileState.userId)
                        {
                            SendMessageComposer(new RpGetUserCorpComposer(RpProfileState.userId));
                        }

                        // Gang membership always comes fresh from the server
                        // (nothing seeds it on room entry yet).
                        if(RpProfileState.userId)
                        {
                            SendMessageComposer(new RpGetUserGangComposer(RpProfileState.userId));
                            SendMessageComposer(new RpGetBirthdayComposer(RpProfileState.userId));
                            // the partner, answered from partnerships
                            // (PartnershipUtility) as the single heart row
                            SendMessageComposer(new UserRelationshipsComposer(RpProfileState.userId));
                            // Asked at most once per player per session; a
                            // change broadcasts to the room after that.
                            RequestRpRegion(RpProfileState.userId);
                            // Gym levels move, so they are asked every time.
                            RequestGymLevels(RpProfileState.userId);
                        }
                        return;
                    case 'hide':
                        setIsVisible(false);
                        return;
                    case 'toggle':
                        setIsVisible(prevValue => !prevValue);
                        return;
                }
            },
            eventUrlPrefix: 'rp-profile/'
        };

        AddEventLinkTracker(linkTracker);

        return () => RemoveLinkEventTracker(linkTracker);
    }, []);

    // Keeps the registry fed and re-renders an open profile when the answer
    // to the request above arrives, or a live hire broadcast lands.
    useMessageEvent<RpUserCorpEvent>(RpUserCorpEvent, event =>
    {
        const parser = event.getParser();

        SetRpEmployment(parser.userId, { corpId: parser.corpId, badge: parser.badge, corpName: parser.corpName, rankName: parser.rankName, tier: parser.tier, shiftSeconds: parser.shiftSeconds, shiftSecondsWeek: parser.shiftSecondsWeek, onDuty: parser.onDuty, receivedAt: Date.now() });
        setVersion(value => (value + 1));
    });

    // Gang membership: request replies AND the hotel-wide broadcast every
    // gang mutation sends, so an open profile's gang card updates the moment
    // any player founds (or later joins/leaves) a gang.
    useMessageEvent<RpUserGangEvent>(RpUserGangEvent, event =>
    {
        const parser = event.getParser();

        SetRpGang(parser.userId, { gangId: parser.gangId, name: parser.name, colourA: parser.colourA, colourB: parser.colourB, isOwner: parser.isOwner, roleName: parser.roleName });
        setVersion(value => (value + 1));
    });

    useMessageEvent<RpBirthdayEvent>(RpBirthdayEvent, event =>
    {
        const parser = event.getParser();

        SetRpBirthday(parser.userId, parser.month, parser.day);
        setVersion(value => (value + 1));
    });

    // The answer to the request on open, and the room-wide push a :propose or
    // :divorce sends, so an open profile follows a wedding as it happens.
    useMessageEvent<RelationshipStatusInfoEvent>(RelationshipStatusInfoEvent, event =>
    {
        const parser = event.getParser();

        if(!RpProfileState.userId || (parser.userId !== RpProfileState.userId)) return;

        setPartner(parser.relationshipStatusMap.getValue(RelationshipStatusEnum.HEART)?.randomFriendName || null);
    });

    useEffect(() => SubscribeRpRegion(() => setVersion(value => (value + 1))), []);

    useEffect(() => SubscribeGym(() => setVersion(value => (value + 1))), []);

    if(!isVisible) return null;

    const name = (RpProfileState.name || 'Unknown');
    const birthday = GetRpBirthday(RpProfileState.userId);
    // Everyone's are visible; 0 until the answer lands.
    const gymLevels = GetGymLevels(RpProfileState.userId);
    const regionLabel = RpRegionLabel(GetRpRegion(RpProfileState.userId));

    // The opener's own data wins; otherwise look the viewed player up.
    const employment = (RpProfileState.employment ?? GetRpEmployment(RpProfileState.userId));
    const gang = GetRpGang(RpProfileState.userId);
    // seconds accrued on the current shift since the employment packet
    // arrived - 0 unless this player is on duty right now
    const profileLiveExtra = (employment?.onDuty ? Math.max(0, Math.floor((tickNow - employment.receivedAt) / 1000)) : 0);

    const tabButton = (key: ProfileTab, label: string, icon: JSX.Element) => (
        <button type="button" role="tab" aria-selected={ (tab === key) } className={ `rp-profile-tab${ (tab === key) ? ' is-active' : '' }` } title={ label } aria-label={ label } onClick={ () => setTab(key) }>
            { icon }
        </button>
    );

    return (
        <NitroCardView uniqueKey="rp-profile" className="rp-profile-window" theme="primary-slim">
            <NitroCardHeaderView headerText="Profile" onCloseClick={ () => setIsVisible(false) } />
            <div className="rp-profile-top">
                { /* the custom header's place; one colour until players can pick */ }
                <div className="rp-profile-banner">
                    <div className="rp-profile-chips">
                        { /* Nothing shows until the server has answered, so a
                             profile never flashes a wrong region. */ }
                        { regionLabel &&
                            <span className="rp-profile-chip">{ regionLabel }</span> }
                        { birthday &&
                            <span className="rp-profile-chip">
                                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#e93a7d" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 21h16M5 21v-6a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v6M12 13V9M12 9a2 2 0 0 0 2-2c0-1.2-2-3-2-3s-2 1.8-2 3a2 2 0 0 0 2 2zM5 17c2 1.2 3 1.2 5 0s3-1.2 5 0 3 1.2 4 0" /></svg>
                                { FormatBirthday(birthday.month, birthday.day) }
                            </span> }
                    </div>
                </div>
                <div className="rp-profile-plate-row">
                    <div className="rp-profile-card rp-profile-namecard">
                        <div className="rp-profile-name">
                            <span className="rp-profile-name-text">{ name }</span>
                            { /* same verified mark the infostand shows for staff */ }
                            { RpProfileState.staff &&
                                <i className="fa-solid fa-badge-check rp-profile-verified" title="PixelRP Staff" aria-hidden="true" /> }
                            { partner &&
                                <span className="rp-profile-married">
                                    <svg width="11" height="11" viewBox="0 0 24 24" fill="#e93a7d" aria-hidden="true"><path d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 2.9 4.5 6.6 4.5c2.2 0 3.7 1.2 5.4 3.2 1.7-2 3.2-3.2 5.4-3.2 3.7 0 5.7 3.9 4.2 7.3C19.5 16.4 12 21 12 21z" /></svg>
                                    Married to <b>{ partner }</b>
                                </span> }
                        </div>
                        { (RpProfileState.userId > 0) &&
                            <button type="button" className="rp-profile-sitch" title={ `Open ${ name }'s Sitch profile` } aria-label={ `Open ${ name }'s Sitch profile` } onClick={ () => OpenSitchProfile(RpProfileState.userId) }>@</button> }
                        { /* classic Habbo online badge */ }
                        <i className={ `icon ${ RpProfileState.online ? 'icon-pf-online' : 'icon-pf-offline' } rp-profile-online-badge` } title={ RpProfileState.online ? 'Online' : 'Offline' } />
                    </div>
                    <div className="rp-profile-tabs" role="tablist" aria-label="Profile tabs">
                        { tabButton('profile', 'Profile', <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><circle cx="8" cy="4.5" r="3" /><path d="M2 15c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5z" /></svg>) }
                        { tabButton('skills', 'Skills', <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><rect x="1.5" y="8" width="3" height="6.5" rx="0.6" /><rect x="6.5" y="4.5" width="3" height="10" rx="0.6" /><rect x="11.5" y="1.5" width="3" height="13" rx="0.6" /></svg>) }
                    </div>
                </div>
                { /* Head-to-waist crop: the sprite is drawn at its native size
                     and clipped - never scaled, which would resample the
                     pixel art. */ }
                <div className={ `rp-profile-avatar${ RpProfileState.online ? '' : ' is-offline' }` }>
                    <LayoutAvatarImageView figure={ RpProfileState.figure } direction={ 2 } />
                </div>
            </div>
            <NitroCardContentView className="text-black">
                { /* Both tabs share one grid cell, the closed one hidden, so the
                     window keeps the taller one's height and never jumps when
                     the tab changes. */ }
                <div className="rp-profile-pages">
                    <div className={ `rp-profile-page rp-profile-layout${ (tab === 'profile') ? ' is-open' : '' }` }>
                        <div className="rp-profile-left">
                            <div className="rp-profile-levels">
                                { /* The XP toward the next level shows on hover. */ }
                                <HoverBubble text={ GymXpText(gymLevels?.strengthXp ?? 0, gymLevels ? gymLevels.strengthXpNeeded : 100) }>
                                    <div className="rp-profile-card rp-profile-level">
                                        <span>Strength:</span>
                                        <span className="rp-profile-level-value">{ gymLevels?.strength ?? 0 }</span>
                                    </div>
                                </HoverBubble>
                                <HoverBubble text={ GymXpText(gymLevels?.staminaXp ?? 0, gymLevels ? gymLevels.staminaXpNeeded : 100) }>
                                    <div className="rp-profile-card rp-profile-level">
                                        <span>Stamina:</span>
                                        <span className="rp-profile-level-value">{ gymLevels?.stamina ?? 0 }</span>
                                    </div>
                                </HoverBubble>
                            </div>
                            <div className="rp-profile-card rp-profile-org">
                                <div className="rp-profile-org-row">
                                    { /* the same 40x40 slot as the job cards, so the
                                         rows are exactly the same height. A shield is
                                         taller than it is wide, so the crest is sized
                                         by its height: cropped, 32 wide comes out 40
                                         tall and fills the slot. */ }
                                    <div className="rp-profile-org-icon-slot">
                                        { gang
                                            ? <GangCrest primary={ gang.colourA } secondary={ gang.colourB } size={ 32 } crop />
                                            : <LuUsers className="rp-profile-org-icon" /> }
                                    </div>
                                    <div className="rp-profile-org-info">
                                        <div className="rp-profile-org-name">{ gang ? gang.name : 'No gang' }</div>
                                        { /* their role in the gang, as the owner named it */ }
                                        <div className="rp-profile-org-role">{ gang?.roleName || ' ' }</div>
                                    </div>
                                    { /* nothing to view for a player with no gang */ }
                                    { gang &&
                                        <div className="rp-profile-view-gang" onClick={ () => CreateLinkEvent((gang.gangId !== (GetRpGang(GetSessionDataManager().userId)?.gangId ?? 0)) ? `rp-gangs/view/${ gang.gangId }` : 'rp-gangs/show') }>View</div> }
                                </div>
                            </div>
                            <div className="rp-profile-card rp-profile-org">
                                <div className="rp-profile-org-row">
                                    { /* Badge art is pixel art at its own native size - the slot is
                                         sized around it rather than scaling it, and the fallback icon
                                         sits in the same slot so the row height never shifts. */ }
                                    <div className="rp-profile-org-icon-slot">
                                        { employment
                                            ? <LayoutBadgeImageView badgeCode={ employment.badge || DEFAULT_CORP_BADGE } />
                                            : <LuBuilding2 className="rp-profile-org-icon" /> }
                                    </div>
                                    <div className="rp-profile-org-info">
                                        <div className="rp-profile-org-name">{ employment ? employment.corpName : 'No full-time job' }</div>
                                        { employment &&
                                            <>
                                                { /* "Cadet II", or just "Captain" for the no-tier leadership ranks */ }
                                                <div className="rp-profile-org-role">{ RpRankTitle(employment.rankName, employment.tier) }</div>
                                                <div className="rp-profile-org-role">{ `Weekly: ${ FormatShifts(employment.shiftSecondsWeek + profileLiveExtra) } · Total: ${ FormatShifts(employment.shiftSeconds + profileLiveExtra) }` }</div>
                                            </> }
                                    </div>
                                    { employment &&
                                        <div className="rp-profile-org-side">
                                            <span className="rp-profile-job-tag">FULL-TIME</span>
                                            { /* only while working - off duty shows nothing */ }
                                            { employment.onDuty &&
                                                <span className="rp-profile-duty">On-duty</span> }
                                        </div> }
                                </div>
                            </div>
                            { /* Part-time jobs are still to be built: one job per
                                 player for now, so this card is always empty. */ }
                            <div className="rp-profile-card rp-profile-org">
                                <div className="rp-profile-org-row">
                                    <div className="rp-profile-org-icon-slot">
                                        <LuBuilding2 className="rp-profile-org-icon" />
                                    </div>
                                    <div className="rp-profile-org-info">
                                        <div className="rp-profile-org-name">No part-time job</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div className="rp-profile-stats">
                            { STAT_ROWS.map(row => (
                                <div key={ row.label } className="rp-profile-stat-row">
                                    <span>{ row.label }</span>
                                    <span className="rp-profile-stat-value">{ row.value }</span>
                                </div>
                            )) }
                        </div>
                    </div>
                    <div className={ `rp-profile-page${ (tab === 'skills') ? ' is-open' : '' }` }>
                        <div className="rp-profile-card rp-profile-skills">
                            <div className="rp-profile-skills-title">SKILLS</div>
                            { SKILL_ROWS.map(skill =>
                            {
                                const level = 0;

                                return (
                                    <div key={ skill.key } className="rp-profile-skill">
                                        <div className="rp-profile-skill-icon-slot">
                                            <i className={ `rp-profile-skill-icon is-${ skill.key }` } />
                                        </div>
                                        <span className="rp-profile-skill-name">{ skill.label }</span>
                                        <div className="rp-profile-skill-bar">
                                            <div className="rp-profile-skill-fill" style={ { width: `${ Math.round((level / skill.max) * 100) }%` } } />
                                            <span className="rp-profile-skill-text">{ `${ level }/${ skill.max }` }</span>
                                        </div>
                                        <span className="rp-profile-skill-level">{ level }</span>
                                    </div>
                                );
                            }) }
                        </div>
                    </div>
                </div>
            </NitroCardContentView>
        </NitroCardView>
    );
}
