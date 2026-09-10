import { ILinkEventTracker } from '@nitrots/nitro-renderer';
import { FC, useEffect, useState } from 'react';
import { FaRegStar, FaStar } from 'react-icons/fa';
import { AddEventLinkTracker, GetUserProfile, RemoveLinkEventTracker } from '../../api';
import { GetRpWantedList, RpWantedPlayer, SubscribeRpWanted } from '../../api/rp-wanted/RpWantedMessages';
import { LayoutAvatarImageView, NitroCardContentView, NitroCardHeaderView, NitroCardView } from '../../common';

// PixelRP Wanted List, opened from the side drawer's Wanted button
// (CreateLinkEvent('rp-wanted/toggle')). Players land here when they are
// charged with a crime and drop off when their sentence expires.
//
// Live: the emulator pushes the whole list at login and again whenever an
// officer files a charge (RpWantedMessages). A player's stars are the highest
// severity among their open charges, decided server-side.
//
// There is no countdown column. Charges do not lapse on a timer - they sit on
// the sheet until they are dropped - so the list reports when somebody became
// wanted rather than when they stop being.

const HOUR = 3600;
const DAY = 86400;

// "3h", "2d" - how long they have been on the list, at a glance.
const since = (unix: number): string =>
{
    const seconds = Math.max(0, Math.floor((Date.now() / 1000) - unix));

    if(seconds < HOUR) return `${ Math.max(1, Math.floor(seconds / 60)) }m`;
    if(seconds < DAY) return `${ Math.floor(seconds / HOUR) }h`;

    return `${ Math.floor(seconds / DAY) }d`;
}

const WantedStars: FC<{ level: number }> = ({ level }) => (
    <div className="rp-wanted-stars">
        { [ 0, 1, 2, 3, 4 ].map(index => (
            <span key={ index } className={ (index < level) ? 'on' : 'off' }>
                { (index < level) ? <FaStar /> : <FaRegStar /> }
            </span>
        )) }
    </div>
);

// The rap sheet, shown while hovering a row. Purely CSS-driven (:hover) so it
// costs nothing while the list sits idle; it is rendered inside the row so it
// tracks the row when the list scrolls. Sits below the row by default and
// flips above for the last row so it never runs off the bottom of the list.
const WantedTip: FC<{ player: RpWantedPlayer }> = ({ player }) => (
    <div className="rp-wanted-tip">
        <div className="rp-wanted-tip-head">
            <span>{ player.charges.length === 1 ? 'Charge' : 'Charges' }</span>
            <span>wanted { since(player.since) }</span>
        </div>
        <div className="rp-wanted-tip-list">
            { player.charges.map((charge, index) => (
                <div key={ index } className="rp-wanted-tip-row">
                    <span className="rp-wanted-tip-name">{ charge.name }</span>
                    { (charge.count > 1) && <span className="rp-wanted-tip-count">×{ charge.count }</span> }
                </div>
            )) }
        </div>
    </div>
);

const WantedRow: FC<{ player: RpWantedPlayer }> = ({ player }) => (
    <div className="rp-wanted-row" onClick={ () => GetUserProfile(player.userId) }>
        <div className="rp-wanted-face">
            <LayoutAvatarImageView figure={ player.figure } direction={ 2 } headOnly />
        </div>
        <div className="rp-wanted-who">
            <div className="rp-wanted-name">{ player.username }</div>
            <WantedStars level={ player.level } />
        </div>
        <div className="rp-wanted-since">{ since(player.since) }</div>
        { (player.charges.length > 0) && <WantedTip player={ player } /> }
    </div>
);

export const RpWantedView: FC<{}> = props =>
{
    const [ isVisible, setIsVisible ] = useState(false);
    const [ entries, setEntries ] = useState<RpWantedPlayer[]>(() => GetRpWantedList());

    // The login push usually lands long before this window is opened, so the
    // list is read on mount as well as subscribed to.
    useEffect(() =>
    {
        setEntries(GetRpWantedList());

        return SubscribeRpWanted(() => setEntries(GetRpWantedList()));
    }, []);

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
            eventUrlPrefix: 'rp-wanted/'
        };

        AddEventLinkTracker(linkTracker);

        return () => RemoveLinkEventTracker(linkTracker);
    }, []);

    if(!isVisible) return null;

    return (
        <NitroCardView resizable uniqueKey="rp-wanted" className="rp-wanted-window" theme="primary-slim">
            <NitroCardHeaderView headerText="Wanted List" onCloseClick={ () => setIsVisible(false) } />
            <NitroCardContentView className="text-black">
                <div className="rp-wanted-list">
                    { !entries.length
                        ? <div className="rp-wanted-none">
                            <div className="rp-wanted-none-text">Nobody is wanted right now.</div>
                        </div>
                        : entries.map(player => <WantedRow key={ player.userId } player={ player } />) }
                </div>
            </NitroCardContentView>
        </NitroCardView>
    );
}
