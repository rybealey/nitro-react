import { ILinkEventTracker, RpGetUserCorpComposer, RpUserCorpEvent } from '@nitrots/nitro-renderer';
import { FC, useEffect, useState } from 'react';
import { LuBuilding2, LuUsers } from 'react-icons/lu';
import { AddEventLinkTracker, CreateLinkEvent, GetSessionDataManager, RemoveLinkEventTracker, SendMessageComposer } from '../../api';
import { DEFAULT_CORP_BADGE, FormatShifts, GetRpEmployment, RpRankTitle, SetRpEmployment } from '../../api/rp-employment/RpEmploymentRegistry';
import { RpGetUserGangComposer, RpUserGangEvent } from '../../api/rp-gangs/RpGangMessages';
import { GetRpGang, SetRpGang } from '../../api/rp-gangs/RpGangRegistry';
import { GangCrest } from '../rp-gangs/RpGangsView';
import { LayoutAvatarImageView, LayoutBadgeImageView, NitroCardContentView, NitroCardHeaderView, NitroCardView } from '../../common';
import { useMessageEvent } from '../../hooks';
import { RpProfileState } from './RpProfileState';

// PixelRP player profile window (interface shell — stats/jobs/gangs wiring
// comes later). Opened by clicking a portrait in the player HUD: your own
// portrait shows your profile, the target's portrait shows theirs
// (RpProfileState carries who; CreateLinkEvent('rp-profile/show')).
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

export const RpProfileView: FC<{}> = props =>
{
    const [ isVisible, setIsVisible ] = useState(false);
    const [ , setVersion ] = useState(0);
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

        SetRpGang(parser.userId, { gangId: parser.gangId, name: parser.name, colourA: parser.colourA, colourB: parser.colourB, isOwner: parser.isOwner });
        setVersion(value => (value + 1));
    });

    if(!isVisible) return null;

    // The opener's own data wins; otherwise look the viewed player up.
    const employment = (RpProfileState.employment ?? GetRpEmployment(RpProfileState.userId));
    const gang = GetRpGang(RpProfileState.userId);
    // seconds accrued on the current shift since the employment packet
    // arrived - 0 unless this player is on duty right now
    const profileLiveExtra = (employment?.onDuty ? Math.max(0, Math.floor((tickNow - employment.receivedAt) / 1000)) : 0);

    return (
        <NitroCardView uniqueKey="rp-profile" className="rp-profile-window" theme="primary-slim">
            <NitroCardHeaderView headerText="Profile" onCloseClick={ () => setIsVisible(false) } />
            <NitroCardContentView className="text-black">
                <div className="rp-profile-layout">
                    <div className="rp-profile-left">
                        <div className="rp-profile-card rp-profile-identity">
                            { /* classic Habbo online badge, pinned top-right of this card */ }
                            <i className={ `icon ${ RpProfileState.online ? 'icon-pf-online' : 'icon-pf-offline' } rp-profile-online-badge` } title={ RpProfileState.online ? 'Online' : 'Offline' } />
                            <div className="rp-profile-avatar">
                                <LayoutAvatarImageView figure={ RpProfileState.figure } direction={ 2 } />
                            </div>
                            <div className="rp-profile-identity-info">
                                <div className="rp-profile-name">
                                    <span className="rp-profile-name-text">{ RpProfileState.name || 'Unknown' }</span>
                                    { /* same verified mark the infostand shows for staff */ }
                                    { RpProfileState.staff &&
                                        <i className="fa-solid fa-badge-check rp-profile-verified" title="PixelRP Staff" aria-hidden="true" /> }
                                </div>
                                <div className="rp-profile-motto">{ RpProfileState.motto || 'Welcome to my profile!' }</div>
                            </div>
                        </div>
                        <div className="rp-profile-levels">
                            <div className="rp-profile-card rp-profile-level">
                                <span>Combat Level:</span>
                                <span className="rp-profile-level-value">1</span>
                            </div>
                            <div className="rp-profile-card rp-profile-level">
                                <span>Farming Level:</span>
                                <span className="rp-profile-level-value">1</span>
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
                                    <div className="rp-profile-org-name">{ employment ? employment.corpName : 'Unemployed' }</div>
                                    { /* "Cadet II", or just "Captain" for the no-tier leadership ranks */ }
                                    <div className="rp-profile-org-role">{ employment ? RpRankTitle(employment.rankName, employment.tier) : ' ' }</div>
                                    { employment &&
                                        <div className="rp-profile-org-shifts">
                                            { employment.onDuty && <span className="rp-profile-org-onduty" /> }
                                            { `Weekly: ${ FormatShifts(employment.shiftSecondsWeek + profileLiveExtra) } · Total: ${ FormatShifts(employment.shiftSeconds + profileLiveExtra) }` }
                                        </div> }
                                </div>
                                <div className="rp-profile-org-status">{ employment?.onDuty ? 'On-duty' : 'Off-duty' }</div>
                            </div>
                        </div>
                        <div className="rp-profile-card rp-profile-org">
                            <div className="rp-profile-org-row">
                                { /* same slot as the corporation card so both icons line up */ }
                                <div className="rp-profile-org-icon-slot">
                                    { gang
                                        ? <GangCrest primary={ gang.colourA } secondary={ gang.colourB } size={ 34 } />
                                        : <LuUsers className="rp-profile-org-icon" /> }
                                </div>
                                <div className="rp-profile-org-info">
                                    <div className="rp-profile-org-name">{ gang ? gang.name : 'No gang' }</div>
                                    <div className="rp-profile-org-role">{ gang ? (gang.isOwner ? 'Leader' : 'Member') : ' ' }</div>
                                </div>
                                <div className="rp-profile-view-gang" onClick={ () => CreateLinkEvent((gang && (gang.gangId !== (GetRpGang(GetSessionDataManager().userId)?.gangId ?? 0))) ? `rp-gangs/view/${ gang.gangId }` : 'rp-gangs/show') }>View</div>
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
            </NitroCardContentView>
        </NitroCardView>
    );
}
