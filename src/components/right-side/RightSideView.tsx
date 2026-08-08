import { FC } from 'react';
import { Column, Flex } from '../../common';
import { OfferView } from '../catalog/views/targeted-offer/OfferView';
import { GroupRoomInformationView } from '../groups/views/GroupRoomInformationView';
import { NotificationCenterView } from '../notification-center/NotificationCenterView';
import { OnlineCountView } from '../online-count/OnlineCountView';
import { PurseView } from '../purse/PurseView';
import { RoomTitleView } from '../room-title/RoomTitleView';
import { MysteryBoxExtensionView } from '../room/widgets/mysterybox/MysteryBoxExtensionView';
import { RoomPromotesWidgetView } from '../room/widgets/room-promotes/RoomPromotesWidgetView';

export const RightSideView: FC<{}> = props =>
{
    return (
        <div className="nitro-right-side">
            <Column position="relative" gap={ 1 }>
                <Flex gap={ 1 } alignItems="start" className="purse-title-row">
                    <OnlineCountView />
                    <RoomTitleView />
                    <PurseView />
                </Flex>
                <GroupRoomInformationView />
                <MysteryBoxExtensionView />
                <OfferView/>
                <RoomPromotesWidgetView />
                <NotificationCenterView />
            </Column>
        </div>
    );
}
