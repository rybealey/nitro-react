import { AvatarAction, AvatarExpressionEnum, RoomControllerLevel, RoomObjectCategory } from '@nitrots/nitro-renderer';
import { Dispatch, FC, SetStateAction, useState } from 'react';
import { FaChevronLeft, FaChevronRight } from 'react-icons/fa';
import { AvatarInfoUser, DispatchUiEvent, GetCanStandUp, GetCanUseExpression, GetOwnPosture, GetSessionDataManager, GetUserProfile, HasHabboClub, HasHabboVip, IsRidingHorse, LocalizeText, PostureTypeEnum, SendMessageComposer } from '../../../../../api';
import { Flex, LayoutCurrencyIcon } from '../../../../../common';
import { HelpNameChangeEvent } from '../../../../../events';
import { useRoom } from '../../../../../hooks';
import { ContextMenuHeaderView } from '../../context-menu/ContextMenuHeaderView';
import { ContextMenuListItemView } from '../../context-menu/ContextMenuListItemView';
import { AVATAR_MENU_CLASSES, ContextMenuView } from '../../context-menu/ContextMenuView';

interface AvatarInfoWidgetOwnAvatarViewProps
{
    avatarInfo: AvatarInfoUser;
    isDancing: boolean;
    setIsDecorating: Dispatch<SetStateAction<boolean>>;
    onClose: () => void;
}

const MODE_NORMAL = 0;
const MODE_CLUB_DANCES = 1;
const MODE_NAME_CHANGE = 2;
const MODE_EXPRESSIONS = 3;

