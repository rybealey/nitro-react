import { AvatarFigurePartType, AvatarScaleType, AvatarSetType, GetGuestRoomResultEvent, NitroPoint, PetFigureData, RoomChatSettings, RoomChatSettingsEvent, RoomDragEvent, RoomObjectCategory, RoomObjectType, RoomObjectVariable, RoomSessionChatEvent, RoomUserData, SystemChatStyleEnum, TextureUtils, Vector3d } from '@nitrots/nitro-renderer';
import { useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { ChatBubbleMessage, ChatEntryType, ChatHistoryCurrentDate, GetAvatarRenderManager, GetConfiguration, GetRoomEngine, GetRoomObjectScreenLocation, IRoomChatSettings, LocalizeText, PlayMentionSound, PlaySound, RoomChatFormatter } from '../../../api';
import { useMessageEvent, useRoomEngineEvent, useRoomSessionManagerEvent } from '../../events';
import { IsMentionOfMe } from '../../../api/rp-chat/Mention';
import { IsGangAlert } from '../../../api/rp-chat/GangAlert';
import { IsCorpAlert } from '../../../api/rp-chat/CorpAlert';
import { IsStaffAlert } from '../../../api/rp-chat/StaffAlert';
import { IsNarratedBubble } from '../../../api/rp-chat/NarratedBubble';
import { ReadTextureImageAsync } from '../../../api/utils/ReadTextureImageAsync';
import { GetOwnChatPreview, LearnOwnChatBubble, LooksLikeFilteredLine, NormalizeOwnChatLine, OWN_CHAT_PREVIEW_TIMEOUT_MS, TakeUnpreviewedLine } from '../../../api/rp-chat/OwnChatPreview';
import { useRoom } from '../useRoom';
import { ChatHistoryWriters } from './../../chat-history';

const avatarColorCache: Map<string, number> = new Map();
const avatarImageCache: Map<string, string> = new Map();
const petImageCache: Map<string, string> = new Map();

// pixelrp: these keep a head picture per outfit for the whole session, and
// every shift uniform and change of clothes is a new outfit - so they are
// capped, the oldest dropped first (a Map keeps insertion order). The colour
// and head caches are always set together, so they drop the same outfits.
const FIGURE_CACHE_LIMIT = 300;

// pixelrp: chat heads made ahead (see useChatWidgetState): one every this many
// ms, and an outfit whose clothes will not load is given up after this many.
const HEAD_AHEAD_EVERY_MS = 400;
const HEAD_AHEAD_TRIES = 3;

// pixelrp: the most bubbles kept on screen; past it the oldest - the highest
// up - goes. A busy room otherwise piled up bubbles for minutes.
const CHAT_BUBBLE_LIMIT = 50;

const setCapped = <T, >(cache: Map<string, T>, key: string, value: T) =>
{
    cache.delete(key);
    cache.set(key, value);

    while(cache.size > FIGURE_CACHE_LIMIT) cache.delete(cache.keys().next().value);
}

// pixelrp: one of your own lines on screen ahead of the server's copy
// (OwnChatPreview), oldest first.
interface WaitingPreview
{
    bubble: ChatBubbleMessage;
    chatType: number;
    text: string;
    chosenStyle: number;
    timer: ReturnType<typeof setTimeout>;
    /** Answered word for word, not as a word-filtered line. */
    exact?: boolean;
}

const useChatWidgetState = () =>
{
    const [ chatMessages, setChatMessages ] = useState<ChatBubbleMessage[]>([]);
    const [ chatSettings, setChatSettings ] = useState<IRoomChatSettings>({
        mode: RoomChatSettings.CHAT_MODE_FREE_FLOW,
        weight: RoomChatSettings.CHAT_BUBBLE_WIDTH_NORMAL,
        speed: RoomChatSettings.CHAT_SCROLL_SPEED_NORMAL,
        distance: 50,
        protection: RoomChatSettings.FLOOD_FILTER_NORMAL
    });
    const { roomSession = null } = useRoom();
    // pixelrp: written to, not subscribed to - see ChatHistoryWriters
    const { addChatEntry, addMention, addGangEntry, addCorpEntry, addStaffEntry } = ChatHistoryWriters;
    const isDisposed = useRef(false);
    const waitingPreviews = useRef<WaitingPreview[]>([]);

    const dropPreview = (preview: WaitingPreview) =>
    {
        clearTimeout(preview.timer);

        setChatMessages(prevValue => prevValue.filter(chat => (chat.id !== preview.bubble.id)));
    }

    // The preview a line of your own from the server answers, if any. The
    // server answers in the order lines were sent, so a preview sent before
    // the one matched that is still waiting never will be answered - a
    // mute, flood control, a wired trigger that kept it - and goes.
    const takePreview = (event: RoomSessionChatEvent): WaitingPreview =>
    {
        const waiting = waitingPreviews.current;
        const line = NormalizeOwnChatLine(event.message);

        // a line sent with no preview (":D", a macro's), or nothing at all
        if(!line.trim().length || TakeUnpreviewedLine(line)) return null;

        let index = waiting.findIndex(preview => ((preview.chatType === event.chatType) && (preview.text === line)));
        const exact = (index >= 0);

        if(index > 0)
        {
            waiting.splice(0, index).forEach(dropPreview);

            index = 0;
        }

        // Not word for word: a line the word filter changed. Never a line the
        // server narrates for you ("*swings at ...*") - those are its own.
        if((index < 0) && !IsNarratedBubble(event.style, line)) index = waiting.findIndex(preview => ((preview.chatType === event.chatType) && LooksLikeFilteredLine(preview.text, line)));

        if(index < 0) return null;

        const [ preview ] = waiting.splice(index, 1);

        clearTimeout(preview.timer);

        preview.exact = exact;

        return preview;
    }

    const getScrollSpeed = useMemo(() =>
    {
        if(!chatSettings) return 6000;

        switch(chatSettings.speed)
        {
            case RoomChatSettings.CHAT_SCROLL_SPEED_FAST:
                return 3000;
            case RoomChatSettings.CHAT_SCROLL_SPEED_NORMAL:
                return 6000;
            case RoomChatSettings.CHAT_SCROLL_SPEED_SLOW:
                return 12000;
        }
    }, [ chatSettings ]);

    const setFigureImage = (figure: string) =>
    {
        const avatarImage = GetAvatarRenderManager().createAvatarImage(figure, AvatarScaleType.LARGE, null, {
            resetFigure: figure => 
            {
                if(isDisposed.current) return;

                setFigureImage(figure);
            },
            dispose: () => 
            {},
            disposed: false
        });

        if(!avatarImage) return;

        const image = avatarImage.getCroppedImage(AvatarSetType.HEAD);
        const color = avatarImage.getPartColor(AvatarFigurePartType.CHEST);

        setCapped(avatarColorCache, figure, ((color && color.rgb) || 16777215));

        avatarImage.dispose();

        setCapped(avatarImageCache, figure, image.src);

        return image.src;
    }

    const getUserImage = (figure: string) =>
    {
        let existing = avatarImageCache.get(figure);

        if(!existing) existing = setFigureImage(figure);

        return existing;
    }

    // pixelrp: chat heads made ahead (Twist, 2026-10-26). Made in the message,
    // a head is cropped and read back from the graphics card on the spot, and
    // the browser first waits for everything queued there - the lag recorder
    // caught somebody's first line costing about 50 ms. While in a room, the
    // head of each player here who has none yet is made in the background, one
    // at a time, and read back without that wait (ReadTextureImageAsync), so a
    // first line finds it ready. One not ready yet is made in the message, as
    // before; an outfit whose clothes have not loaded is tried again later.
    useEffect(() =>
    {
        if(!roomSession) return;

        const tries = new Map<string, number>();

        let stopped = false;
        let busy = false;

        const nextFigure = (): string =>
        {
            for(const object of (GetRoomEngine().getRoomObjects(roomSession.roomId, RoomObjectCategory.UNIT) || []))
            {
                const userData = roomSession.userDataManager.getUserDataByIndex(object.id);

                if(!userData || (userData.type !== RoomObjectType.USER) || !userData.figure) continue;

                if(avatarImageCache.has(userData.figure) || ((tries.get(userData.figure) ?? 0) >= HEAD_AHEAD_TRIES)) continue;

                return userData.figure;
            }

            return null;
        };

        const makeHead = async (figure: string) =>
        {
            tries.set(figure, ((tries.get(figure) ?? 0) + 1));

            const avatarImage = GetAvatarRenderManager().createAvatarImage(figure, AvatarScaleType.LARGE, null, null);

            if(!avatarImage) return;

            if(avatarImage.isPlaceholder())
            {
                avatarImage.dispose();

                return;
            }

            const texture = avatarImage.getCroppedTexture(AvatarSetType.HEAD);
            const color = avatarImage.getPartColor(AvatarFigurePartType.CHEST);

            avatarImage.dispose();

            if(!texture) return;

            try
            {
                const url = await ReadTextureImageAsync(texture);

                // the message got there first, or the room has gone
                if(!url || stopped || avatarImageCache.has(figure)) return;

                setCapped(avatarColorCache, figure, ((color && color.rgb) || 16777215));
                setCapped(avatarImageCache, figure, url);
            }
            finally
            {
                texture.destroy(true);
            }
        };

        const timer = window.setInterval(() =>
        {
            if(busy || stopped || document.hidden) return;

            const figure = nextFigure();

            if(!figure) return;

            busy = true;

            makeHead(figure).catch(() => null).finally(() => (busy = false));
        }, HEAD_AHEAD_EVERY_MS);

        return () =>
        {
            stopped = true;

            window.clearInterval(timer);
        };
    }, [ roomSession ]);

    const getPetImage = (figure: string, direction: number, _arg_3: boolean, scale: number = 64, posture: string = null) =>
    {
        let existing = petImageCache.get((figure + posture));

        if(existing) return existing;

        const figureData = new PetFigureData(figure);
        const typeId = figureData.typeId;
        const image = GetRoomEngine().getRoomObjectPetImage(typeId, figureData.paletteId, figureData.color, new Vector3d((direction * 45)), scale, null, false, 0, figureData.customParts, posture);

        if(image)
        {
            existing = TextureUtils.generateImageUrl(image.data);

            // pixelrp: a fresh render made for this picture - free it once read.
            if(image.data) image.data.destroy(true);

            setCapped(petImageCache, (figure + posture), existing);
        }

        return existing;
    }

    useRoomSessionManagerEvent<RoomSessionChatEvent>(RoomSessionChatEvent.CHAT_EVENT, event =>
    {
        const roomObject = GetRoomEngine().getRoomObject(roomSession.roomId, event.objectId, RoomObjectCategory.UNIT);
        const bubbleLocation = roomObject ? GetRoomObjectScreenLocation(roomSession.roomId, roomObject?.id, RoomObjectCategory.UNIT) : new NitroPoint();
        const userData = roomObject ? roomSession.userDataManager.getUserDataByIndex(event.objectId) : new RoomUserData(-1);

        let username = '';
        let avatarColor = 0;
        let imageUrl: string = null;
        let chatType = event.chatType;
        let styleId = event.style;
        let userType = 0;
        let petType = -1;
        let text = event.message;

        if(userData)
        {
            userType = userData.type;

            const figure = userData.figure;

            switch(userType)
            {
                case RoomObjectType.PET:
                    imageUrl = getPetImage(figure, 2, true, 64, roomObject.model.getValue<string>(RoomObjectVariable.FIGURE_POSTURE));
                    petType = new PetFigureData(figure).typeId;
                    break;
                case RoomObjectType.USER:
                    imageUrl = getUserImage(figure);
                    break;
                case RoomObjectType.RENTABLE_BOT:
                case RoomObjectType.BOT:
                    styleId = SystemChatStyleEnum.BOT;
                    break;
            }

            avatarColor = avatarColorCache.get(figure);
            username = userData.name;
        }

        // Target mention (pixelrp): the server delivers a message that @mentions
        // you with bubble style 25 - play the alert so being addressed is
        // unmissable, and remember the line for the Mentions tab. The rule lives
        // in IsMentionOfMe so the sound and the tab cannot drift apart.
        //
        // Read before the switch below, which rewrites `text` for respect and
        // pet lines - by then it is no longer what the player typed.
        const isMention = (!!userData && IsMentionOfMe(styleId, text, userData.webID));

        if(isMention) PlayMentionSound();

        switch(chatType)
        {
            case RoomSessionChatEvent.CHAT_TYPE_RESPECT:
                text = LocalizeText('widgets.chatbubble.respect', [ 'username' ], [ username ]);

                if(GetConfiguration('respect.options')['enabled']) PlaySound(GetConfiguration('respect.options')['sound']);

                break;
            case RoomSessionChatEvent.CHAT_TYPE_PETREVIVE:
            case RoomSessionChatEvent.CHAT_TYPE_PET_REBREED_FERTILIZE:
            case RoomSessionChatEvent.CHAT_TYPE_PET_SPEED_FERTILIZE: {
                let textKey = 'widget.chatbubble.petrevived';

                if(chatType === RoomSessionChatEvent.CHAT_TYPE_PET_REBREED_FERTILIZE)
                {
                    textKey = 'widget.chatbubble.petrefertilized;';
                }

                else if(chatType === RoomSessionChatEvent.CHAT_TYPE_PET_SPEED_FERTILIZE)
                {
                    textKey = 'widget.chatbubble.petspeedfertilized';
                }

                let targetUserName: string = null;

                const newRoomObject = GetRoomEngine().getRoomObject(roomSession.roomId, event.extraParam, RoomObjectCategory.UNIT);

                if(newRoomObject)
                {
                    const newUserData = roomSession.userDataManager.getUserDataByIndex(roomObject.id);

                    if(newUserData) targetUserName = newUserData.name;
                }

                text = LocalizeText(textKey, [ 'petName', 'userName' ], [ username, targetUserName ]);
                break;
            }
            case RoomSessionChatEvent.CHAT_TYPE_PETRESPECT:
                text = LocalizeText('widget.chatbubble.petrespect', [ 'petname' ], [ username ]);
                break;
            case RoomSessionChatEvent.CHAT_TYPE_PETTREAT:
                text = LocalizeText('widget.chatbubble.pettreat', [ 'petname' ], [ username ]);
                break;
            case RoomSessionChatEvent.CHAT_TYPE_HAND_ITEM_RECEIVED:
                text = LocalizeText('widget.chatbubble.handitem', [ 'username', 'handitem' ], [ username, LocalizeText(('handitem' + event.extraParam)) ]);
                break;
            case RoomSessionChatEvent.CHAT_TYPE_MUTE_REMAINING: {
                const hours = ((event.extraParam > 0) ? Math.floor((event.extraParam / 3600)) : 0).toString();
                const minutes = ((event.extraParam > 0) ? Math.floor((event.extraParam % 3600) / 60) : 0).toString();
                const seconds = (event.extraParam % 60).toString();

                text = LocalizeText('widget.chatbubble.mutetime', [ 'hours', 'minutes', 'seconds' ], [ hours, minutes, seconds ]);
                break;
            }
        }

        // pixelrp: a bot may bold a word by wrapping it in **, as the jury
        // trial's judge does the verdict (Twist, 2026-10-20). Bots only - a
        // player's ** stays as typed. The text is HTML-encoded by now, so
        // only the tag added here is markup.
        const isBot = ((userData.type === RoomObjectType.BOT) || (userData.type === RoomObjectType.RENTABLE_BOT));
        const formattedText = isBot ? RoomChatFormatter(text).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>') : RoomChatFormatter(text);
        const color = (avatarColor && (('#' + (avatarColor.toString(16).padStart(6, '0'))) || null));
        // pixelrp: the sender's chosen username color rides the chat packet.
        // '' / '#000000' both mean default — normalize to null so no override.
        const usernameColor = (event.usernameColor && (event.usernameColor !== '#000000')) ? event.usernameColor : null;
        // pixelrp: the sender's chosen icon + icon color also ride the packet.
        // '' icon = none (no prefix); '' / '#000000' icon color = default.
        const usernameIcon = (event.icon && event.icon.length) ? event.icon : null;
        const usernameIconColor = (event.iconColor && (event.iconColor !== '#000000')) ? event.iconColor : null;

        const chatMessage = new ChatBubbleMessage(
            userData.roomIndex,
            RoomObjectCategory.UNIT,
            roomSession.roomId,
            text,
            formattedText,
            username,
            new NitroPoint(bubbleLocation.x, bubbleLocation.y),
            chatType,
            styleId,
            imageUrl,
            color,
            usernameColor,
            usernameIcon,
            usernameIconColor);

        // pixelrp: your own line, up the moment it was sent (OwnChatPreview).
        // It waits for the server's copy, and only that copy goes in the chat
        // history - a line the server kept never shows there.
        const ownPreview = GetOwnChatPreview(event);

        if(ownPreview)
        {
            const preview: WaitingPreview = { bubble: chatMessage, chatType, text, chosenStyle: ownPreview.chosenStyle, timer: null };

            preview.timer = setTimeout(() =>
            {
                waitingPreviews.current = waitingPreviews.current.filter(waiting => (waiting !== preview));

                dropPreview(preview);
            }, OWN_CHAT_PREVIEW_TIMEOUT_MS);

            waitingPreviews.current.push(preview);

            setChatMessages(prevValue => [ ...prevValue.slice(-(CHAT_BUBBLE_LIMIT - 1)), chatMessage ]);

            return;
        }

        const answered = ((event.objectId === roomSession.ownRoomIndex) && waitingPreviews.current.length) ? takePreview(event) : null;

        if(answered)
        {
            // learnt only from a line that is surely the one previewed
            if(answered.exact) LearnOwnChatBubble(answered.chosenStyle, styleId);

            const previewed = answered.bubble;
            const unchanged = ((answered.text === NormalizeOwnChatLine(text)) && (previewed.styleId === chatMessage.styleId) && (previewed.usernameColor === chatMessage.usernameColor) && (previewed.usernameIcon === chatMessage.usernameIcon) && (previewed.usernameIconColor === chatMessage.usernameIconColor));

            // Put right where it stands: the same bubble (its id), kept in its
            // place and size until ChatWidgetMessageView measures it again.
            if(!unchanged) setChatMessages(prevValue =>
            {
                const index = prevValue.findIndex(chat => (chat.id === previewed.id));

                if(index < 0) return prevValue;

                const current = prevValue[index];

                chatMessage.id = current.id;
                chatMessage.width = current.width;
                chatMessage.height = current.height;
                chatMessage.takePlaceOf(current);
                chatMessage.left = current.left;
                chatMessage.top = current.top;

                const next = [ ...prevValue ];

                next[index] = chatMessage;

                return next;
            });
        }
        else
        {
            // pixelrp: drawn now, in the message that brought it. Left to
            // React, a line from the server (a fight line, someone else's
            // chat) was drawn in a turn of its own after the message, and the
            // game's next frame usually went out first - the bubble a frame
            // late, more while the room is busy drawing.
            flushSync(() => setChatMessages(prevValue => [ ...prevValue.slice(-(CHAT_BUBBLE_LIMIT - 1)), chatMessage ]));
        }

        const entry = { id: -1, webId: userData.webID, entityId: userData.roomIndex, name: username, imageUrl, style: styleId, chatType: chatType, entityType: userData.type, message: formattedText, text, timestamp: ChatHistoryCurrentDate(), type: ChatEntryType.TYPE_CHAT, roomId: roomSession.roomId, color, usernameColor, usernameIcon, usernameIconColor };

        addChatEntry(entry);

        // a copy, because each list stamps the row with an id from its own counter
        if(isMention) addMention({ ...entry });

        // The bubble is the whole test here - nobody but the server can send
        // it. See api/rp-chat/GangAlert.ts.
        if(IsGangAlert(styleId)) addGangEntry({ ...entry });

        // Bubble, whisper and speaker together - see api/rp-chat/CorpAlert.ts.
        if(IsCorpAlert(styleId, chatType, username, text)) addCorpEntry({ ...entry });

        // Bubble, whisper and speaker together, like corp - see api/rp-chat/StaffAlert.ts.
        if(IsStaffAlert(styleId, chatType, username, text)) addStaffEntry({ ...entry });
    });

    // pixelrp: flood control refused the line that set it off and every line
    // after it, so no preview still waiting will be answered.
    useRoomSessionManagerEvent<RoomSessionChatEvent>(RoomSessionChatEvent.FLOOD_EVENT, () =>
    {
        const waiting = waitingPreviews.current;

        waitingPreviews.current = [];

        waiting.forEach(dropPreview);
    });

    // pixelrp: a new room answers nothing sent in the last one.
    useEffect(() =>
    {
        return () =>
        {
            waitingPreviews.current.forEach(preview => clearTimeout(preview.timer));

            waitingPreviews.current = [];
        }
    }, [ roomSession ]);

    useRoomEngineEvent<RoomDragEvent>(RoomDragEvent.ROOM_DRAG, event =>
    {
        if(!chatMessages.length || (event.roomId !== roomSession.roomId)) return;

        const offsetX = event.offsetX;

        chatMessages.forEach(chat => (chat.elementRef && (chat.left += offsetX)));
    });

    useMessageEvent<GetGuestRoomResultEvent>(GetGuestRoomResultEvent, event =>
    {
        const parser = event.getParser();

        if(!parser.roomEnter) return;
        
        setChatSettings(parser.chat);
    });

    useMessageEvent<RoomChatSettingsEvent>(RoomChatSettingsEvent, event =>
    {
        const parser = event.getParser();
        
        setChatSettings(parser.chat);
    });

    useEffect(() =>
    {
        isDisposed.current = false;

        return () =>
        {
            isDisposed.current = true;
        }
    }, []);

    return { chatMessages, setChatMessages, chatSettings, getScrollSpeed };
}

export const useChatWidget = useChatWidgetState;
