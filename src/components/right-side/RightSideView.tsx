import { FC } from 'react';
import { Column, Flex } from '../../common';
import { OfferView } from '../catalog/views/targeted-offer/OfferView';
import { GameClockView } from '../game-clock/GameClockView';
import { GroupRoomInformationView } from '../groups/views/GroupRoomInformationView';
import { MusicPlayerView } from '../music-player/MusicPlayerView';
import { NotificationCenterView } from '../notification-center/NotificationCenterView';
import { OnlineCountView } from '../online-count/OnlineCountView';
import { PurseView } from '../purse/PurseView';
import { RoomTitleView } from '../room-title/RoomTitleView';
import { MysteryBoxExtensionView } from '../room/widgets/mysterybox/MysteryBoxExtensionView';
import { RoomQuickToolsView } from '../room/widgets/room-tools/RoomQuickToolsView';
import { GymPanelView } from '../rp-gym/GymPanelView';

export const RightSideView: FC<{}> = props =>
{
    return (
        <div className="nitro-right-side">
            <Column position="relative" gap={ 1 }>
                <Flex gap={ 1 } alignItems="start" className="purse-title-row">
                    <OnlineCountView />
                    <GameClockView />
                    <RoomTitleView />
                    <RoomQuickToolsView />
                    <PurseView />
                </Flex>
                <GymPanelView />
                <MusicPlayerView />
                <GroupRoomInformationView />
                <MysteryBoxExtensionView />
                <OfferView/>
                <NotificationCenterView />
            </Column>
        </div>
    );
}
