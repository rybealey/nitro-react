import { RoomObjectCategory, RoomObjectType, RoomSessionUserFigureUpdateEvent, RpPassiveCancelComposer, RpStatsEvent } from '@nitrots/nitro-renderer';
import { FC, useCallback, useEffect, useState } from 'react';
import { FaBolt, FaHeart, FaLock, FaLockOpen, FaRegStar, FaStar, FaTimes } from 'react-icons/fa';
import { AvatarInfoUser, AvatarInfoUtilities, CreateLinkEvent, GetRoomEngine, GetSessionDataManager, OwnMotto, RoomWidgetUpdateRoomObjectEvent, SendMessageComposer } from '../../../../api';
import { SetRpStaffResolver } from '../../../../api/user/RpStaffFlag';
import { GetRpWanted, SubscribeRpWanted } from '../../../../api/rp-wanted/RpWantedMessages';
import { Flex, HoverBubble, LayoutAvatarImageView } from '../../../../common';
import { useMessageEvent, useRoom, useRoomSessionManagerEvent, useUiEvent } from '../../../../hooks';
import { TargetSelectResult, TargetState } from '../../../../hooks/rooms/targetState';
import { RpGetUserGangComposer, RpUserGangEvent } from '../../../../api/rp-gangs/RpGangMessages';
import { GetRpGang, SetRpGang } from '../../../../api/rp-gangs/RpGangRegistry';
import { GangCrest } from '../../../rp-gangs/GangCrest';
import { RpProfileState } from '../../../rp-profile/RpProfileState';

// Health, energy and aggression are REAL — pushed by the emulator per room
// unit (RpStatsEvent, keyed by roomIndex; user_rp_stats + :sethp/:seten/
// :setagg; aggression drains server-side over 45s). Only the wanted level
// remains MOCKED until its system exists.
interface HudStats
{
    hp: number;
    hpMax: number;
    energy: number;
    energyMax: number;
    aggro: number;
    wanted: number;
    aggressive: boolean;
    passive: boolean;
}

const DEFAULT_STATS: HudStats = { hp: 100, hpMax: 100, energy: 100, energyMax: 100, aggro: 0, wanted: 0, aggressive: false, passive: false };

// Live RP stats per room unit, keyed by roomIndex. Filled by RpStatsEvent
// (sent on room entry and on every change); cleared when the room changes.
const rpStatsStore: Map<number, { hp: number, hpMax: number, energy: number, energyMax: number, aggro: number, passive: boolean, staff: boolean }> = new Map();

// Staff/verified flag rides the same RpStats packet; the infostand reads it
// through this accessor (the store lives for the room and is keyed by
// roomIndex, so entries exist from room entry - before any infostand opens).
export const IsRpStaff = (roomIndex: number): boolean => (rpStatsStore.get(roomIndex)?.staff === true);

// the shared profile opener (api layer) asks for the flag through this hook
SetRpStaffResolver(IsRpStaff);

// The wanted level is the one HUD value that comes from a different feed to
// the rest: RpStats is per room unit, but a player's stars follow the player,
// so they are looked up by USER id from the wanted list (RpWantedMessages).
// This used to be a hash of the username - stable, and unrelated to anything
// the player had done.
const statsWithWanted = (userId: number): HudStats => ({ ...DEFAULT_STATS, wanted: GetRpWanted(userId) });

// Merge the live server stats (when known) over the base values.
const withLiveStats = (roomIndex: number, base: HudStats): HudStats =>
{
    const live = rpStatsStore.get(roomIndex);

    if(!live) return base;

    return { ...base, hp: live.hp, hpMax: live.hpMax, energy: live.energy, energyMax: live.energyMax, aggro: live.aggro, aggressive: (live.aggro > 0), passive: live.passive };
};

const HudStars: FC<{ wanted: number }> = ({ wanted }) =>
{
    // Not wanted, no stars: five empty outlines under every portrait was noise,
    // and the row turning up at all is now the signal.
    if(!(wanted > 0)) return null;

    return (
        <div className="hud-stars">
            { /* SVG stars, not font glyphs — ★/☆ aren't in Ubuntu, so the
                 fallback font rendered them slanted on some systems */ }
            { [ 0, 1, 2, 3, 4 ].map(index => <span key={ index } className={ (index < wanted) ? 'on' : 'off' }>{ (index < wanted) ? <FaStar /> : <FaRegStar /> }</span>) }
        </div>
    );
}

