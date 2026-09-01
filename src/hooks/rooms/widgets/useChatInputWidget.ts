import { AvatarExpressionEnum, GetTicker, HabboClubLevelEnum, InfoRetrieveMessageComposer, RoomControllerLevel, RoomEngineObjectEvent, RoomObjectCategory, RoomRotatingEffect, RoomSessionChatEvent, RoomSettingsComposer, RoomShakingEffect, RoomZoomEvent, TextureUtils, UserInfoEvent } from '@nitrots/nitro-renderer';
import { useEffect, useState } from 'react';
import { ChatMessageTypeEnum, CreateLinkEvent, GetClubMemberLevel, GetCommunication, GetConfiguration, GetRoomEngine, GetRoomSessionManager, GetSessionDataManager, LocalizeText, SendMessageComposer } from '../../../api';
import { ClickthroughState } from '../clickthroughState';
import { TargetState } from '../targetState';
import { useRoomEngineEvent, useRoomSessionManagerEvent } from '../../events';
import { useNotification } from '../../notification';
import { useObjectSelectedEvent } from '../engine';
import { useRoom } from '../useRoom';

const useChatInputWidgetState = () =>
{
    const [ selectedUsername, setSelectedUsername ] = useState('');
    const [ isTyping, setIsTyping ] = useState<boolean>(false);
    const [ typingStartedSent, setTypingStartedSent ] = useState(false);
    const [ isIdle, setIsIdle ] = useState(false);
    const [ floodBlocked, setFloodBlocked ] = useState(false);
    const [ floodBlockedSeconds, setFloodBlockedSeconds ] = useState(0);
    const { showNitroAlert = null, showConfirm = null } = useNotification();
    const { roomSession = null } = useRoom();

    const sendChat = (text: string, chatType: number, recipientName: string = '', styleId: number = 0) =>
    {
        if(text === '') return null;

        const parts = text.split(' ');

        if(parts.length > 0)
        {
            const firstPart = parts[0];
            let secondPart = '';

            if(parts.length > 1) secondPart = parts[1];

            if((firstPart.charAt(0) === ':') && (secondPart === 'x'))
            {
                const selectedAvatarId = GetRoomEngine().selectedAvatarId;

                if(selectedAvatarId > -1)
                {
                    const userData = roomSession.userDataManager.getUserDataByIndex(selectedAvatarId);

                    if(userData)
                    {
                        secondPart = userData.name;
                        text = text.replace(' x', (' ' + userData.name));
                    }
                }
            }

            switch(firstPart.toLowerCase())
            {
                case ':shake':
                    RoomShakingEffect.init(2500, 5000);
                    RoomShakingEffect.turnVisualizationOn();
                    
                    return null;

                case ':rotate':
                    RoomRotatingEffect.init(2500, 5000);
                    RoomRotatingEffect.turnVisualizationOn();
                    
                    return null;
                case ':d':
                case ';d':
                    if(GetClubMemberLevel() === HabboClubLevelEnum.VIP)
                    {
                        roomSession.sendExpressionMessage(AvatarExpressionEnum.LAUGH.ordinal);
                    }

                    break;
                case 'o/':
                case '_o/':
                    roomSession.sendExpressionMessage(AvatarExpressionEnum.WAVE.ordinal);

                    return null;
                case ':kiss':
                    if(GetClubMemberLevel() === HabboClubLevelEnum.VIP)
                    {
                        roomSession.sendExpressionMessage(AvatarExpressionEnum.BLOW.ordinal);

                        return null;
                    }

                    break;
                case ':jump':
                    if(GetClubMemberLevel() === HabboClubLevelEnum.VIP)
                    {
                        roomSession.sendExpressionMessage(AvatarExpressionEnum.JUMP.ordinal);

                        return null;
                    }

                    break;
                case ':idle':
                    roomSession.sendExpressionMessage(AvatarExpressionEnum.IDLE.ordinal);

                    return null;
                case ':ct': {
                    // Toggle clickthrough: when on, clicking another user walks you to
                    // the tile behind them instead of opening their context menu.
                    ClickthroughState.enabled = !ClickthroughState.enabled;

                    const status = ClickthroughState.enabled ? 'enabled' : 'disabled';

                    GetRoomSessionManager().events.dispatchEvent(new RoomSessionChatEvent(RoomSessionChatEvent.CHAT_EVENT, roomSession, roomSession.ownRoomIndex, `Clickthrough ${ status }.`, RoomSessionChatEvent.CHAT_TYPE_WHISPER));

                    return null;
                }
                case ':t': {
                    // Select a target without locking. "x" has already been
                    // expanded to a real name upstream (the HUD target in
                    // ChatInputView, or the selected avatar above), so by here
                    // this is always a plain name.
                    const requestedName = text.trim().substring(firstPart.length).trim();

                    if(!requestedName)
                    {
                        GetRoomSessionManager().events.dispatchEvent(new RoomSessionChatEvent(RoomSessionChatEvent.CHAT_EVENT, roomSession, roomSession.ownRoomIndex, 'Usage: :t <name>.', RoomSessionChatEvent.CHAT_TYPE_WHISPER));

                        return null;
                    }

                    const result = TargetState.selectByName?.(requestedName) ?? null;
                    // Default/failure case. The lookup only sees the current
                    // room, so this also fires for someone online elsewhere in
                    // the hotel - distinguishing the two needs a server lookup.
                    let status = `${ requestedName } is not online.`;
                    let styleId = 0;

                    if(result?.status === 'selected')
                    {
                        status = `You are now targeting ${ result.name }.`;
                        styleId = 3;
                    }
                    else if(result?.status === 'locked')
                    {
                        status = `Unlock your target on ${ result.name } before switching targets.`;
                    }

                    GetRoomSessionManager().events.dispatchEvent(new RoomSessionChatEvent(RoomSessionChatEvent.CHAT_EVENT, roomSession, roomSession.ownRoomIndex, status, RoomSessionChatEvent.CHAT_TYPE_WHISPER, styleId));

                    return null;
                }
                case ':lt': {
                    const requestedName = text.trim().substring(firstPart.length).trim();

                    if(requestedName)
                    {
                        const targetName = TargetState.lockByName?.(requestedName) ?? null;
                        const status = targetName ? `You have locked target on ${ targetName }.` : `${ requestedName } is not online.`;
                        const styleId = targetName ? 3 : 0;

                        GetRoomSessionManager().events.dispatchEvent(new RoomSessionChatEvent(RoomSessionChatEvent.CHAT_EVENT, roomSession, roomSession.ownRoomIndex, status, RoomSessionChatEvent.CHAT_TYPE_WHISPER, styleId));

                        return null;
                    }

                    const lockState = TargetState.toggleLock?.() ?? null;
                    const status = (lockState === null) ? 'No target selected.' : `You have ${ lockState ? 'locked' : 'unlocked' } target on ${ TargetState.name }.`;
                    const styleId = (lockState === null) ? 0 : (lockState ? 3 : 6);

                    GetRoomSessionManager().events.dispatchEvent(new RoomSessionChatEvent(RoomSessionChatEvent.CHAT_EVENT, roomSession, roomSession.ownRoomIndex, status, RoomSessionChatEvent.CHAT_TYPE_WHISPER, styleId));

                    return null;
                }
                case ':ping': {
                    // Measure the real round-trip to the game server by timing an
                    // existing request/response over the same socket (InfoRetrieve ->
                    // UserObject), then show the result as an ephemeral whisper bubble
                    // over the player. Nothing is sent as chat or persisted
                    // server-side - the bubble is generated locally.
                    const startTime = performance.now();
                    const communication = GetCommunication();

                    const pingEvent = new UserInfoEvent(() =>
                    {
                        const ping = Math.round(performance.now() - startTime);

                        communication.removeMessageEvent(pingEvent);

                        GetRoomSessionManager().events.dispatchEvent(new RoomSessionChatEvent(RoomSessionChatEvent.CHAT_EVENT, roomSession, roomSession.ownRoomIndex, `Pong! Your ping is ${ ping } ms.`, RoomSessionChatEvent.CHAT_TYPE_WHISPER));
                    });

                    communication.registerMessageEvent(pingEvent);

                    // Clean up the one-shot listener if the server never answers.
                    setTimeout(() => communication.removeMessageEvent(pingEvent), 5000);

                    SendMessageComposer(new InfoRetrieveMessageComposer());

                    return null;
                }
                case '_b':
                    roomSession.sendExpressionMessage(AvatarExpressionEnum.RESPECT.ordinal);

                    return null;
                case ':sign':
                    roomSession.sendSignMessage(parseInt(secondPart));

                    return null;
                case ':iddqd':
                case ':flip':
                    GetRoomEngine().events.dispatchEvent(new RoomZoomEvent(roomSession.roomId, -1, true));

                    return null;
                case ':zoom':
                    GetRoomEngine().events.dispatchEvent(new RoomZoomEvent(roomSession.roomId, parseFloat(secondPart), false));

                    return null;
                case ':screenshot':
                    const texture = GetRoomEngine().createTextureFromRoom(roomSession.roomId, 1);

                    const image = new Image();
                    
                    image.src = TextureUtils.generateImageUrl(texture);
                    
                    const newWindow = window.open('');
                    newWindow.document.write(image.outerHTML);
                    return null;
                case ':pickall':
                    if(roomSession.isRoomOwner || GetSessionDataManager().isModerator)
                    {
                        showConfirm(LocalizeText('room.confirm.pick_all'), () =>
                        {
                            GetSessionDataManager().sendSpecialCommandMessage(':pickall');
                        },
                        null, null, null, LocalizeText('generic.alert.title'));
                    }

                    return null;
                case ':ejectall':
                    if (roomSession.isRoomOwner || GetSessionDataManager().isModerator || roomSession.controllerLevel >= RoomControllerLevel.GUEST)
                    {
                        showConfirm(LocalizeText('room.confirm.eject_all'), () => 
                        {
                            GetSessionDataManager().sendSpecialCommandMessage(':ejectall');
                        },
                        null, null, null, LocalizeText('generic.alert.title'));
                    }
                    return null;
                case ':furni':
                    CreateLinkEvent('furni-chooser/');
                    return null;
                case ':chooser':
                    CreateLinkEvent('user-chooser/');
                    return null;
                case ':floor':
                case ':bcfloor':
                    if(roomSession.controllerLevel >= RoomControllerLevel.ROOM_OWNER) CreateLinkEvent('floor-editor/show');
                    
                    return null;
                case ':togglefps': {
                    // Toggle uncapped (0) <-> the configured cap. The old code
                    // read a nonexistent key, which Pixi clamped to minFPS and
                    // silently locked the client to 10 FPS.
                    if(GetTicker().maxFPS > 0) GetTicker().maxFPS = 0;
                    else GetTicker().maxFPS = (GetConfiguration<number>('system.fps.max') || 60);

                    return null;
                }
                case ':client':
                case ':nitro':
                case ':billsonnn':
                    showNitroAlert();
                    return null;
                case ':settings':
                    if(roomSession.isRoomOwner || GetSessionDataManager().isModerator)
                    {
                        SendMessageComposer(new RoomSettingsComposer(roomSession.roomId));
                    }

                    return null;
            }
        }

        switch(chatType)
        {
            case ChatMessageTypeEnum.CHAT_DEFAULT:
                roomSession.sendChatMessage(text, styleId);
                break;
            case ChatMessageTypeEnum.CHAT_SHOUT:
                roomSession.sendShoutMessage(text, styleId);
                break;
            case ChatMessageTypeEnum.CHAT_WHISPER:
                roomSession.sendWhisperMessage(recipientName, text, styleId);
                break;
        }
    }

    useRoomSessionManagerEvent<RoomSessionChatEvent>(RoomSessionChatEvent.FLOOD_EVENT, event =>
    {
        setFloodBlocked(true);
        setFloodBlockedSeconds(parseFloat(event.message));
    });

    useObjectSelectedEvent(event =>
    {
        if(event.category !== RoomObjectCategory.UNIT) return;

        const userData = roomSession.userDataManager.getUserDataByIndex(event.id);

        if(!userData) return;

        setSelectedUsername(userData.name);
    });

    useRoomEngineEvent<RoomEngineObjectEvent>(RoomEngineObjectEvent.DESELECTED, event => setSelectedUsername(''));

    useEffect(() =>
    {
        if(!floodBlocked) return;

        let seconds = 0;

        const interval = setInterval(() =>
        {
            setFloodBlockedSeconds(prevValue =>
            {
                seconds = ((prevValue || 0) - 1);

                return seconds;
            });

            if(seconds < 0)
            {
                clearInterval(interval);

                setFloodBlocked(false);
            }
        }, 1000);

        return () => clearInterval(interval);
    }, [ floodBlocked ]);

    useEffect(() =>
    {
        if(!isIdle) return;

        let timeout: ReturnType<typeof setTimeout> = null;

        if(isIdle)
        {
            timeout = setTimeout(() =>
            {
                setIsIdle(false);
                setIsTyping(false)
            }, 10000);
        }

        return () => clearTimeout(timeout);
    }, [ isIdle ]);

    useEffect(() =>
    {
        if(isTyping)
        {
            if(!typingStartedSent)
            {
                setTypingStartedSent(true);

                roomSession.sendChatTypingMessage(isTyping);
            }
        }
        else
        {
            if(typingStartedSent)
            {
                setTypingStartedSent(false);

                roomSession.sendChatTypingMessage(isTyping);
            }
        }
    }, [ roomSession, isTyping, typingStartedSent ]);

    return { selectedUsername, floodBlocked, floodBlockedSeconds, setIsTyping, setIsIdle, sendChat };
}

export const useChatInputWidget = useChatInputWidgetState;
