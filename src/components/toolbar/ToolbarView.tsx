import { Dispose, DropBounce, EaseOut, JumpBy, Motions, NitroToolbarAnimateIconEvent, PerkAllowancesMessageEvent, PerkEnum, Queue, Wait } from '@nitrots/nitro-renderer';
import { FC, useState } from 'react';
import { CreateLinkEvent, GetSessionDataManager, HasHabboVip } from '../../api';
import { RP_RANK_BUILDER, RP_RANK_TRIAL_MODERATOR } from '../../api/rp-rights/RpRanks';
import { Flex, HoverBubble, LayoutItemCountView, TransitionAnimation, TransitionAnimationTypes } from '../../common';
import { useAchievements, useInventoryUnseenTracker, useMessageEvent, useRoomEngineEvent } from '../../hooks';
import { usePhoneAppBadges } from '../phone/usePhoneNotifications';
import { ToolbarMeView } from './ToolbarMeView';

export const ToolbarView: FC<{ isInRoom: boolean }> = props =>
{
    const { isInRoom } = props;
    const [ isMeExpanded, setMeExpanded ] = useState(false);
    // the menu starts open; the PixelRP emblem folds it away and back
    const [ isMenuExpanded, setMenuExpanded ] = useState(true);
    const [ useGuideTool, setUseGuideTool ] = useState(false);
    const { getFullCount = 0 } = useInventoryUnseenTracker();
    const { getTotalUnseen = 0 } = useAchievements();
    // Every app's badge added up: the phone button carries whatever the phone
    // itself would show, so a closed phone still says how much is waiting.
    const { total: phoneBadge } = usePhoneAppBadges();
    const isMod = GetSessionDataManager().isModerator;
    // Mod Tools from Trial Moderator up, below the isModerator line: every rank
    // from 3 holds the mod_tool right the tool's packets check
    const canModTools = (GetSessionDataManager().securityLevel >= RP_RANK_TRIAL_MODERATOR);
    // Navigator, Furni Shop and Inventory from Builder up - Builders build. The
    // server opens the shop's and the navigator's packets at the same rank (BuilderOnly)
    const canBuild = (GetSessionDataManager().securityLevel >= RP_RANK_BUILDER);
    const showCamera = (isInRoom && (isMod || HasHabboVip()));
    // an open menu with nothing in it would leave a gap beside the emblem
    const hasMenuItems = (isMod || canModTools || canBuild || showCamera);

    useMessageEvent<PerkAllowancesMessageEvent>(PerkAllowancesMessageEvent, event =>
    {
        const parser = event.getParser();

        setUseGuideTool(parser.isAllowed(PerkEnum.USE_GUIDE_TOOL));
    });

    useRoomEngineEvent<NitroToolbarAnimateIconEvent>(NitroToolbarAnimateIconEvent.ANIMATE_ICON, event =>
    {
        const animationIconToToolbar = (iconName: string, image: HTMLImageElement, x: number, y: number) =>
        {
            const target = (document.body.getElementsByClassName(iconName)[0] as HTMLElement);

            if(!target) return;
            
            image.className = 'toolbar-icon-animation';
            image.style.visibility = 'visible';
            image.style.left = (x + 'px');
            image.style.top = (y + 'px');

            document.body.append(image);

            const targetBounds = target.getBoundingClientRect();
            const imageBounds = image.getBoundingClientRect();

            const left = (imageBounds.x - targetBounds.x);
            const top = (imageBounds.y - targetBounds.y);
            const squared = Math.sqrt(((left * left) + (top * top)));
            const wait = (500 - Math.abs(((((1 / squared) * 100) * 500) * 0.5)));
            const height = 20;

            const motionName = (`ToolbarBouncing[${ iconName }]`);

            if(!Motions.getMotionByTag(motionName))
            {
                Motions.runMotion(new Queue(new Wait((wait + 8)), new DropBounce(target, 400, 12))).tag = motionName;
            }

            const motion = new Queue(new EaseOut(new JumpBy(image, wait, ((targetBounds.x - imageBounds.x) + height), (targetBounds.y - imageBounds.y), 100, 1), 1), new Dispose(image));

            Motions.runMotion(motion);
        }

        animationIconToToolbar('icon-inventory', event.image, event.x, event.y);
    });

    return (
        <>
            <TransitionAnimation type={ TransitionAnimationTypes.FADE_IN } inProp={ isMeExpanded } timeout={ 300 }>
                <ToolbarMeView useGuideTool={ useGuideTool } unseenAchievementCount={ getTotalUnseen } setMeExpanded={ setMeExpanded } />
            </TransitionAnimation>
            { /* Two panels docked into the screen's bottom corners, each icon on
                 its own tile (HUD Toolbar Redesign canvas, D). The chat bar
                 portals into the middle one and centres itself on the toolbar. */ }
            <Flex alignItems="end" justifyContent="between" className="nitro-toolbar">
                <Flex alignItems="center" className="toolbar-panel is-left">
                    <HoverBubble text="Menu">
                        <div className="cursor-pointer toolbar-logo" onClick={ event => setMenuExpanded(!isMenuExpanded) }>
                            <span className="toolbar-logo-shine" />
                        </div>
                    </HoverBubble>
                    <Flex alignItems="center" className={ 'toolbar-menu-items' + ((isMenuExpanded && hasMenuItems) ? ' expanded' : '') }>
                        <div className="toolbar-groove" />
                        <Flex alignItems="center" gap={ 2 }>
                            { canBuild &&
                                <HoverBubble text="Navigator">
                                    <div className="cursor-pointer toolbar-tile" onClick={ event => CreateLinkEvent('navigator/toggle') }>
                                        <div className="icon icon-rooms" />
                                    </div>
                                </HoverBubble> }
                            { canBuild &&
                                <HoverBubble text="Furni Shop">
                                    <div className="cursor-pointer toolbar-tile" onClick={ event => CreateLinkEvent('catalog/toggle') }>
                                        <div className="icon icon-catalog" />
                                    </div>
                                </HoverBubble> }
                            { canBuild &&
                                <HoverBubble text="Inventory">
                                    <div className="cursor-pointer toolbar-tile" onClick={ event => CreateLinkEvent('inventory/toggle') }>
                                        <div className="icon icon-inventory" />
                                        { (getFullCount > 0) &&
                                            <LayoutItemCountView count={ getFullCount } /> }
                                    </div>
                                </HoverBubble> }
                            { showCamera &&
                                <HoverBubble text="Camera">
                                    <div className="cursor-pointer toolbar-tile" onClick={ event => CreateLinkEvent('camera/toggle') }>
                                        <div className="icon icon-camera" />
                                    </div>
                                </HoverBubble> }
                            { canModTools &&
                                <HoverBubble text="Mod Tools">
                                    <div className="cursor-pointer toolbar-tile" onClick={ event => CreateLinkEvent('mod-tools/toggle') }>
                                        <div className="icon icon-modtools" />
                                    </div>
                                </HoverBubble> }
                        </Flex>
                    </Flex>
                </Flex>
                <Flex alignItems="center" id="toolbar-chat-input-container" />
                <Flex alignItems="center" gap={ 2 } className="toolbar-panel is-right">
                    { /* everyone's, beside the Diamonds Shop */ }
                    <HoverBubble text="Customisation">
                        <div className="cursor-pointer toolbar-tile" onClick={ event => CreateLinkEvent('customisation/toggle') }>
                            <div className="icon icon-customisation" />
                        </div>
                    </HoverBubble>
                    <HoverBubble text="Diamonds Shop">
                        <div className="cursor-pointer toolbar-tile" onClick={ event => CreateLinkEvent('diamonds-store/toggle') }>
                            <div className="icon-diamonds" />
                        </div>
                    </HoverBubble>
                    <HoverBubble text="Phone">
                        <div className="cursor-pointer toolbar-tile" onClick={ event => CreateLinkEvent('phone/toggle') }>
                            <div className="icon icon-phone" />
                            { (phoneBadge > 0) &&
                                <LayoutItemCountView count={ phoneBadge } /> }
                        </div>
                    </HoverBubble>
                </Flex>
            </Flex>
        </>
    );
}
