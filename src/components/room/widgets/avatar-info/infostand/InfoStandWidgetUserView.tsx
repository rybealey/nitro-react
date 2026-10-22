import { RelationshipStatusInfoEvent, RelationshipStatusInfoMessageParser, RoomSessionFavoriteGroupUpdateEvent, RoomSessionUserBadgesEvent, RoomSessionUserFigureUpdateEvent, UserRelationshipsComposer } from '@nitrots/nitro-renderer';
import { Dispatch, FC, SetStateAction, useEffect, useState } from 'react';
import { LuBriefcase } from 'react-icons/lu';
import { IsRpStaff } from '../../player-hud/PlayerHudWidgetView';
import { DEFAULT_CORP_BADGE, GetRpEmployment, RpRankTitle } from '../../../../../api/rp-employment/RpEmploymentRegistry';
import { CreateLinkEvent, AvatarInfoUser, CloneObject, GetConfiguration, GetGroupInformation, GetSessionDataManager, GetUserProfile, LocalizeText, SendMessageComposer } from '../../../../../api';
import { Column, Flex, LayoutAvatarImageView, LayoutBadgeImageView, Text } from '../../../../../common';
import { useMessageEvent, useRoomSessionManagerEvent } from '../../../../../hooks';
import { InfoStandWidgetUserRelationshipsView } from './InfoStandWidgetUserRelationshipsView';
import { InfoStandWidgetUserTagsView } from './InfoStandWidgetUserTagsView';

interface InfoStandWidgetUserViewProps
{
    avatarInfo: AvatarInfoUser;
    setAvatarInfo: Dispatch<SetStateAction<AvatarInfoUser>>;
    onClose: () => void;
}

// pixelrp: the parts of an answer the view reads. The parser itself is one
// object the renderer fills again for every answer, so it is not kept.
export type UserRelationships = Pick<RelationshipStatusInfoMessageParser, 'userId' | 'relationshipStatusMap'>;

const RELATIONSHIPS_CACHE_MS = 60000;
const relationshipsCache: Map<number, { at: number, relationships: UserRelationships }> = new Map();

