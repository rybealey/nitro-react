import { FlatControllerAddedEvent, FlatControllerRemovedEvent, FlatControllersEvent, GetCustomRoomFilterMessageComposer, GetModeratorRoomInfoMessageComposer, ModerateRoomMessageComposer, ModeratorActionMessageComposer, ModeratorRoomInfoEvent, RemoveAllRightsMessageComposer, RoomChatSettings, RoomDataParser, RoomDeleteComposer, RoomMuteComposer, RoomSettingsComposer, RoomSettingsDataEvent, RoomTakeRightsComposer, RoomUsersWithRightsComposer, RpRoomCorpEvent, RpRoomZoneEvent, SaveRoomSettingsComposer } from '@nitrots/nitro-renderer';
import { FC, useEffect, useState } from 'react';
import { CreateLinkEvent, DispatchUiEvent, GetMaxVisitorsList, IRoomData, LocalizeText, SendMessageComposer } from '../../../../api';
import { ROOM_ZONE_SAFE, ROOM_ZONE_UNSAFE, RpRoomTurfEvent, RpRoomZoneTypeSaveComposer } from '../../../../api/rp-turf/RpTurfMessages';
import { DraggableWindowPosition, LayoutRoomThumbnailView, NitroCardContentView, NitroCardHeaderView, NitroCardTabsItemView, NitroCardTabsView, NitroCardView } from '../../../../common';
import { RoomWidgetThumbnailEvent } from '../../../../events';
import { useMessageEvent, useNavigator, useNotification, useRoom } from '../../../../hooks';
import { RoleplayAuthorizationsView } from './RoleplayAuthorizationsView';
import { RoleplayEmergenciesView } from './RoleplayEmergenciesView';
import { RoleplayHeadquartersView } from './RoleplayHeadquartersView';
import { RoomCorpState } from './RoomCorpState';

// The Room tool (Mod Tools canvas): one window for a room, its moderation and
// its settings. Room settings are staff-only - the old Room settings window is
// gone, and :roomsettings opens this. Tabs across the top: Overview (the room and its
// settings), Roleplay (zone, headquarters, emergencies, authorizations),
// Moderation (caution the room) and Rights.
//
// Settings save the moment they change. The server only answers a settings
// request from staff (Room.CanManageSettings - on duty or off; owning the room
// is not enough), so a request that gets no answer means no access, and the
// settings tabs say so.
//
// A few things only work on the room the moderator is standing in, because
// the server acts on the current room: the room picture, the floor plan, the
// room link, the zone type, muting everyone, and taking away rights - one
// player's or everyone's.
// Those appear only when the tool is showing the current room.

const TABS = [ 'Overview', 'Roleplay', 'Moderation', 'Rights' ];
const SETTINGS_TIMEOUT_MS = 3000;
const ROOM_NAME_MIN_LENGTH = 3;
const ROOM_NAME_MAX_LENGTH = 60;
const DESC_MAX_LENGTH = 255;

interface ModToolsRoomViewProps
{
    roomId: number;
    onCloseClick: () => void;
}

const ModSwitch: FC<{ on: boolean, label: string, onToggle: () => void }> = ({ on, label, onToggle }) =>
{
    return (
        <button type="button" role="switch" aria-checked={ on } aria-label={ label } className={ `mt-switch${ on ? ' is-on' : '' }` } onClick={ onToggle }>
            <span />
        </button>
    );
}

