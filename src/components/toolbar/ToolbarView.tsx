import { Dispose, DropBounce, EaseOut, JumpBy, Motions, NitroToolbarAnimateIconEvent, PerkAllowancesMessageEvent, PerkEnum, Queue, Wait } from '@nitrots/nitro-renderer';
import { FC, useState } from 'react';
import { CreateLinkEvent, GetSessionDataManager } from '../../api';
import { Base, Flex, LayoutItemCountView, TransitionAnimation, TransitionAnimationTypes } from '../../common';
import { useAchievements, useInventoryUnseenTracker, useMessageEvent, useRoomEngineEvent } from '../../hooks';
import { usePhoneBadges } from '../phone/usePhone';
import { ToolbarMeView } from './ToolbarMeView';

export const ToolbarView: FC<{ isInRoom: boolean }> = props =>
{
    const { isInRoom } = props;
    const [ isMeExpanded, setMeExpanded ] = useState(false);
    const [ isMenuExpanded, setMenuExpanded ] = useState(false);
    const [ useGuideTool, setUseGuideTool ] = useState(false);
    const { getFullCount = 0 } = useInventoryUnseenTracker();
    const { getTotalUnseen = 0 } = useAchievements();
    const { unreadMessages = 0, requestCount = 0 } = usePhoneBadges();
    const isMod = GetSessionDataManager().isModerator;
    
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
            <Flex alignItems="center" justifyContent="between" gap={ 2 } className="nitro-toolbar py-1 px-3">
                <Flex gap={ 2 } alignItems="center">
                    <Flex alignItems="center" gap={ 2 }>
                        <Base pointer title="Menu" className="navigation-item icon icon-pixelrp" onClick={ event => setMenuExpanded(!isMenuExpanded) } />
                        <Flex alignItems="center" gap={ 2 } className={ 'toolbar-menu-items' + (isMenuExpanded ? ' expanded' : '') }>
                            { isMod &&
                                <Base pointer className="navigation-item icon icon-rooms" onClick={ event => CreateLinkEvent('navigator/toggle') } /> }
                            { isMod &&
                                <Base pointer className="navigation-item icon icon-catalog" onClick={ event => CreateLinkEvent('catalog/toggle') } /> }
                            { isMod &&
                                <Base pointer className="navigation-item icon icon-inventory" onClick={ event => CreateLinkEvent('inventory/toggle') }>
                                    { (getFullCount > 0) &&
                                        <LayoutItemCountView count={ getFullCount } /> }
                                </Base> }
                            { (isInRoom && isMod) &&
                                <Base pointer className="navigation-item icon icon-camera" onClick={ event => CreateLinkEvent('camera/toggle') } /> }
                            { isMod &&
                                <Base pointer className="navigation-item icon icon-modtools" onClick={ event => CreateLinkEvent('mod-tools/toggle') } /> }
                        </Flex>
                    </Flex>
                    <Flex alignItems="center" id="toolbar-chat-input-container" />
                </Flex>
                <Flex alignItems="center" gap={ 2 }>
                    <Flex gap={ 2 }>
                        <Base pointer title="Diamonds" className="navigation-item icon-diamonds" onClick={ event => CreateLinkEvent('diamonds-store/toggle') } />
                        <Base pointer title="Phone" className="navigation-item icon icon-phone" onClick={ event => CreateLinkEvent('phone/toggle') }>
                            { ((unreadMessages + requestCount) > 0) &&
                                <LayoutItemCountView count={ (unreadMessages + requestCount) } /> }
                        </Base>
                    </Flex>
                </Flex>
            </Flex>
        </>
    );
}