export const InfoStandWidgetUserView: FC<InfoStandWidgetUserViewProps> = props =>
{
    const { avatarInfo = null, setAvatarInfo = null, onClose = null } = props;
    const [ motto, setMotto ] = useState<string>(null);
    const [ relationships, setRelationships ] = useState<UserRelationships>(null);

    useRoomSessionManagerEvent<RoomSessionUserBadgesEvent>(RoomSessionUserBadgesEvent.RSUBE_BADGES, event =>
    {
        if(!avatarInfo || (avatarInfo.webID !== event.userId)) return;

        const oldBadges = avatarInfo.badges.join('');

        if(oldBadges === event.badges.join('')) return;

        setAvatarInfo(prevValue =>
        {
            const newValue = CloneObject(prevValue);

            newValue.badges = event.badges;

            return newValue;
        });
    });

    useRoomSessionManagerEvent<RoomSessionUserFigureUpdateEvent>(RoomSessionUserFigureUpdateEvent.USER_FIGURE, event =>
    {
        if(!avatarInfo || (avatarInfo.roomIndex !== event.roomIndex)) return;

        setAvatarInfo(prevValue =>
        {
            const newValue = CloneObject(prevValue);

            newValue.figure = event.figure;
            newValue.motto = event.customInfo;
            newValue.achievementScore = event.activityPoints;

            return newValue;
        });
    });

    useRoomSessionManagerEvent<RoomSessionFavoriteGroupUpdateEvent>(RoomSessionFavoriteGroupUpdateEvent.FAVOURITE_GROUP_UPDATE, event =>
    {
        if(!avatarInfo || (avatarInfo.roomIndex !== event.roomIndex)) return;

        setAvatarInfo(prevValue =>
        {
            const newValue = CloneObject(prevValue);
            const clearGroup = ((event.status === -1) || (event.habboGroupId <= 0));

            newValue.groupId = clearGroup ? -1 : event.habboGroupId;
            newValue.groupName = clearGroup ? null : event.habboGroupName
            newValue.groupBadgeId = clearGroup ? null : GetSessionDataManager().getGroupBadge(event.habboGroupId);

            return newValue;
        });
    });

    useMessageEvent<RelationshipStatusInfoEvent>(RelationshipStatusInfoEvent, event =>
    {
        const parser = event.getParser();

        if(!avatarInfo || (avatarInfo.webID !== parser.userId)) return;

        const snapshot = { userId: parser.userId, relationshipStatusMap: parser.relationshipStatusMap };

        relationshipsCache.set(parser.userId, { at: Date.now(), relationships: snapshot });
        setRelationships(snapshot);
    });

    // pixelrp: by player and motto, with no reset on the way out - a cleared
    // then re-set motto drew the infostand again after every click.
    useEffect(() =>
    {
        setMotto(avatarInfo.motto);
    }, [ avatarInfo.webID, avatarInfo.motto ]);

    // pixelrp: once per player shown, not per info object - every click on the
    // same player, and every badge, figure or group update, makes a new one.
    // An answer is reused for RELATIONSHIPS_CACHE_MS: the infostand closes on
    // every floor click, and each reopening asked again.
    useEffect(() =>
    {
        const cached = relationshipsCache.get(avatarInfo.webID);

        if(cached && ((Date.now() - cached.at) < RELATIONSHIPS_CACHE_MS)) setRelationships(cached.relationships);
        else SendMessageComposer(new UserRelationshipsComposer(avatarInfo.webID));

        return () => setRelationships(null);
    }, [ avatarInfo.webID ]);

    if(!avatarInfo) return null;

    return (
        <Column className="nitro-infostand rounded">
            <Column overflow="visible" className="container-fluid content-area" gap={ 1 }>
                <Column gap={ 1 }>
                    <Flex alignItems="center" justifyContent="between">
                        <Flex alignItems="center" gap={ 1 }>
                            { /* the name is the profile link (replaces the old icon) */ }
                            <Text variant="white" small wrap pointer className="infostand-name-link" onClick={ event => GetUserProfile(avatarInfo.webID) }>{ avatarInfo.name }</Text>
                            { /* outside the name link so hover-underline never touches it */ }
                            { IsRpStaff(avatarInfo.roomIndex) &&
                                <i className="fa-solid fa-badge-check infostand-verified" title="PixelRP Staff" aria-hidden="true" /> }
                        </Flex>
                        <span className="prp-close prp-close--sm" title="Close" onClick={ onClose } />
                    </Flex>
                    <hr className="m-0" />
                </Column>
                <Column gap={ 1 }>
                    <Flex gap={ 1 }>
                        <Column fullWidth className="body-image" onClick={ event => GetUserProfile(avatarInfo.webID) }>
                            { /* faces diagonally left (4), like the bot and pet infostands */ }
                            <LayoutAvatarImageView figure={ avatarInfo.figure } direction={ 4 } />
                        </Column>
                        <Column grow alignItems="center" gap={ 0 }>
                            { /* one uniform 2x3 slot grid - even gaps both ways */ }
                            <div className="badge-grid">
                                <Flex center className="badge-image">
                                    { avatarInfo.badges[0] && <LayoutBadgeImageView badgeCode={ avatarInfo.badges[0] } /> }
                                </Flex>
                                { /* corporation slot: the employer's badge once hired;
                                     falls back to the group badge, then the briefcase hint */ }
                                { (() =>
                                {
                                    const employment = GetRpEmployment(avatarInfo.webID);

                                    if(employment)
                                    {
                                        return (
                                            <Flex center pointer className="badge-image badge-image--corp is-employed" title={ `${ employment.corpName } - ${ RpRankTitle(employment.rankName, employment.tier) }` } onClick={ event => CreateLinkEvent('rp-corporations/show') }>
                                                <LayoutBadgeImageView badgeCode={ employment.badge || DEFAULT_CORP_BADGE } />
                                            </Flex>);
                                    }

                                    return (
                                        <Flex center pointer={ ( avatarInfo.groupId > 0) } className="badge-image badge-image--corp" onClick={ event => GetGroupInformation(avatarInfo.groupId) }>
                                            { (avatarInfo.groupId > 0)
                                                ? <LayoutBadgeImageView badgeCode={ avatarInfo.groupBadgeId } isGroup={ true } />
                                                : <LuBriefcase className="badge-corp-hint" /> }
                                        </Flex>);
                                })() }
                                <Flex center className="badge-image">
                                    { avatarInfo.badges[1] && <LayoutBadgeImageView badgeCode={ avatarInfo.badges[1] } /> }
                                </Flex>
                                <Flex center className="badge-image">
                                    { avatarInfo.badges[2] && <LayoutBadgeImageView badgeCode={ avatarInfo.badges[2] } /> }
                                </Flex>
                                <Flex center className="badge-image">
                                    { avatarInfo.badges[3] && <LayoutBadgeImageView badgeCode={ avatarInfo.badges[3] } /> }
                                </Flex>
                                <Flex center className="badge-image">
                                    { avatarInfo.badges[4] && <LayoutBadgeImageView badgeCode={ avatarInfo.badges[4] } /> }
                                </Flex>
                            </div>
                        </Column>
                    </Flex>
                    <hr className="m-0" />
                </Column>
                <Column gap={ 1 }>
                    { /* PixelRP: the motto is RP-managed (job/role text) — read-only
                         for everyone, own infostand included. The emulator rejects
                         motto-change packets too. */ }
                    <Flex alignItems="center" className="bg-light-dark rounded py-1 px-2">
                        <Flex grow alignItems="center" className="motto-content">
                            <Text fullWidth wrap textBreak small variant="white">{ motto }</Text>
                        </Flex>
                    </Flex>
                    <hr className="m-0" />
                </Column>
                { (avatarInfo.carryItem > 0) &&
                    <Column gap={ 1 }>
                        <Text variant="white" small wrap>
                            { LocalizeText('infostand.text.handitem', [ 'item' ], [ LocalizeText('handitem' + avatarInfo.carryItem) ]) }
                        </Text>
                    </Column> }
                <Column gap={ 1 }>
                    <InfoStandWidgetUserRelationshipsView relationships={ relationships } />
                </Column>
                { GetConfiguration('user.tags.enabled') &&
                    <Column gap={ 1 } className="mt-1">
                        <InfoStandWidgetUserTagsView tags={ GetSessionDataManager().tags } />
                    </Column>
                }
            </Column>
        </Column>
    );
}
