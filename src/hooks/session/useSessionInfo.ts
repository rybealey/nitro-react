import { FigureUpdateEvent, RoomUnitChatStyleComposer, UserInfoDataParser, UserInfoEvent, UserSettingsEvent } from '@nitrots/nitro-renderer';
import { useEffect, useState } from 'react';
import { useBetween } from 'use-between';
import { GetSessionDataManager, OwnMotto, SendMessageComposer } from '../../api';
import { useMessageEvent } from '../events';
import { useLocalStorage } from '../useLocalStorage';

const useSessionInfoState = () =>
{
    const [ userInfo, setUserInfo ] = useState<UserInfoDataParser>(null);
    const [ userFigure, setUserFigure ] = useState<string>(null);
    const [ chatStyleId, setChatStyleId ] = useState<number>(0);
    const [ userRespectRemaining, setUserRespectRemaining ] = useState<number>(0);
    const [ petRespectRemaining, setPetRespectRemaining ] = useState<number>(0);
    const [ screenSize, setScreenSize ] = useLocalStorage('nitro.screensize', { width: window.innerWidth, height: window.innerHeight });

    const updateChatStyleId = (styleId: number) =>
    {
        setChatStyleId(styleId);

        SendMessageComposer(new RoomUnitChatStyleComposer(styleId));
    }

    const respectUser = (userId: number) =>
    {
        GetSessionDataManager().giveRespect(userId);

        setUserRespectRemaining(GetSessionDataManager().respectsLeft);
    }

    const respectPet = (petId: number) =>
    {
        GetSessionDataManager().givePetRespect(petId);

        setPetRespectRemaining(GetSessionDataManager().respectsPetLeft);
    }

    useMessageEvent<UserInfoEvent>(UserInfoEvent, event =>
    {
        const parser = event.getParser();

        setUserInfo(parser.userInfo);
        setUserFigure(parser.userInfo.figure);
        // SessionDataManager never keeps the motto - cache it for the RP
        // profile (own-profile path).
        OwnMotto.value = (parser.userInfo.motto ?? '');
        setUserRespectRemaining(parser.userInfo.respectsRemaining);
        setPetRespectRemaining(parser.userInfo.respectsPetRemaining);
    });
    
    useMessageEvent<FigureUpdateEvent>(FigureUpdateEvent, event =>
    {
        const parser = event.getParser();

        setUserFigure(parser.figure);
    });

    useMessageEvent<UserSettingsEvent>(UserSettingsEvent, event =>
    {
        const parser = event.getParser();

        setChatStyleId(parser.chatType);
    });

    useEffect(() =>
    {
        // pixelrp: window positions are kept on the account now, so the check
        // that drops them on a new screen size runs when the account's copy
        // arrives (AccountPrefs.checkScreen), not against this browser here.
        const onResize = (event: UIEvent) => setScreenSize({ width: window.innerWidth, height: window.innerHeight });

        window.addEventListener('resize', onResize);

        return () =>
        {
            window.removeEventListener('resize', onResize);
        }
    }, [ setScreenSize ]);

    return { userInfo, userFigure, chatStyleId, userRespectRemaining, petRespectRemaining, respectUser, respectPet, updateChatStyleId };
}

export const useSessionInfo = () => useBetween(useSessionInfoState);
