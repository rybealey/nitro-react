import { FC, useEffect, useState } from 'react';
import { GetSessionDataManager } from '../../api';
import { GetRpRegion, RP_REGIONS, RpRegionCode, SetOwnRpRegion, SubscribeRpRegion } from '../../api/rp-region/RpRegionMessages';
import { PhoneIcon } from './PhoneIcon';

// Settings > General > Region. Which part of the world this player plays from,
// shown on their profile beside the motto so other people can tell roughly
// when they are about.
//
// A sub-screen rather than a segmented control in the General list: "North
// America" does not fit a segment at this width, and each option needs room
// for the line that makes it useful - when that region is actually busy, in
// hotel time, which is San Francisco for everyone (see HotelTime.ts).

interface PhoneRegionViewProps
{
    onBack: () => void;
}

export const PhoneRegionView: FC<PhoneRegionViewProps> = props =>
{
    const { onBack = null } = props;
    const ownId = GetSessionDataManager().userId;
    const [ picked, setPicked ] = useState<RpRegionCode>(() => GetRpRegion(ownId));

    // The login push may land after this mounts, and the server echoes every
    // change back - either way the tick follows what the server holds.
    useEffect(() => SubscribeRpRegion(() => setPicked(GetRpRegion(ownId))), [ ownId ]);

    // Picking the one already picked clears it, which is the only way back to
    // no region once you have chosen one.
    const choose = (code: RpRegionCode) =>
    {
        const next = ((picked === code) ? '' : code) as RpRegionCode;

        setPicked(next);
        SetOwnRpRegion(next);
    }

    return (
        <div className="phone-screen phone-app-screen phone-region">
            <div className="phone-app-scroll">
                <div className="phone-app-header">
                    <div className="phone-app-header-lead">
                        <div className="phone-tap phone-thread-back" onClick={ event => (onBack && onBack()) }>
                            <PhoneIcon icon="chevron-left" size={ 24 } />
                        </div>
                        <div>
                            <div className="phone-app-kicker">GENERAL</div>
                            <div className="phone-app-title">Region</div>
                        </div>
                    </div>
                </div>
                <div className="phone-settings-list">
                    <div>
                        <div className="phone-section-label">WHERE YOU PLAY</div>
                        <div className="phone-settings-card">
                            { RP_REGIONS.map(region => (
                                <div key={ region.code } className="phone-settings-item phone-tap phone-region-item"
                                    onClick={ event => choose(region.code) }>
                                    <div className="phone-region-text">
                                        <div className="phone-settings-item-label">{ region.label }</div>
                                        <div className="phone-region-window">{ region.window }</div>
                                    </div>
                                    { (picked === region.code) &&
                                        <PhoneIcon icon="check" size={ 17 } className="phone-region-check" /> }
                                </div>
                            )) }
                        </div>
                    </div>
                </div>
                <div className="phone-settings-footnote">Shown on your profile next to your motto. Pick the one closest to you — it is a rough guide for other players, not a timezone setting, and it does not change the hotel clock.</div>
                <div className="phone-scroll-spacer" />
            </div>
        </div>
    );
}
