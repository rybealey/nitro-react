import { RoomEngineEvent, RoomEnterEffect, RoomSessionDanceEvent, RpUserCorpEvent } from '@nitrots/nitro-renderer';
import { FC, useEffect, useState } from 'react';
import { AvatarInfoFurni, AvatarInfoPet, AvatarInfoRentableBot, AvatarInfoUser, GetConfiguration, GetSessionDataManager, RoomWidgetUpdateRentableBotChatEvent } from '../../../../api';
import { Column } from '../../../../common';
import { useAvatarInfoWidget, useMessageEvent, useRoom, useRoomEngineEvent, useRoomSessionManagerEvent, useUiEvent } from '../../../../hooks';
import { SetRpEmployment } from '../../../../api/rp-employment/RpEmploymentRegistry';
import { AvatarInfoPetTrainingPanelView } from './AvatarInfoPetTrainingPanelView';
import { AvatarInfoRentableBotChatView } from './AvatarInfoRentableBotChatView';
import { AvatarInfoUseProductConfirmView } from './AvatarInfoUseProductConfirmView';
import { AvatarInfoUseProductView } from './AvatarInfoUseProductView';
import { InfoStandWidgetBotView } from './infostand/InfoStandWidgetBotView';
import { InfoStandWidgetFurniView } from './infostand/InfoStandWidgetFurniView';
import { InfoStandWidgetPetView } from './infostand/InfoStandWidgetPetView';
import { InfoStandWidgetRentableBotView } from './infostand/InfoStandWidgetRentableBotView';
import { InfoStandWidgetUserView } from './infostand/InfoStandWidgetUserView';
import { AvatarInfoWidgetAvatarView } from './menu/AvatarInfoWidgetAvatarView';
import { AvatarInfoWidgetDecorateView } from './menu/AvatarInfoWidgetDecorateView';
import { AvatarInfoWidgetFurniView } from './menu/AvatarInfoWidgetFurniView';
import { AvatarInfoWidgetNameView } from './menu/AvatarInfoWidgetNameView';
import { AvatarInfoWidgetOwnAvatarView } from './menu/AvatarInfoWidgetOwnAvatarView';
import { AvatarInfoWidgetOwnPetView } from './menu/AvatarInfoWidgetOwnPetView';
import { AvatarInfoWidgetPetView } from './menu/AvatarInfoWidgetPetView';
import { AvatarInfoWidgetRentableBotView } from './menu/AvatarInfoWidgetRentableBotView';