const HudBars: FC<{ stats: HudStats, mirrored?: boolean }> = ({ stats, mirrored = false }) =>
{
    const rows = [
        { key: 'hp', cls: 'hp', pct: Math.round((stats.hp / stats.hpMax) * 100), text: `${ stats.hp } / ${ stats.hpMax }`, icon: <FaHeart /> },
        { key: 'en', cls: 'en', pct: Math.round((stats.energy / stats.energyMax) * 100), text: `${ stats.energy } / ${ stats.energyMax }`, icon: <FaBolt /> }
    ];

    return (
        <div className={ `hud-bars ${ mirrored ? 'mirrored' : '' }` }>
            { rows.map(row => (
                <div key={ row.key } className="hud-bar">
                    <div className={ `hud-bar-fill ${ row.cls }` } style={ { width: `${ row.pct }%` } } />
                    <span className="hud-bar-icon">{ row.icon }</span>
                    <span className="hud-bar-value">{ row.text }</span>
                </div>
            )) }
            { /* fixed slot (never shifts the bars); the strip slides out from
                 behind the energy bar when aggression turns on, and back under
                 it when it clears */ }
            <div className="hud-bar-aggro-slot">
                <div className={ `hud-bar aggro ${ stats.aggressive ? 'is-active' : '' }` }><div className="hud-bar-fill agg" style={ { width: `${ stats.aggro }%` } } /></div>
            </div>
        </div>
    );
}

const HudAvatar: FC<{ figure: string, gender?: string, variant: 'self' | 'target', direction?: number, onClick?: () => void }> = ({ figure, gender = 'M', variant, direction = 2, onClick = null }) =>
{
    return (
        <div className={ `hud-avatar ${ variant } ${ onClick ? 'cursor-pointer' : '' }` } onClick={ onClick }>
            <LayoutAvatarImageView figure={ figure } gender={ gender } direction={ direction } />
        </div>
    );
}

// How long after arriving in a room a remembered target may still turn up and
// be picked back up. Long enough for somebody who came through the same
// teleport a beat behind you; short enough that it is about THIS arrival and
// not a standing order to re-target them wherever you next meet.
const REACQUIRE_WINDOW_MS = 8000;

// MODULE SCOPE, NOT A REF, and that is the whole point of it.
//
// RoomView renders `{ roomSession && <RoomWidgetsView /> }`, so leaving a room
// UNMOUNTS this component and every piece of React state in it. A ref cannot
// carry anything across a room change because there is nothing alive to hold
// it - which is why keeping the target in one did not work. This lives outside
// React and outlives the teardown; the new mount reads it back.
//
// Not persisted anywhere: a target is a thing about the session you are in, and
// coming back tomorrow to find somebody still in your sights would be wrong.
let rememberedTarget: { webID: number, locked: boolean } = null;

// When the remembered target is allowed to re-acquire itself. Set on mount,
// which IS the room change here, and closed as soon as it is used.
let reacquireUntil = 0;

