import { ILinkEventTracker, RpGetUserCorpComposer, RpUserCorpEvent } from '@nitrots/nitro-renderer';
import { FC, useEffect, useState } from 'react';
import { LuBuilding2, LuUsers } from 'react-icons/lu';
import { AddEventLinkTracker, RemoveLinkEventTracker, SendMessageComposer } from '../../api';
import { DEFAULT_CORP_BADGE, GetRpEmployment, RpRankTitle, SetRpEmployment } from '../../api/rp-employment/RpEmploymentRegistry';
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

        SetRpEmployment(parser.userId, { corpId: parser.corpId, badge: parser.badge, corpName: parser.corpName, rankName: parser.rankName, tier: parser.tier });
        setVersion(value => (value + 1));
    });

    if(!isVisible) return null;

    // The opener's own data wins; otherwise look the viewed player up.
    const employment = (RpProfileState.employment ?? GetRpEmployment(RpProfileState.userId));

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
                                </div>
                                { /* placeholder until shift tracking ships */ }
                                <div className="rp-profile-org-status">Off-duty</div>
                            </div>
                            <div className="rp-profile-org-pills">
                                <div className="rp-profile-pill">0 weekly shifts</div>
                                <div className="rp-profile-pill">0 total shifts</div>
                            </div>
                        </div>
                        <div className="rp-profile-card rp-profile-org">
                            <div className="rp-profile-org-row">
                                { /* same slot as the corporation card so both icons line up */ }
                                <div className="rp-profile-org-icon-slot">
                                    <LuUsers className="rp-profile-org-icon" />
                                </div>
                                <div className="rp-profile-org-info">
                                    <div className="rp-profile-org-name">No gang</div>
                                    <div className="rp-profile-org-role">&nbsp;</div>
                                </div>
                                <div className="rp-profile-view-gang">View</div>
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