export const AvatarInfoWidgetView: FC<{}> = props =>
{
    const [ isGameMode, setGameMode ] = useState(false);
    const [ isDancing, setIsDancing ] = useState(false);
    const [ rentableBotChatEvent, setRentableBotChatEvent ] = useState<RoomWidgetUpdateRentableBotChatEvent>(null);
    const { avatarInfo = null, setAvatarInfo = null, activeNameBubble = null, setActiveNameBubble = null, nameBubbles = [], removeNameBubble = null, productBubbles = [], confirmingProduct = null, updateConfirmingProduct = null, removeProductBubble = null, isDecorating = false, setIsDecorating = null } = useAvatarInfoWidget();
    const { roomSession = null } = useRoom();

    useRoomEngineEvent<RoomEngineEvent>(RoomEngineEvent.NORMAL_MODE, event =>
    {
        if(isGameMode) setGameMode(false);
    });

    useRoomEngineEvent<RoomEngineEvent>(RoomEngineEvent.GAME_MODE, event =>
    {
        if(!isGameMode) setGameMode(true);
    });

    useRoomSessionManagerEvent<RoomSessionDanceEvent>(RoomSessionDanceEvent.RSDE_DANCE, event =>
    {
        if(event.roomIndex !== roomSession.ownRoomIndex) return;

        setIsDancing((event.danceId !== 0));
    });

    useUiEvent<RoomWidgetUpdateRentableBotChatEvent>(RoomWidgetUpdateRentableBotChatEvent.UPDATE_CHAT, event => setRentableBotChatEvent(event));

    const getMenuView = () =>
    {
        if(!roomSession || isGameMode) return null;

        if(activeNameBubble) return <AvatarInfoWidgetNameView nameInfo={ activeNameBubble } onClose={ () => setActiveNameBubble(null) } />;

        if(avatarInfo)
        {
            switch(avatarInfo.type)
            {
                case AvatarInfoFurni.FURNI: {
                    const info = (avatarInfo as AvatarInfoFurni);

                    if(!isDecorating) return null;

                    return <AvatarInfoWidgetFurniView avatarInfo={ info } onClose={ () => setAvatarInfo(null) } />;
                }
                case AvatarInfoUser.OWN_USER:
                case AvatarInfoUser.PEER: {
                    const info = (avatarInfo as AvatarInfoUser);
                    if (GetConfiguration('user.tags.enabled')) GetSessionDataManager().getUserTags(info.roomIndex);

                    if(info.isSpectatorMode) return null;

                    if(info.isOwnUser)
                    {
                        if(RoomEnterEffect.isRunning()) return null;

                        return <AvatarInfoWidgetOwnAvatarView avatarInfo={ info } isDancing={ isDancing } setIsDecorating={ setIsDecorating } onClose={ () => setAvatarInfo(null) } />;
                    }

                    return <AvatarInfoWidgetAvatarView avatarInfo={ info } onClose={ () => setAvatarInfo(null) } />;
                }
                case AvatarInfoPet.PET_INFO: {
                    const info = (avatarInfo as AvatarInfoPet);

                    if(info.isOwner) return <AvatarInfoWidgetOwnPetView avatarInfo={ info } onClose={ () => setAvatarInfo(null) } />;

                    return <AvatarInfoWidgetPetView avatarInfo={ info } onClose={ () => setAvatarInfo(null) } />;
                }
                case AvatarInfoRentableBot.RENTABLE_BOT: {
                    return <AvatarInfoWidgetRentableBotView avatarInfo={ (avatarInfo as AvatarInfoRentableBot) } onClose={ () => setAvatarInfo(null) } />
                }
            }
        }

        return null;
    }

    // The infostand slides in from the right on open and back out on close:
    // the last info sticks around as `displayedInfo` for the exit animation's
    // duration before the container unmounts. Switching targets while open
    // just swaps content in place. Duration matches the CSS animations.
    const [ , setEmploymentVersion ] = useState(0);

    // Employment lands here (always mounted in-room): room-entry snapshots
    // and real-time hire broadcasts feed the registry, and the version bump
    // re-renders an open infostand so its corp badge slot updates live.
    useMessageEvent<RpUserCorpEvent>(RpUserCorpEvent, event =>
    {
        const parser = event.getParser();

        SetRpEmployment(parser.userId, { corpId: parser.corpId, badge: parser.badge, corpName: parser.corpName, rankName: parser.rankName, tier: parser.tier, shiftSeconds: parser.shiftSeconds, shiftSecondsWeek: parser.shiftSecondsWeek, onDuty: parser.onDuty, receivedAt: Date.now() });
        setEmploymentVersion(value => (value + 1));
    });

    const [ displayedInfo, setDisplayedInfo ] = useState(avatarInfo);
    const [ infostandClosing, setInfostandClosing ] = useState(false);

    useEffect(() =>
    {
        if(avatarInfo)
        {
            setDisplayedInfo(avatarInfo);
            setInfostandClosing(false);

            return;
        }

        setInfostandClosing(true);

        const timeout = window.setTimeout(() =>
        {
            setDisplayedInfo(null);
            setInfostandClosing(false);
        }, 220);

        return () => window.clearTimeout(timeout);
    }, [ avatarInfo ]);

    const getInfostandView = () =>
    {
        if(!displayedInfo) return null;

        switch(displayedInfo.type)
        {
            case AvatarInfoFurni.FURNI:
                return <InfoStandWidgetFurniView avatarInfo={ (displayedInfo as AvatarInfoFurni) } onClose={ () => setAvatarInfo(null) } />;
            case AvatarInfoUser.OWN_USER:
            case AvatarInfoUser.PEER:
                return <InfoStandWidgetUserView avatarInfo={ (displayedInfo as AvatarInfoUser) } setAvatarInfo={ setAvatarInfo } onClose={ () => setAvatarInfo(null) } />;
            case AvatarInfoUser.BOT:
                return <InfoStandWidgetBotView avatarInfo={ (displayedInfo as AvatarInfoUser) } onClose={ () => setAvatarInfo(null) } />;
            case AvatarInfoRentableBot.RENTABLE_BOT:
                return <InfoStandWidgetRentableBotView avatarInfo={ (displayedInfo as AvatarInfoRentableBot) } onClose={ () => setAvatarInfo(null) } />;
            case AvatarInfoPet.PET_INFO:
                return <InfoStandWidgetPetView avatarInfo={ (displayedInfo as AvatarInfoPet) } onClose={ () => setAvatarInfo(null) } />
        }
    }

    return (
        <>
            { isDecorating &&
                <AvatarInfoWidgetDecorateView userId={ GetSessionDataManager().userId } userName={ GetSessionDataManager().userName } roomIndex={ roomSession.ownRoomIndex } setIsDecorating={ setIsDecorating } /> }
            { getMenuView() }
            { displayedInfo &&
                <Column alignItems="end" className={ `nitro-infostand-container${ infostandClosing ? ' is-closing' : '' }` }>
                    { getInfostandView() }
                </Column> }
            { (nameBubbles.length > 0) && nameBubbles.map((name, index) => <AvatarInfoWidgetNameView key={ index } nameInfo={ name } onClose={ () => removeNameBubble(index) } />) }
            { (productBubbles.length > 0) && productBubbles.map((item, index) =>
            {
                return <AvatarInfoUseProductView key={ item.id } item={ item } updateConfirmingProduct={ updateConfirmingProduct } onClose={ () => removeProductBubble(index) } />;
            }) }
            { rentableBotChatEvent && <AvatarInfoRentableBotChatView chatEvent={ rentableBotChatEvent } onClose={ () => setRentableBotChatEvent(null) }/> }
            { confirmingProduct && <AvatarInfoUseProductConfirmView item={ confirmingProduct } onClose={ () => updateConfirmingProduct(null) } /> }
            <AvatarInfoPetTrainingPanelView />
        </>
    )
}