export const ModToolsRoomView: FC<ModToolsRoomViewProps> = props =>
{
    const { roomId = null, onCloseClick = null } = props;
    const [ currentTab, setCurrentTab ] = useState(TABS[0]);
    const [ name, setName ] = useState<string>(null);
    const [ ownerId, setOwnerId ] = useState<number>(0);
    const [ ownerName, setOwnerName ] = useState<string>(null);
    const [ usersInRoom, setUsersInRoom ] = useState(0);
    const [ roomData, setRoomData ] = useState<IRoomData>(null);
    const [ settingsDenied, setSettingsDenied ] = useState(false);
    const [ roomName, setRoomName ] = useState('');
    const [ roomDescription, setRoomDescription ] = useState('');
    const [ isTryingPassword, setIsTryingPassword ] = useState(false);
    const [ password, setPassword ] = useState('');
    const [ confirmPassword, setConfirmPassword ] = useState('');
    const [ isSafeZone, setIsSafeZone ] = useState(false);
    const [ isTurf, setIsTurf ] = useState(false);
    const [ roomCorp, setRoomCorp ] = useState<RoomCorpState>(null);
    const [ usersWithRights, setUsersWithRights ] = useState<Map<number, string>>(new Map());
    const [ kickUsers, setKickUsers ] = useState(false);
    const [ message, setMessage ] = useState('');
    const [ isMuted, setIsMuted ] = useState(false);
    const { navigatorData = null, categories = null } = useNavigator();
    const { roomSession = null } = useRoom();
    const { showConfirm = null } = useNotification();

    const isCurrentRoom = (!!roomSession && (roomSession.roomId === roomId));

    useMessageEvent<ModeratorRoomInfoEvent>(ModeratorRoomInfoEvent, event =>
    {
        const parser = event.getParser();

        if(!parser || parser.data.flatId !== roomId) return;

        setName(parser.data.room.name);
        setOwnerId(parser.data.ownerId);
        setOwnerName(parser.data.ownerName);
        setUsersInRoom(parser.data.userCount);
    });

    useMessageEvent<RoomSettingsDataEvent>(RoomSettingsDataEvent, event =>
    {
        const parser = event.getParser();

        if(!parser || (parser.data.roomId !== roomId)) return;

        const data = parser.data;

        setSettingsDenied(false);
        setRoomName(data.name);
        setRoomDescription(data.description);
        setRoomData({
            roomId: data.roomId,
            roomName: data.name,
            roomDescription: data.description,
            categoryId: data.categoryId,
            userCount: data.maximumVisitorsLimit,
            tags: data.tags,
            tradeState: data.tradeMode,
            allowWalkthrough: data.allowWalkThrough,
            lockState: data.doorMode,
            password: null,
            allowPets: data.allowPets,
            allowPetsEat: data.allowFoodConsume,
            hideWalls: data.hideWalls,
            wallThickness: data.wallThickness,
            floorThickness: data.floorThickness,
            chatSettings: {
                mode: data.chatSettings.mode,
                weight: data.chatSettings.weight,
                speed: data.chatSettings.speed,
                distance: data.chatSettings.distance,
                protection: data.chatSettings.protection
            },
            moderationSettings: {
                allowMute: data.roomModerationSettings.allowMute,
                allowKick: data.roomModerationSettings.allowKick,
                allowBan: data.roomModerationSettings.allowBan
            }
        });
    });

    useMessageEvent<RpRoomZoneEvent>(RpRoomZoneEvent, event =>
    {
        const parser = event.getParser();

        if(!parser || (parser.roomId !== roomId)) return;

        setIsSafeZone(parser.isSafeZone);
    });

    useMessageEvent<RpRoomTurfEvent>(RpRoomTurfEvent, event =>
    {
        const parser = event.getParser();

        if(!parser || (parser.roomId !== roomId)) return;

        setIsTurf(parser.isTurf);
    });

    useMessageEvent<RpRoomCorpEvent>(RpRoomCorpEvent, event =>
    {
        const parser = event.getParser();

        if(!parser || (parser.roomId !== roomId)) return;

        setRoomCorp({
            corpId: parser.corpId,
            ranks: parser.ranks.map(rank => ({ rankId: rank.rankId, rankOrder: rank.rankOrder, rankName: rank.rankName, authorized: rank.authorized })),
            allowMedical: parser.allowMedical,
            allowPolice: parser.allowPolice,
            allowStaff: parser.allowStaff
        });
    });

    useMessageEvent<FlatControllersEvent>(FlatControllersEvent, event =>
    {
        const parser = event.getParser();

        if(parser.roomId !== roomId) return;

        setUsersWithRights(parser.users);
    });

    useMessageEvent<FlatControllerAddedEvent>(FlatControllerAddedEvent, event =>
    {
        const parser = event.getParser();

        if(parser.roomId !== roomId) return;

        setUsersWithRights(prevValue =>
        {
            const newValue = new Map(prevValue);

            newValue.set(parser.data.userId, parser.data.userName);

            return newValue;
        });
    });

    useMessageEvent<FlatControllerRemovedEvent>(FlatControllerRemovedEvent, event =>
    {
        const parser = event.getParser();

        if(parser.roomId !== roomId) return;

        setUsersWithRights(prevValue =>
        {
            const newValue = new Map(prevValue);

            newValue.delete(parser.userId);

            return newValue;
        });
    });

    useEffect(() =>
    {
        SendMessageComposer(new GetModeratorRoomInfoMessageComposer(roomId));
        SendMessageComposer(new RoomUsersWithRightsComposer(roomId));
        SendMessageComposer(new RoomSettingsComposer(roomId));

        // no answer means the server turned the request down
        const timeout = setTimeout(() => setRoomData(prevValue =>
        {
            if(!prevValue) setSettingsDenied(true);

            return prevValue;
        }), SETTINGS_TIMEOUT_MS);

        return () => clearTimeout(timeout);
    }, [ roomId ]);

    useEffect(() =>
    {
        if(!isCurrentRoom || !navigatorData?.enteredGuestRoom) return;

        setIsMuted(navigatorData.enteredGuestRoom.allInRoomMuted);
    }, [ isCurrentRoom, navigatorData ]);

    const saveSettings = (next: IRoomData) =>
    {
        SendMessageComposer(new SaveRoomSettingsComposer(
            next.roomId,
            next.roomName,
            next.roomDescription,
            next.lockState,
            next.password,
            next.userCount,
            next.categoryId,
            next.tags.length,
            next.tags,
            next.tradeState,
            next.allowPets,
            next.allowPetsEat,
            next.allowWalkthrough,
            next.hideWalls,
            next.wallThickness,
            next.floorThickness,
            next.moderationSettings.allowMute,
            next.moderationSettings.allowKick,
            next.moderationSettings.allowBan,
            next.chatSettings.mode,
            next.chatSettings.weight,
            next.chatSettings.speed,
            next.chatSettings.distance,
            next.chatSettings.protection));
    }

    // change one or more settings and save the whole set, as Room settings does
    const update = (change: (value: IRoomData) => void) =>
    {
        setRoomData(prevValue =>
        {
            if(!prevValue) return prevValue;

            const newValue: IRoomData = { ...prevValue, chatSettings: { ...prevValue.chatSettings }, moderationSettings: { ...prevValue.moderationSettings } };

            change(newValue);
            saveSettings(newValue);

            return newValue;
        });
    }

    const saveRoomName = () =>
    {
        if(!roomData || (roomName === roomData.roomName) || (roomName.length < ROOM_NAME_MIN_LENGTH) || (roomName.length > ROOM_NAME_MAX_LENGTH)) return;

        update(value => (value.roomName = roomName));
        setName(roomName);
    }

    const saveRoomDescription = () =>
    {
        if(!roomData || (roomDescription === roomData.roomDescription) || (roomDescription.length > DESC_MAX_LENGTH)) return;

        update(value => (value.roomDescription = roomDescription));
    }

    const pickDoor = (value: number) =>
    {
        if(value === RoomDataParser.PASSWORD_STATE)
        {
            // the door only changes once a password has been typed twice
            setIsTryingPassword(true);

            return;
        }

        setIsTryingPassword(false);
        setPassword('');
        setConfirmPassword('');
        update(next => (next.lockState = value));
    }

    const savePassword = () =>
    {
        if(!isTryingPassword || !password.length || (password !== confirmPassword)) return;

        update(next =>
        {
            next.lockState = RoomDataParser.PASSWORD_STATE;
            next.password = password;
        });
        setIsTryingPassword(false);
        setPassword('');
        setConfirmPassword('');
    }

    const deleteRoom = () =>
    {
        showConfirm(LocalizeText('navigator.roomsettings.deleteroom.confirm.message', [ 'room_name' ], [ roomData?.roomName ?? name ?? '' ]), () =>
        {
            SendMessageComposer(new RoomDeleteComposer(roomId));
            onCloseClick();
        }, null, null, null, LocalizeText('navigator.roomsettings.deleteroom.confirm.title'));
    }

    // Safe or Unsafe. A turf plays as unsafe; choosing Unsafe on one leaves it
    // a turf, so only a real change is sent (it would clear the turf).
    const saveZone = (safe: boolean) =>
    {
        if(safe === isSafeZone) return;
        if(!safe && isTurf) return;

        setIsSafeZone(safe);
        SendMessageComposer(new RpRoomZoneTypeSaveComposer(safe ? ROOM_ZONE_SAFE : ROOM_ZONE_UNSAFE));
    }

    const toggleMute = () =>
    {
        setIsMuted(value => !value);
        SendMessageComposer(new RoomMuteComposer());
    }

    const sendToRoom = () =>
    {
        if(!message.trim().length) return;

        // the room id rides in the packet's spare string so the server sends
        // the alert to THIS room, not the one the moderator is standing in
        SendMessageComposer(new ModeratorActionMessageComposer(ModeratorActionMessageComposer.ACTION_ALERT, message, roomId.toString()));

        if(kickUsers) SendMessageComposer(new ModerateRoomMessageComposer(roomId, 0, 0, 1));

        setMessage('');
        setKickUsers(false);
    }

    const noAccess = (
        <div className="mt-empty">
            { settingsDenied
                ? <>You don&apos;t have access to this room&apos;s settings.</>
                : <>Loading the room&apos;s settings&hellip;</> }
        </div>
    );

    const doorValue = (isTryingPassword ? RoomDataParser.PASSWORD_STATE : (roomData?.lockState ?? RoomDataParser.OPEN_STATE));

    return (
        <NitroCardView className="nitro-mod-tools-room" theme="primary-slim" windowPosition={ DraggableWindowPosition.TOP_LEFT }>
            <NitroCardHeaderView headerText={ name || 'Room Tool' } onCloseClick={ event => onCloseClick() } />
            <NitroCardTabsView>
                { TABS.map(tab => (
                    <NitroCardTabsItemView key={ tab } isActive={ (currentTab === tab) } onClick={ event => setCurrentTab(tab) }>
                        { tab }
                    </NitroCardTabsItemView>
                )) }
            </NitroCardTabsView>
            <NitroCardContentView className="mt-page" overflow="auto">
                { (currentTab === 'Overview') &&
                    <>
                        <div className="mt-card mt-room-card">
                            <div className="mt-room-picture-column">
                                <div className="mt-room-picture">
                                    <LayoutRoomThumbnailView roomId={ roomId } customUrl={ (isCurrentRoom ? navigatorData?.enteredGuestRoom?.officialRoomPicRef : undefined) } />
                                    { isCurrentRoom &&
                                        <button type="button" className="mt-room-camera" aria-label="Take a new room picture" title="Take a new room picture" onClick={ () => DispatchUiEvent(new RoomWidgetThumbnailEvent(RoomWidgetThumbnailEvent.TOGGLE_THUMBNAIL)) }>
                                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></svg>
                                        </button> }
                                </div>
                                { isCurrentRoom &&
                                    <button type="button" className="mt-chrome w-100" onClick={ () => CreateLinkEvent('floor-editor/toggle') }>Floor plan</button> }
                            </div>
                            <div className="mt-room-details">
                                <div className="mt-owner-row">
                                    <div className="mt-owner">
                                        <span className="mt-muted">Owner</span> <span className="mt-link" onClick={ () => ownerId && CreateLinkEvent(`mod-tools/open-user-info/${ ownerId }`) }>{ ownerName }</span> <span className="mt-muted">·</span> <b>{ usersInRoom }</b> <span className="mt-muted">in room</span>
                                    </div>
                                    { roomData &&
                                        <button type="button" className="mt-bin" aria-label="Delete room" title="Delete room" onClick={ deleteRoom }>
                                            <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M2 3.5h10" /><path d="M5.5 3.5V2h3v1.5" /><path d="M3.5 3.5l.6 8.5h5.8l.6-8.5" /><path d="M5.8 6v3.8M8.2 6v3.8" /></svg>
                                        </button> }
                                </div>
                                { roomData &&
                                    <>
                                        <div className="mt-field">
                                            <label className="mt-label" htmlFor={ `mt-name-${ roomId }` }>Room name</label>
                                            <div className="d-flex gap-1">
                                                <input id={ `mt-name-${ roomId }` } className="form-control form-control-sm" type="text" value={ roomName } maxLength={ ROOM_NAME_MAX_LENGTH } onChange={ event => setRoomName(event.target.value) } onBlur={ saveRoomName } />
                                                { isCurrentRoom &&
                                                    <button type="button" className="mt-icon-button" aria-label="Room link" title="Room link" onClick={ () => CreateLinkEvent('navigator/toggle-room-link') }>
                                                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1" /><path d="M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" /></svg>
                                                    </button> }
                                            </div>
                                        </div>
                                        <div className="mt-field">
                                            <label className="mt-label" htmlFor={ `mt-desc-${ roomId }` }>Description</label>
                                            <textarea id={ `mt-desc-${ roomId }` } className="form-control form-control-sm mt-desc" value={ roomDescription } maxLength={ DESC_MAX_LENGTH } onChange={ event => setRoomDescription(event.target.value) } onBlur={ saveRoomDescription } />
                                        </div>
                                    </> }
                            </div>
                        </div>
                        { !roomData && noAccess }
                        { roomData &&
                            <>
                                <div className="mt-grid2">
                                    <div className="mt-field">
                                        <label className="mt-label">Category</label>
                                        <select className="form-select form-select-sm" value={ roomData.categoryId } onChange={ event => update(next => (next.categoryId = Number(event.target.value))) }>
                                            { categories && categories.map(category => <option key={ category.id } value={ category.id }>{ LocalizeText(category.name) }</option>) }
                                        </select>
                                    </div>
                                    <div className="mt-field">
                                        <label className="mt-label">Max visitors</label>
                                        <select className="form-select form-select-sm" value={ roomData.userCount } onChange={ event => update(next => (next.userCount = Number(event.target.value))) }>
                                            { GetMaxVisitorsList && GetMaxVisitorsList.map(value => <option key={ value } value={ value }>{ value }</option>) }
                                        </select>
                                    </div>
                                    <div className="mt-field">
                                        <label className="mt-label">Trading</label>
                                        <select className="form-select form-select-sm" value={ roomData.tradeState } onChange={ event => update(next => (next.tradeState = Number(event.target.value))) }>
                                            <option value="0">{ LocalizeText('navigator.roomsettings.trade_not_allowed') }</option>
                                            <option value="1">{ LocalizeText('navigator.roomsettings.trade_not_with_Controller') }</option>
                                            <option value="2">{ LocalizeText('navigator.roomsettings.trade_allowed') }</option>
                                        </select>
                                    </div>
                                    <div className="mt-field">
                                        <label className="mt-label">Door</label>
                                        <select className="form-select form-select-sm" value={ doorValue } onChange={ event => pickDoor(Number(event.target.value)) }>
                                            <option value={ RoomDataParser.OPEN_STATE }>Open</option>
                                            <option value={ RoomDataParser.DOORBELL_STATE }>Doorbell</option>
                                            <option value={ RoomDataParser.INVISIBLE_STATE }>Invisible</option>
                                            <option value={ RoomDataParser.PASSWORD_STATE }>Password</option>
                                        </select>
                                    </div>
                                </div>
                                { isTryingPassword &&
                                    <div className="mt-grid2">
                                        <div className="mt-field">
                                            <label className="mt-label">Password</label>
                                            <input className="form-control form-control-sm" type="password" value={ password } onChange={ event => setPassword(event.target.value) } />
                                        </div>
                                        <div className="mt-field">
                                            <label className="mt-label">Confirm</label>
                                            <input className="form-control form-control-sm" type="password" value={ confirmPassword } onChange={ event => setConfirmPassword(event.target.value) } onBlur={ savePassword } />
                                        </div>
                                    </div> }
                                <div className="mt-card">
                                    <div className="mt-line"><span>Players can walk through each other</span><ModSwitch on={ roomData.allowWalkthrough } label="Players can walk through each other" onToggle={ () => update(next => (next.allowWalkthrough = !next.allowWalkthrough)) } /></div>
                                    <div className="mt-line"><span>Hide the walls</span><ModSwitch on={ roomData.hideWalls } label="Hide the walls" onToggle={ () => update(next => (next.hideWalls = !next.hideWalls)) } /></div>
                                </div>
                                <div className="mt-grid2">
                                    <div className="mt-field">
                                        <label className="mt-label">Wall thickness</label>
                                        <select className="form-select form-select-sm" value={ roomData.wallThickness } onChange={ event => update(next => (next.wallThickness = Number(event.target.value))) }>
                                            <option value="0">{ LocalizeText('navigator.roomsettings.wall_thickness.normal') }</option>
                                            <option value="1">{ LocalizeText('navigator.roomsettings.wall_thickness.thick') }</option>
                                            <option value="-1">{ LocalizeText('navigator.roomsettings.wall_thickness.thin') }</option>
                                            <option value="-2">{ LocalizeText('navigator.roomsettings.wall_thickness.thinnest') }</option>
                                        </select>
                                    </div>
                                    <div className="mt-field">
                                        <label className="mt-label">Floor thickness</label>
                                        <select className="form-select form-select-sm" value={ roomData.floorThickness } onChange={ event => update(next => (next.floorThickness = Number(event.target.value))) }>
                                            <option value="0">{ LocalizeText('navigator.roomsettings.floor_thickness.normal') }</option>
                                            <option value="1">{ LocalizeText('navigator.roomsettings.floor_thickness.thick') }</option>
                                            <option value="-1">{ LocalizeText('navigator.roomsettings.floor_thickness.thin') }</option>
                                            <option value="-2">{ LocalizeText('navigator.roomsettings.floor_thickness.thinnest') }</option>
                                        </select>
                                    </div>
                                </div>
                                <div className="mt-label mt-section-label">Chat</div>
                                <div className="mt-grid2">
                                    <div className="mt-field">
                                        <label className="mt-label">Chat mode</label>
                                        <select className="form-select form-select-sm" value={ roomData.chatSettings.mode } onChange={ event => update(next => (next.chatSettings.mode = Number(event.target.value))) }>
                                            <option value={ RoomChatSettings.CHAT_MODE_FREE_FLOW }>{ LocalizeText('navigator.roomsettings.chat.mode.free.flow') }</option>
                                            <option value={ RoomChatSettings.CHAT_MODE_LINE_BY_LINE }>{ LocalizeText('navigator.roomsettings.chat.mode.line.by.line') }</option>
                                        </select>
                                    </div>
                                    <div className="mt-field">
                                        <label className="mt-label">Bubble width</label>
                                        <select className="form-select form-select-sm" value={ roomData.chatSettings.weight } onChange={ event => update(next => (next.chatSettings.weight = Number(event.target.value))) }>
                                            <option value={ RoomChatSettings.CHAT_BUBBLE_WIDTH_NORMAL }>{ LocalizeText('navigator.roomsettings.chat.bubbles.width.normal') }</option>
                                            <option value={ RoomChatSettings.CHAT_BUBBLE_WIDTH_THIN }>{ LocalizeText('navigator.roomsettings.chat.bubbles.width.thin') }</option>
                                            <option value={ RoomChatSettings.CHAT_BUBBLE_WIDTH_WIDE }>{ LocalizeText('navigator.roomsettings.chat.bubbles.width.wide') }</option>
                                        </select>
                                    </div>
                                    <div className="mt-field">
                                        <label className="mt-label">Scroll speed</label>
                                        <select className="form-select form-select-sm" value={ roomData.chatSettings.speed } onChange={ event => update(next => (next.chatSettings.speed = Number(event.target.value))) }>
                                            <option value={ RoomChatSettings.CHAT_SCROLL_SPEED_FAST }>{ LocalizeText('navigator.roomsettings.chat.speed.fast') }</option>
                                            <option value={ RoomChatSettings.CHAT_SCROLL_SPEED_NORMAL }>{ LocalizeText('navigator.roomsettings.chat.speed.normal') }</option>
                                            <option value={ RoomChatSettings.CHAT_SCROLL_SPEED_SLOW }>{ LocalizeText('navigator.roomsettings.chat.speed.slow') }</option>
                                        </select>
                                    </div>
                                </div>
                                <div className="mt-label mt-section-label">Pets</div>
                                <div className="mt-card">
                                    <div className="mt-line"><span>Allow pets</span><ModSwitch on={ roomData.allowPets } label="Allow pets" onToggle={ () => update(next => (next.allowPets = !next.allowPets)) } /></div>
                                    <div className="mt-line"><span>Pets can eat the food here</span><ModSwitch on={ roomData.allowPetsEat } label="Pets can eat the food here" onToggle={ () => update(next => (next.allowPetsEat = !next.allowPetsEat)) } /></div>
                                </div>
                            </> }
                    </> }
                { (currentTab === 'Roleplay') &&
                    <>
                        <div className="mt-section">
                            <div className="mt-section-title">Zone Type</div>
                            { isCurrentRoom
                                ? <div className="mt-seg" role="radiogroup" aria-label="Zone type">
                                    <button type="button" role="radio" aria-checked={ isSafeZone } className={ `mt-seg-button${ isSafeZone ? ' is-on' : '' }` } onClick={ () => saveZone(true) }><i className="mt-zone-dot is-safe" />Safe</button>
                                    <button type="button" role="radio" aria-checked={ !isSafeZone } className={ `mt-seg-button${ !isSafeZone ? ' is-on' : '' }` } onClick={ () => saveZone(false) }><i className="mt-zone-dot is-unsafe" />Unsafe</button>
                                </div>
                                : <div className="mt-hint">Stand in the room to change its zone type.</div> }
                        </div>
                        <RoleplayHeadquartersView roomId={ roomId } roomCorp={ roomCorp } className="mt-section" />
                        <RoleplayEmergenciesView roomId={ roomId } roomCorp={ roomCorp } className="mt-section" />
                        <RoleplayAuthorizationsView roomId={ roomId } roomCorp={ roomCorp } className="mt-section" />
                    </> }
                { (currentTab === 'Moderation') &&
                    <>
                        <div className="mt-label">Caution the room</div>
                        <div className="mt-card">
                            <div className="mt-line"><span>Kick everyone out</span><ModSwitch on={ kickUsers } label="Kick everyone out" onToggle={ () => setKickUsers(value => !value) } /></div>
                            { isCurrentRoom &&
                                <div className="mt-line"><span>Mute everyone</span><ModSwitch on={ isMuted } label="Mute everyone" onToggle={ toggleMute } /></div> }
                        </div>
                        <label className="mt-label mt-section-label" htmlFor={ `mt-msg-${ roomId }` }>Message to everyone in the room</label>
                        <textarea id={ `mt-msg-${ roomId }` } className="form-control form-control-sm mt-message" placeholder="Required. Everyone in the room sees this." value={ message } onChange={ event => setMessage(event.target.value) } />
                        <button type="button" className="mt-chrome w-100" disabled={ !message.trim().length } onClick={ sendToRoom }>Send to Room</button>
                        <div className="mt-footer-row">
                            <span className="mt-hint">Words this room hides from its chat.</span>
                            <button type="button" className="mt-chrome" onClick={ () => SendMessageComposer(new GetCustomRoomFilterMessageComposer(roomId)) }>Word filter</button>
                        </div>
                    </> }
                { (currentTab === 'Rights') &&
                    <>
                        <div className="mt-rights-head">
                            <span className="mt-label">Players with rights · { usersWithRights.size }</span>
                            { /* the server clears the room the moderator stands in, so
                                 only offer it for that room */ }
                            { isCurrentRoom &&
                                <button type="button" className="mt-danger mt-small" disabled={ !usersWithRights.size } onClick={ () => SendMessageComposer(new RemoveAllRightsMessageComposer(roomId)) }>Remove everyone</button> }
                        </div>
                        <div className="mt-card">
                            { !usersWithRights.size &&
                                <div className="mt-line mt-muted">Nobody has rights in this room.</div> }
                            { Array.from(usersWithRights.entries()).map(([ id, username ]) => (
                                <div key={ id } className="mt-line">
                                    <span className="mt-link" onClick={ () => CreateLinkEvent(`mod-tools/open-user-info/${ id }`) }>{ username }</span>
                                    { isCurrentRoom &&
                                        <button type="button" className="mt-remove" aria-label={ `Take ${ username }'s rights` } title="Take rights" onClick={ () => SendMessageComposer(new RoomTakeRightsComposer(id)) }>
                                            <svg width="10" height="10" viewBox="0 0 11 11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M1.5 1.5l8 8M9.5 1.5l-8 8" /></svg>
                                        </button> }
                                </div>
                            )) }
                        </div>
                    </> }
            </NitroCardContentView>
        </NitroCardView>
    );
}
