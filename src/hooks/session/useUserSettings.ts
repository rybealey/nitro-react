import { NitroSettingsEvent, UserSettingsCameraFollowComposer, UserSettingsEvent, UserSettingsOldChatComposer, UserSettingsRoomInvitesComposer, UserSettingsSoundComposer } from '@nitrots/nitro-renderer';
import { useEffect, useState } from 'react';
import { useBetween } from 'use-between';
import { DispatchMainEvent, DispatchUiEvent, SendMessageComposer } from '../../api';
import { useMessageEvent } from '../events';

// PixelRP: the server-kept user settings (chat style, room invites, camera
// follow, the three volumes) as ONE shared state, so the top-right cog's
// window and Settings > General show and change the same values - two copies
// would drift the moment either was used.
export type UserSettingsVolume = 'system' | 'furni' | 'trax';

const clampVolume = (value: number) => Math.min(100, Math.max(0, (Number.isFinite(value) ? value : 0)));

const useUserSettingsState = () =>
{
    const [ userSettings, setUserSettings ] = useState<NitroSettingsEvent>(null);

    // Every change goes to the renderer too: the volumes and chat style take
    // effect from the NitroSettingsEvent, not from the server's echo.
    const apply = (next: NitroSettingsEvent) =>
    {
        setUserSettings(next);
        DispatchMainEvent(next);
    }

    const setOldChat = (value: boolean) =>
    {
        if(!userSettings) return;

        const clone = userSettings.clone();

        clone.oldChat = value;
        SendMessageComposer(new UserSettingsOldChatComposer(value));
        apply(clone);
    }

    const setRoomInvites = (value: boolean) =>
    {
        if(!userSettings) return;

        const clone = userSettings.clone();

        clone.roomInvites = value;
        SendMessageComposer(new UserSettingsRoomInvitesComposer(value));
        apply(clone);
    }

    const setCameraFollow = (value: boolean) =>
    {
        if(!userSettings) return;

        const clone = userSettings.clone();

        clone.cameraFollow = value;
        SendMessageComposer(new UserSettingsCameraFollowComposer(value));
        apply(clone);
    }

    // Moves the slider live; saveVolumes sends it when the drag is let go.
    const setVolume = (kind: UserSettingsVolume, value: number) =>
    {
        if(!userSettings) return;

        const clone = userSettings.clone();

        if(kind === 'system') clone.volumeSystem = clampVolume(value);
        if(kind === 'furni') clone.volumeFurni = clampVolume(value);
        if(kind === 'trax') clone.volumeTrax = clampVolume(value);

        apply(clone);
    }

    const saveVolumes = () =>
    {
        if(!userSettings) return;

        SendMessageComposer(new UserSettingsSoundComposer(Math.round(userSettings.volumeSystem), Math.round(userSettings.volumeFurni), Math.round(userSettings.volumeTrax)));
    }

    useMessageEvent<UserSettingsEvent>(UserSettingsEvent, event =>
    {
        const parser = event.getParser();
        const settingsEvent = new NitroSettingsEvent();

        settingsEvent.volumeSystem = parser.volumeSystem;
        settingsEvent.volumeFurni = parser.volumeFurni;
        settingsEvent.volumeTrax = parser.volumeTrax;
        settingsEvent.oldChat = parser.oldChat;
        settingsEvent.roomInvites = parser.roomInvites;
        settingsEvent.cameraFollow = parser.cameraFollow;
        settingsEvent.flags = parser.flags;
        settingsEvent.chatType = parser.chatType;

        apply(settingsEvent);
    });

    useEffect(() =>
    {
        if(!userSettings) return;

        DispatchUiEvent(userSettings);
    }, [ userSettings ]);

    return { userSettings, setOldChat, setRoomInvites, setCameraFollow, setVolume, saveVolumes };
}

export const useUserSettings = () => useBetween(useUserSettingsState);