export const PlayerHudWidgetView: FC<{}> = () =>
{
    const [ ownFigure, setOwnFigure ] = useState<string>(() => GetSessionDataManager().figure);
    const [ target, setTarget ] = useState<AvatarInfoUser>(null);
    const [ locked, setLocked ] = useState<boolean>(false);
    const [ , setStatsVersion ] = useState<number>(0);
    const { roomSession } = useRoom();

    // The same scan as findRoomUserByName, asked by id. Used to pick a
    // remembered target back up on the other side of a room change.
    const findRoomUserById = useCallback((webID: number): AvatarInfoUser =>
    {
        if(!roomSession || !webID) return null;

        const roomObjects = GetRoomEngine().getRoomObjects(roomSession.roomId, RoomObjectCategory.UNIT);

        for(const roomObject of roomObjects)
        {
            const userData = roomSession.userDataManager.getUserDataByIndex(roomObject.id);

            if(!userData || (userData.type !== RoomObjectType.USER)) continue;

            const info = AvatarInfoUtilities.getUserInfo(RoomObjectCategory.UNIT, userData);

            if(!info || info.isOwnUser || (info.webID !== webID)) continue;

            return info;
        }

        return null;
    }, [ roomSession ]);


    // Live RP stats: store by roomIndex and bump a version so the HUD re-renders.
    // Target's gang, for the crest chip beside the plate. Membership is keyed
    // by user id (webID) in the gang registry: asked for when the target
    // changes, and refreshed by the hotel-wide broadcast every gang mutation
    // sends, so the chip appears/disappears live.
    const [ , setGangVersion ] = useState(0);

    useMessageEvent<RpUserGangEvent>(RpUserGangEvent, event =>
    {
        const parser = event.getParser();

        SetRpGang(parser.userId, { gangId: parser.gangId, name: parser.name, colourA: parser.colourA, colourB: parser.colourB, isOwner: parser.isOwner });
        setGangVersion(value => (value + 1));
    });

    useMessageEvent<RpStatsEvent>(RpStatsEvent, event =>
    {
        const parser = event.getParser();

        rpStatsStore.set(parser.roomIndex, { hp: parser.health, hpMax: parser.healthMax, energy: parser.energy, energyMax: parser.energyMax, aggro: parser.aggression, passive: parser.passive, staff: parser.staff });

        setStatsVersion(value => (value + 1));
    });

    // Room changed: roomIndexes reset, stale stats must not bleed across rooms.
    //
    // Because the widget tree unmounts on leave, this effect running IS the
    // room change - there is no previous instance to have kept anything. It is
    // where a remembered target gets its one chance to come back.
    //
    // POLLED, not assumed. The room's units arrive asynchronously and can land
    // before this mount or well after it, so neither "look once now" nor "wait
    // to be told" is sufficient by itself: whichever you pick alone, the other
    // ordering is the one that silently does nothing. The USER_ADDED handler
    // below is still there because it reacts instantly; this is the net under
    // it.
    useEffect(() =>
    {
        rpStatsStore.clear();

        if(!rememberedTarget) return;

        reacquireUntil = (Date.now() + REACQUIRE_WINDOW_MS);

        const attempt = (): boolean =>
        {
            if(!rememberedTarget || (Date.now() > reacquireUntil)) return true;

            const info = findRoomUserById(rememberedTarget.webID);

            if(!info) return false;

            setTarget(info);
            setLocked(rememberedTarget.locked);
            reacquireUntil = 0;

            return true;
        };

        if(attempt()) return;

        const timer = window.setInterval(() =>
        {
            if(attempt()) window.clearInterval(timer);
        }, 400);

        return () => window.clearInterval(timer);
    }, [ roomSession, findRoomUserById ]);

    // Keep the player's own portrait current when they change clothes.
    useRoomSessionManagerEvent<RoomSessionUserFigureUpdateEvent>(RoomSessionUserFigureUpdateEvent.USER_FIGURE, event =>
    {
        if(roomSession && (event.roomIndex === roomSession.ownRoomIndex)) setOwnFigure(event.figure);
    });

    // Target selection: clicking another user in the room.
    useUiEvent<RoomWidgetUpdateRoomObjectEvent>(RoomWidgetUpdateRoomObjectEvent.OBJECT_SELECTED, event =>
    {
        if(locked) return;
        if(event.category !== RoomObjectCategory.UNIT) return;

        const userData = roomSession?.userDataManager?.getUserDataByIndex(event.id);

        if(!userData || (userData.type !== RoomObjectType.USER)) return;

        const info = AvatarInfoUtilities.getUserInfo(event.category, userData);

        if(!info || info.isOwnUser) return;

        setTarget(info);
    });

    // Deliberately NO OBJECT_DESELECTED handler: a target persists until a
    // new one is selected, the target HUD's close button is used, or the
    // target leaves the room — clicking the floor/furni never clears it.

    useUiEvent<RoomWidgetUpdateRoomObjectEvent>(RoomWidgetUpdateRoomObjectEvent.USER_REMOVED, event =>
    {
        if((event.category === RoomObjectCategory.UNIT) && target && (target.roomIndex === event.id))
        {
            setTarget(null);
            setLocked(false);
        }
    });

    // Only ever WRITES, never clears: USER_REMOVED nulls `target` as the room is
    // torn down, and that must not be mistaken for letting somebody go.
    useEffect(() =>
    {
        if(target) rememberedTarget = { webID: target.webID, locked };
    }, [ target, locked ]);

    // The other half of the room change: somebody who lands after you do. The
    // escorted case is exactly this - the captive is summoned a moment behind
    // the captor and arrives into a room you are already standing in.
    useUiEvent<RoomWidgetUpdateRoomObjectEvent>(RoomWidgetUpdateRoomObjectEvent.USER_ADDED, event =>
    {
        const remembered = rememberedTarget;

        if(!remembered || target) return;
        if(Date.now() > reacquireUntil) return;
        if(event.category !== RoomObjectCategory.UNIT) return;

        const userData = roomSession?.userDataManager?.getUserDataByIndex(event.id);

        if(!userData || (userData.type !== RoomObjectType.USER)) return;

        const info = AvatarInfoUtilities.getUserInfo(event.category, userData);

        if(!info || info.isOwnUser || (info.webID !== remembered.webID)) return;

        setTarget(info);
        setLocked(remembered.locked);
        reacquireUntil = 0;
    });

    const closeTarget = () =>
    {
        // The one deliberate clear. Everything else is the room moving around
        // underneath a target that is still wanted.
        rememberedTarget = null;
        reacquireUntil = 0;
        setTarget(null);
        setLocked(false);
    }

    const toggleTargetLock = useCallback((): boolean | null =>
    {
        if(!target) return null;

        const nextLocked = !locked;

        setLocked(nextLocked);

        return nextLocked;
    }, [ target, locked ]);

    // Shared room-unit lookup behind both :lt and :t - case-insensitive, scoped
    // to the current room, and never your own avatar (matching click targeting).
    useEffect(() =>
    {
        if(!target?.webID) return;

        SendMessageComposer(new RpGetUserGangComposer(target.webID));
    }, [ target?.webID ]);

    // The viewer's OWN gang, asked for once when the HUD mounts. Nothing else
    // in a room requests it - the wallet, the profile and the Gang window all
    // do, but a player who has opened none of them has no membership in the
    // registry, and the avatar menu's "Invite to Gang" has to know before the
    // first click. The hotel-wide broadcast only arrives after some mutation.
    useEffect(() =>
    {
        SendMessageComposer(new RpGetUserGangComposer(GetSessionDataManager().userId));
    }, []);

    const findRoomUserByName = useCallback((name: string): AvatarInfoUser =>
    {
        if(!roomSession || !name.trim()) return null;

        const requestedName = name.trim().toLowerCase();
        const roomObjects = GetRoomEngine().getRoomObjects(roomSession.roomId, RoomObjectCategory.UNIT);

        for(const roomObject of roomObjects)
        {
            const userData = roomSession.userDataManager.getUserDataByIndex(roomObject.id);

            if(!userData || (userData.type !== RoomObjectType.USER) || (userData.name.toLowerCase() !== requestedName)) continue;

            const info = AvatarInfoUtilities.getUserInfo(RoomObjectCategory.UNIT, userData);

            if(!info || info.isOwnUser) return null;

            return info;
        }

        return null;
    }, [ roomSession ]);

    const lockTargetByName = useCallback((name: string): string | null =>
    {
        const info = findRoomUserByName(name);

        if(!info) return null;

        setTarget(info);
        setLocked(true);

        return info.name;
    }, [ findRoomUserByName ]);

    // :t selects WITHOUT touching the lock. A held lock is deliberate, so
    // switching is refused rather than silently overridden - release it with
    // :lt first.
    const selectTargetByName = useCallback((name: string): TargetSelectResult =>
    {
        if(locked && target) return { status: 'locked', name: target.name };

        const info = findRoomUserByName(name);

        if(!info) return { status: 'missing' };

        setTarget(info);

        return { status: 'selected', name: info.name };
    }, [ findRoomUserByName, locked, target ]);

    // Mirror the selected target for non-React consumers — the chat input reads
    // this when expanding the "@x" target-mention shorthand into a shout.
    useEffect(() =>
    {
        TargetState.name = (target ? target.name : null);
        TargetState.toggleLock = toggleTargetLock;
        TargetState.lockByName = lockTargetByName;
        TargetState.selectByName = selectTargetByName;

        return () =>
        {
            TargetState.name = null;
            TargetState.toggleLock = null;
            TargetState.lockByName = null;
            TargetState.selectByName = null;
        }
    }, [ target, toggleTargetLock, lockTargetByName, selectTargetByName ]);

    // A charge filed anywhere re-broadcasts the whole list, and these stars
    // have to follow it without waiting for the next room event.
    const [ , setWantedTick ] = useState(0);

    useEffect(() => SubscribeRpWanted(() => setWantedTick(value => (value + 1))), []);

    const selfName = (GetSessionDataManager().userName ?? '');
    const selfGender = GetSessionDataManager().gender;
    const playerStats = withLiveStats(roomSession?.ownRoomIndex ?? -1, statsWithWanted(GetSessionDataManager().userId));
    const targetStats = target ? withLiveStats(target.roomIndex, statsWithWanted(target.webID)) : null;
    const targetGang = (target ? GetRpGang(target.webID) : null);

    return (
        // plates hang from the top edge (purse-style), so they align at the
        // top and drop to their own heights
        <Flex alignItems="start" gap={ 2 } className="nitro-player-hud-bar">
            <Flex alignItems="center" gap={ 2 } className="hud-plate">
                <div className="hud-portrait">
                    <HudAvatar figure={ ownFigure } gender={ selfGender } variant="self" onClick={ () =>
                    {
                        RpProfileState.name = selfName;
                        RpProfileState.figure = ownFigure;
                        RpProfileState.motto = OwnMotto.value;
                        RpProfileState.online = true;
                        RpProfileState.userId = GetSessionDataManager().userId;
                        RpProfileState.employment = null;
                        RpProfileState.staff = IsRpStaff(roomSession?.ownRoomIndex ?? -1);
                        CreateLinkEvent('rp-profile/show');
                    } } />
                    <HudStars wanted={ playerStats.wanted } />
                </div>
                <div className="hud-info">
                    <div className="hud-name-row">
                        <span className="hud-name">{ selfName }</span>
                        { IsRpStaff(roomSession?.ownRoomIndex ?? -1) &&
                            <HoverBubble text="PixelRP Staff" placement="bottom"><i className="fa-solid fa-badge-check hud-verified" aria-hidden="true" /></HoverBubble> }
                        { (playerStats.aggressive || playerStats.passive) &&
                            (playerStats.aggressive
                                ? <span className="hud-state aggressive">AGGRESSIVE</span>
                                : <span className="hud-state passive is-cancellable">
                                    PASSIVE
                                    { /* slides out on hover; ends passive early (server
                                         shouts the roleplay line for the room) */ }
                                    <HoverBubble text="End passive status" placement="bottom"><span className="hud-state-cancel" onClick={ event => SendMessageComposer(new RpPassiveCancelComposer()) }>×</span></HoverBubble>
                                </span>) }
                    </div>
                    <HudBars stats={ playerStats } />
                </div>
            </Flex>

            { target && targetStats &&
                <Flex alignItems="center" gap={ 2 } className="hud-plate target">
                    <div className="hud-info mirrored">
                        <div className="hud-name-row">
                            { (targetStats.aggressive || targetStats.passive) &&
                                <span className={ `hud-state ${ targetStats.aggressive ? 'aggressive' : 'passive' }` }>{ targetStats.aggressive ? 'AGGRESSIVE' : 'PASSIVE' }</span> }
                            { /* mirrored plate: the tick keeps its place beside the name, on the portrait side */ }
                            { IsRpStaff(target.roomIndex) &&
                                <HoverBubble text="PixelRP Staff" placement="bottom"><i className="fa-solid fa-badge-check hud-verified" aria-hidden="true" /></HoverBubble> }
                            <span className="hud-name">{ target.name }</span>
                        </div>
                        <HudBars stats={ targetStats } mirrored />
                    </div>
                    <div className="hud-portrait">
                        <HoverBubble text="Clear target" placement="bottom"><span className="hud-close" onClick={ closeTarget }><FaTimes /></span></HoverBubble>
                        <HoverBubble text={ locked ? 'Unlock target' : 'Lock target' } placement="bottom">
                            <span className={ `hud-lock ${ locked ? 'locked' : '' }` } onClick={ toggleTargetLock }>
                                { locked ? <FaLock /> : <FaLockOpen /> }
                            </span>
                        </HoverBubble>
                        { targetGang &&
                            <HoverBubble text={ targetGang.name } placement="bottom">
                                <span className="hud-gang" onClick={ () => CreateLinkEvent(`rp-gangs/view/${ targetGang.gangId }`) }>
                                    { /* 56 to match .hud-avatar, so the crest reads as
                                         the portrait's equal rather than a footnote
                                         beside it. */ }
                                    <GangCrest primary={ targetGang.colourA } secondary={ targetGang.colourB } size={ 56 } />
                                </span>
                            </HoverBubble> }
                        <HudAvatar figure={ target.figure } variant="target" direction={ 4 } onClick={ () =>
                        {
                            RpProfileState.name = target.name;
                            RpProfileState.figure = target.figure;
                            RpProfileState.motto = (target.motto ?? '');
                            RpProfileState.online = true;
                            // webID is the real user id; roomIndex is the unit
                            // id and would key the employment registry wrong.
                            RpProfileState.userId = target.webID;
                            RpProfileState.employment = null;
                            RpProfileState.staff = IsRpStaff(target.roomIndex);
                            CreateLinkEvent('rp-profile/show');
                        } } />
                        <HudStars wanted={ targetStats.wanted } />
                    </div>
                </Flex> }
        </Flex>
    );
}
