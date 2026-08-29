import { ExtendedProfileChangedMessageEvent, RelationshipStatusInfoEvent, RelationshipStatusInfoMessageParser, RoomEngineObjectEvent, RoomObjectCategory, RoomObjectType, RpGetUserCorpComposer, RpUserCorpEvent, UserCurrentBadgesComposer, UserCurrentBadgesEvent, UserProfileEvent, UserProfileParser, UserRelationshipsComposer } from '@nitrots/nitro-renderer';
import { FC, useState } from 'react';
import { CreateLinkEvent, GetRoomSession, GetSessionDataManager, GetUserProfile, LocalizeText, SendMessageComposer } from '../../api';
import { Column, Flex, Grid, NitroCardContentView, NitroCardHeaderView, NitroCardView, Text } from '../../common';
import { useMessageEvent, useRoomEngineEvent } from '../../hooks';
import { DEFAULT_CORP_BADGE, GetRpEmployment, RpTierNumeral, SetRpEmployment } from '../../api/rp-employment/RpEmploymentRegistry';
import { LayoutBadgeImageView } from '../../common';
import { BadgesContainerView } from './views/BadgesContainerView';
import { FriendsContainerView } from './views/FriendsContainerView';
import { GroupsContainerView } from './views/GroupsContainerView';
import { UserContainerView } from './views/UserContainerView';

export const UserProfileView: FC<{}> = props =>
{
    const [ userProfile, setUserProfile ] = useState<UserProfileParser>(null);
    const [ userBadges, setUserBadges ] = useState<string[]>([]);
    const [ userRelationships, setUserRelationships ] = useState<RelationshipStatusInfoMessageParser>(null);
    // bumped when employment data lands so the corp row updates in real-time
    const [ , setEmploymentVersion ] = useState(0);

    const onClose = () =>
    {
        setUserProfile(null);
        setUserBadges([]);
        setUserRelationships(null);
    }

    const onLeaveGroup = () =>
    {
        if(!userProfile || (userProfile.id !== GetSessionDataManager().userId)) return;

        GetUserProfile(userProfile.id);
    }

    useMessageEvent<UserCurrentBadgesEvent>(UserCurrentBadgesEvent, event =>
    {
        const parser = event.getParser();

        if(!userProfile || (parser.userId !== userProfile.id)) return;

        setUserBadges(parser.badges);
    });

    useMessageEvent<RelationshipStatusInfoEvent>(RelationshipStatusInfoEvent, event =>
    {
        const parser = event.getParser();

        if(!userProfile || (parser.userId !== userProfile.id)) return;

        setUserRelationships(parser);
    });

    useMessageEvent<UserProfileEvent>(UserProfileEvent, event =>
    {
        const parser = event.getParser();

        let isSameProfile = false;

        setUserProfile(prevValue =>
        {
            if(prevValue && prevValue.id) isSameProfile = (prevValue.id === parser.id);

            return parser;
        });

        if(!isSameProfile)
        {
            setUserBadges([]);
            setUserRelationships(null);
        }

        SendMessageComposer(new UserCurrentBadgesComposer(parser.id));
        SendMessageComposer(new UserRelationshipsComposer(parser.id));
        SendMessageComposer(new RpGetUserCorpComposer(parser.id));
    });

    useMessageEvent<RpUserCorpEvent>(RpUserCorpEvent, event =>
    {
        const parser = event.getParser();

        SetRpEmployment(parser.userId, { corpId: parser.corpId, badge: parser.badge, corpName: parser.corpName, rankName: parser.rankName, tier: parser.tier });
        setEmploymentVersion(value => (value + 1));
    });

    useMessageEvent<ExtendedProfileChangedMessageEvent>(ExtendedProfileChangedMessageEvent, event =>
    {
        const parser = event.getParser();

        if(parser.userId != userProfile?.id) return;

        GetUserProfile(parser.userId);
    });

    useRoomEngineEvent<RoomEngineObjectEvent>(RoomEngineObjectEvent.SELECTED, event =>
    {
        if(!userProfile) return;

        if(event.category !== RoomObjectCategory.UNIT) return;

        const userData = GetRoomSession().userDataManager.getUserDataByIndex(event.objectId);

        if(userData.type !== RoomObjectType.USER) return;

        GetUserProfile(userData.webID);
    });

    if(!userProfile) return null;

    return (
        <NitroCardView uniqueKey="nitro-user-profile" theme="primary-slim" className="user-profile">
            <NitroCardHeaderView headerText={ LocalizeText('extendedprofile.caption') } onCloseClick={ onClose } />
            <NitroCardContentView overflow="hidden">
                <Grid fullHeight={ false } gap={ 2 }>
                    <Column size={ 7 } gap={ 1 } className="user-container pe-2">
                        <UserContainerView userProfile={ userProfile } />
                        <Grid columnCount={ 5 } fullHeight className="bg-muted rounded px-2 py-1">
                            <BadgesContainerView fullWidth center badges={ userBadges } />
                        </Grid>
                    </Column>
                    <Column size={ 5 }>
                        { userRelationships &&
                            <FriendsContainerView relationships={ userRelationships } friendsCount={ userProfile.friendsCount } /> }
                    </Column>
                </Grid>
                { GetRpEmployment(userProfile.id) &&
                    <Flex pointer alignItems="center" gap={ 1 } className="profile-corp-row px-2 py-1" onClick={ event => CreateLinkEvent('rp-corporations/show') }>
                        <div className="profile-corp-badge">
                            <LayoutBadgeImageView badgeCode={ GetRpEmployment(userProfile.id).badge || DEFAULT_CORP_BADGE } />
                        </div>
                        <Text small bold>{ GetRpEmployment(userProfile.id).corpName }</Text>
                        <Text small>{ GetRpEmployment(userProfile.id).rankName } { RpTierNumeral(GetRpEmployment(userProfile.id).tier) }</Text>
                    </Flex> }
                <Flex alignItems="center" className="rooms-button-container px-2 py-1">
                    <Flex alignItems="center" gap={ 1 } onClick={ event => CreateLinkEvent(`navigator/search/hotel_view/owner:${ userProfile.username }`) }>
                        <i className="icon icon-rooms" />
                        <Text bold underline pointer>{ LocalizeText('extendedprofile.rooms') }</Text>
                    </Flex>
                </Flex>
                <GroupsContainerView fullWidth itsMe={ userProfile.id === GetSessionDataManager().userId } groups={ userProfile.groups } onLeaveGroup={ onLeaveGroup } />
            </NitroCardContentView>
        </NitroCardView>
    )
}
