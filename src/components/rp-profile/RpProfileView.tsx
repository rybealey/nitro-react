import { ILinkEventTracker } from '@nitrots/nitro-renderer';
import { FC, useEffect, useState } from 'react';
import { FaPencilAlt } from 'react-icons/fa';
import { LuBuilding2, LuUsers } from 'react-icons/lu';
import { AddEventLinkTracker, RemoveLinkEventTracker } from '../../api';
import { LayoutAvatarImageView, NitroCardContentView, NitroCardHeaderView, NitroCardView } from '../../common';
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

    if(!isVisible) return null;

    return (
        <NitroCardView uniqueKey="rp-profile" className="rp-profile-window" theme="primary-slim">
            <NitroCardHeaderView headerText="Profile" onCloseClick={ () => setIsVisible(false) } />
            { /* placeholder edit control, styled into the header row */ }
            <div className="rp-profile-edit" title="Edit"><FaPencilAlt /></div>
            <NitroCardContentView className="text-black">
                <div className="rp-profile-layout">
                    <div className="rp-profile-left">
                        <div className="rp-profile-card rp-profile-identity">
                            { /* classic Habbo online badge, pinned top-right of this card */ }
                            <i className="icon icon-pf-online rp-profile-online-badge" title="Online" />
                            <div className="rp-profile-avatar">
                                <LayoutAvatarImageView figure={ RpProfileState.figure } direction={ 2 } />
                            </div>
                            <div className="rp-profile-identity-info">
                                <div className="rp-profile-name">{ RpProfileState.name || 'Unknown' }</div>
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
                                <LuBuilding2 className="rp-profile-org-icon" />
                                <div className="rp-profile-org-info">
                                    <div className="rp-profile-org-name">Unemployed</div>
                                    <div className="rp-profile-org-role">&nbsp;</div>
                                </div>
                                <div className="rp-profile-org-status">Off-duty</div>
                            </div>
                            <div className="rp-profile-org-pills">
                                <div className="rp-profile-pill">0 weekly shifts</div>
                                <div className="rp-profile-pill">0 total shifts</div>
                            </div>
                        </div>
                        <div className="rp-profile-card rp-profile-org">
                            <div className="rp-profile-org-row">
                                <LuUsers className="rp-profile-org-icon" />
                                <div className="rp-profile-org-info">
                                    <div className="rp-profile-org-name">No gang</div>
                                    <div className="rp-profile-org-role">&nbsp;</div>
                                </div>
                                <div className="rp-profile-view-gang">View gang</div>
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
