import { FriendlyTime, GetModeratorUserInfoMessageComposer, ModeratorUserInfoData, ModeratorUserInfoEvent } from '@nitrots/nitro-renderer';
import { FC, useEffect, useState } from 'react';
import { CreateLinkEvent, SendMessageComposer } from '../../../../api';
import { DraggableWindowPosition, LayoutAvatarImageView, NitroCardContentView, NitroCardHeaderView, NitroCardTabsItemView, NitroCardTabsView, NitroCardView } from '../../../../common';
import { useMessageEvent } from '../../../../hooks';
import { ModToolsUserModActionView } from './ModToolsUserModActionView';
import { ModToolsUserRoomVisitsView } from './ModToolsUserRoomVisitsView';
import { ModToolsUserSendMessageView } from './ModToolsUserSendMessageView';

// User info (Mod Tools canvas): one window with Info / Visits / Message /
// Sanction tabs in place of the stock window and the three pop-ups it
// opened. Room chat stays its own window - it is wide and scrolls.
interface ModToolsUserViewProps
{
    userId: number;
    onCloseClick: () => void;
}

const TABS = [ 'Info', 'Visits', 'Message', 'Sanction' ];

const ValueOrDash = (value: string) => ((value && value.length) ? value : '-');

export const ModToolsUserView: FC<ModToolsUserViewProps> = props =>
{
    const { onCloseClick = null, userId = null } = props;
    const [ userInfo, setUserInfo ] = useState<ModeratorUserInfoData>(null);
    const [ currentTab, setCurrentTab ] = useState(TABS[0]);

    useMessageEvent<ModeratorUserInfoEvent>(ModeratorUserInfoEvent, event =>
    {
        const parser = event.getParser();

        if(!parser || parser.data.userId !== userId) return;

        setUserInfo(parser.data);
    });

    useEffect(() =>
    {
        SendMessageComposer(new GetModeratorUserInfoMessageComposer(userId));
    }, [ userId ]);

    if(!userInfo) return null;

    const user = { userId: userId, username: userInfo.userName };
    const details: [ string, string ][] = [
        [ 'Last sanction', ValueOrDash(userInfo.lastSanctionTime) ],
        [ 'Trade locks', userInfo.tradingLockCount.toString() ],
        [ 'Trade lock ends', ValueOrDash(userInfo.tradingExpiryDate) ],
        [ 'Last login', FriendlyTime.format(userInfo.minutesSinceLastLogin * 60, '.ago', 2) ],
        [ 'Last purchase', ValueOrDash(userInfo.lastPurchaseDate) ],
        [ 'Email', ValueOrDash(userInfo.primaryEmailAddress) ],
        [ 'Identity bans', userInfo.identityRelatedBanCount.toString() ],
        [ 'Account age', FriendlyTime.format(userInfo.registrationAgeInMinutes * 60, '.ago', 2) ]
    ];

    return (
        <NitroCardView className="nitro-mod-tools-user" theme="primary-slim" windowPosition={ DraggableWindowPosition.TOP_LEFT }>
            <NitroCardHeaderView headerText={ `User: ${ userInfo.userName }` } onCloseClick={ () => onCloseClick() } />
            <NitroCardTabsView>
                { TABS.map(tab => (
                    <NitroCardTabsItemView key={ tab } isActive={ (currentTab === tab) } onClick={ event => setCurrentTab(tab) }>
                        { tab }
                    </NitroCardTabsItemView>
                )) }
            </NitroCardTabsView>
            <NitroCardContentView className="mt-page" overflow="hidden">
                <div className="mt-user-head">
                    <div className="mt-user-face">
                        <LayoutAvatarImageView figure={ userInfo.figure } headOnly={ true } direction={ 2 } />
                    </div>
                    <div className="mt-user-name-block">
                        <div className="mt-user-name">{ userInfo.userName }</div>
                        <div className="mt-user-status"><i className={ `mt-dot${ userInfo.online ? ' is-online' : '' }` } />{ userInfo.online ? 'Online' : 'Offline' }{ userInfo.userClassification ? ` · ${ userInfo.userClassification }` : '' }</div>
                    </div>
                    <button type="button" className="mt-chrome mt-small" onClick={ () => CreateLinkEvent(`mod-tools/open-user-chatlog/${ userId }`) }>Room chat</button>
                </div>
                { (currentTab === 'Info') &&
                    <>
                        <div className="mt-chips">
                            <div className="mt-chip"><b>{ userInfo.cfhCount }</b><span>Reports</span></div>
                            <div className="mt-chip is-warn"><b>{ userInfo.abusiveCfhCount }</b><span>Abusive</span></div>
                            <div className="mt-chip is-warn"><b>{ userInfo.cautionCount }</b><span>Cautions</span></div>
                            <div className="mt-chip is-warn"><b>{ userInfo.banCount }</b><span>Bans</span></div>
                        </div>
                        <div className="mt-card mt-scroll">
                            { details.map(([ label, value ]) => (
                                <div key={ label } className="mt-line"><span className="mt-muted">{ label }</span><b className="mt-value">{ value }</b></div>
                            )) }
                        </div>
                    </> }
                { (currentTab === 'Visits') &&
                    <ModToolsUserRoomVisitsView userId={ userId } /> }
                { (currentTab === 'Message') &&
                    <ModToolsUserSendMessageView user={ user } /> }
                { (currentTab === 'Sanction') &&
                    <ModToolsUserModActionView user={ user } /> }
            </NitroCardContentView>
        </NitroCardView>
    );
}