export const AvatarInfoWidgetOwnAvatarView: FC<AvatarInfoWidgetOwnAvatarViewProps> = props =>
{
    const { avatarInfo = null, isDancing = false, setIsDecorating = null, onClose = null } = props;
    const [ mode, setMode ] = useState((isDancing && HasHabboClub()) ? MODE_CLUB_DANCES : MODE_NORMAL);
    const { roomSession = null } = useRoom();

    const processAction = (name: string) =>
    {
        let hideMenu = true;

        if(name)
        {
            switch(name)
            {
                case 'decorate':
                    setIsDecorating(true);
                    break;
                case 'change_name':
                    DispatchUiEvent(new HelpNameChangeEvent(HelpNameChangeEvent.INIT));
                    break;
                case 'expressions':
                    hideMenu = false;
                    setMode(MODE_EXPRESSIONS);
                    break;
                case 'sit':
                    roomSession.sendPostureMessage(PostureTypeEnum.POSTURE_SIT);
                    break;
                case 'stand':
                    roomSession.sendPostureMessage(PostureTypeEnum.POSTURE_STAND);
                    break;
                case 'wave':
                    roomSession.sendExpressionMessage(AvatarExpressionEnum.WAVE.ordinal);
                    break;
                case 'blow':
                    roomSession.sendExpressionMessage(AvatarExpressionEnum.BLOW.ordinal);
                    break;
                case 'laugh':
                    roomSession.sendExpressionMessage(AvatarExpressionEnum.LAUGH.ordinal);
                    break;
                case 'idle':
                    roomSession.sendExpressionMessage(AvatarExpressionEnum.IDLE.ordinal);
                    break;
                case 'dance_menu':
                    hideMenu = false;
                    setMode(MODE_CLUB_DANCES);
                    break;
                case 'dance':
                    roomSession.sendDanceMessage(1);
                    break;
                case 'dance_stop':
                    roomSession.sendDanceMessage(0);
                    break;
                case 'dance_1':
                case 'dance_2':
                case 'dance_3':
                case 'dance_4':
                    roomSession.sendDanceMessage(parseInt(name.charAt((name.length - 1))));
                    break;
                case 'back':
                    hideMenu = false;
                    setMode(MODE_NORMAL);
                    break;
            }
        }

        if(hideMenu) onClose();
    }

    const isShowDecorate = () => (avatarInfo.amIOwner || avatarInfo.amIAnyRoomController || (avatarInfo.roomControllerLevel > RoomControllerLevel.GUEST));
    
    const isRidingHorse = IsRidingHorse();

    return (
        <ContextMenuView objectId={ avatarInfo.roomIndex } category={ RoomObjectCategory.UNIT } userType={ avatarInfo.userType } onClose={ onClose } collapsable={ true } classNames={ AVATAR_MENU_CLASSES }>
            
            <ContextMenuHeaderView className="cursor-pointer" onClick={ event => GetUserProfile(avatarInfo.webID) }>
                { avatarInfo.name }
            </ContextMenuHeaderView>
            { (mode === MODE_NORMAL) &&
                <>
                    { avatarInfo.allowNameChange &&
                        <ContextMenuListItemView onClick={ event => processAction('change_name') }>
                            { LocalizeText('widget.avatar.change_name') }
                        </ContextMenuListItemView> }
                    { isShowDecorate() &&
                        <ContextMenuListItemView onClick={ event => processAction('decorate') }>
                            { LocalizeText('widget.avatar.decorate') }
                        </ContextMenuListItemView> }
                    { (HasHabboClub() && !isRidingHorse) &&
                        <ContextMenuListItemView onClick={ event => processAction('dance_menu') }>
                            <FaChevronRight className="right fa-icon" />
                            { LocalizeText('widget.memenu.dance') }
                        </ContextMenuListItemView> }
                    { (!isDancing && !HasHabboClub() && !isRidingHorse) &&
                        <ContextMenuListItemView onClick={ event => processAction('dance') }>
                            { LocalizeText('widget.memenu.dance') }
                        </ContextMenuListItemView> }
                    { (isDancing && !HasHabboClub() && !isRidingHorse) &&
                        <ContextMenuListItemView onClick={ event => processAction('dance_stop') }>
                            { LocalizeText('widget.memenu.dance.stop') }
                        </ContextMenuListItemView> }
                    <ContextMenuListItemView onClick={ event => processAction('expressions') }>
                        <FaChevronRight className="right fa-icon" />
                        { LocalizeText('infostand.link.expressions') }
                    </ContextMenuListItemView>
                </> }
            { (mode === MODE_CLUB_DANCES) &&
                <>
                    { isDancing &&
                        <ContextMenuListItemView onClick={ event => processAction('dance_stop') }>
                            { LocalizeText('widget.memenu.dance.stop') }
                        </ContextMenuListItemView> }
                    <ContextMenuListItemView onClick={ event => processAction('dance_1') }>
                        { LocalizeText('widget.memenu.dance1') }
                    </ContextMenuListItemView>
                    <ContextMenuListItemView onClick={ event => processAction('dance_2') }>
                        { LocalizeText('widget.memenu.dance2') }
                    </ContextMenuListItemView>
                    <ContextMenuListItemView onClick={ event => processAction('dance_3') }>
                        { LocalizeText('widget.memenu.dance3') }
                    </ContextMenuListItemView>
                    <ContextMenuListItemView onClick={ event => processAction('dance_4') }>
                        { LocalizeText('widget.memenu.dance4') }
                    </ContextMenuListItemView>
                    <ContextMenuListItemView onClick={ event => processAction('back') }>
                        <FaChevronLeft className="left fa-icon" />
                        { LocalizeText('generic.back') }
                    </ContextMenuListItemView>
                </> }
            { (mode === MODE_EXPRESSIONS) &&
                <>
                    { (GetOwnPosture() === AvatarAction.POSTURE_STAND) &&
                        <ContextMenuListItemView onClick={ event => processAction('sit') }>
                            { LocalizeText('widget.memenu.sit') }
                        </ContextMenuListItemView> }
                    { GetCanStandUp() &&
                        <ContextMenuListItemView onClick={ event => processAction('stand') }>
                            { LocalizeText('widget.memenu.stand') }
                        </ContextMenuListItemView> }
                    { GetCanUseExpression() &&
                        <ContextMenuListItemView onClick={ event => processAction('wave') }>
                            { LocalizeText('widget.memenu.wave') }
                        </ContextMenuListItemView> }
                    { GetCanUseExpression() &&
                        <ContextMenuListItemView disabled={ !HasHabboVip() } onClick={ event => processAction('laugh') }>
                            { !HasHabboVip() && <LayoutCurrencyIcon type="hc" /> }
                            { LocalizeText('widget.memenu.laugh') }
                        </ContextMenuListItemView> }
                    { GetCanUseExpression() &&
                        <ContextMenuListItemView disabled={ !HasHabboVip() } onClick={ event => processAction('blow') }>
                            { !HasHabboVip() && <LayoutCurrencyIcon type="hc" /> }
                            { LocalizeText('widget.memenu.blow') }
                        </ContextMenuListItemView> }
                    <ContextMenuListItemView onClick={ event => processAction('idle') }>
                        { LocalizeText('widget.memenu.idle') }
                    </ContextMenuListItemView>
                    <ContextMenuListItemView onClick={ event => processAction('back') }>
                        <FaChevronLeft className="left fa-icon" />
                        { LocalizeText('generic.back') }
                    </ContextMenuListItemView>
                </> }
        </ContextMenuView>
    );
}
