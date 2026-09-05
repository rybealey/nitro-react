import { RoomObjectCategory, RoomObjectType, RoomSessionUserFigureUpdateEvent, RpPassiveCancelComposer, RpStatsEvent } from '@nitrots/nitro-renderer';
import { FC, useCallback, useEffect, useState } from 'react';
import { FaBolt, FaHeart, FaLock, FaLockOpen, FaRegStar, FaStar, FaTimes } from 'react-icons/fa';
import { AvatarInfoUser, AvatarInfoUtilities, CreateLinkEvent, GetRoomEngine, GetSessionDataManager, OwnMotto, RoomWidgetUpdateRoomObjectEvent, SendMessageComposer } from '../../../../api';
import { Flex, LayoutAvatarImageView } from '../../../../common';
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

// Deterministic pseudo-values for the still-mocked wanted level — stable per
// name. Everything else is overridden by live values once the server has
// sent them.
const mockStatsFor = (name: string): HudStats =>
{
    let hash = 0;

    for(let i = 0; i < name.length; i++) hash = (((hash * 31) + name.charCodeAt(i)) >>> 0);

    return {
        hp: 100,
        hpMax: 100,
        energy: 100,
        energyMax: 100,
        aggro: 0,
        wanted: (hash % 6),
        aggressive: false,
        passive: false
    };
};

// Merge the live server stats (when known) over the base values.
const withLiveStats = (roomIndex: number, base: HudStats): HudStats =>
{
    const live = rpStatsStore.get(roomIndex);

    if(!live) return base;

    return { ...base, hp: live.hp, hpMax: live.hpMax, energy: live.energy, energyMax: live.energyMax, aggro: live.aggro, aggressive: (live.aggro > 0), passive: live.passive };
};

const HudStars: FC<{ wanted: number }> = ({ wanted }) =>
{
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

export const PlayerHudWidgetView: FC<{}> = () =>
{
    const [ ownFigure, setOwnFigure ] = useState<string>(() => GetSessionDataManager().figure);
    const [ target, setTarget ] = useState<AvatarInfoUser>(null);
    const [ locked, setLocked ] = useState<boolean>(false);
    const [ , setStatsVersion ] = useState<number>(0);
    const { roomSession } = useRoom();

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
    useEffect(() =>
    {
        rpStatsStore.clear();
    }, [ roomSession ]);

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

    const closeTarget = () =>
    {
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

    const selfName = (GetSessionDataManager().userName ?? '');
    const selfGender = GetSessionDataManager().gender;
    const playerStats = withLiveStats(roomSession?.ownRoomIndex ?? -1, DEFAULT_STATS);
    const targetStats = target ? withLiveStats(target.roomIndex, mockStatsFor(target.name)) : null;
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
                            <i className="fa-solid fa-badge-check hud-verified" title="PixelRP Staff" aria-hidden="true" /> }
                        { (playerStats.aggressive || playerStats.passive) &&
                            (playerStats.aggressive
                                ? <span className="hud-state aggressive">AGGRESSIVE</span>
                                : <span className="hud-state passive is-cancellable">
                                    PASSIVE
                                    { /* slides out on hover; ends passive early (server
                                         shouts the roleplay line for the room) */ }
                                    <span className="hud-state-cancel" title="End passive status" onClick={ event => SendMessageComposer(new RpPassiveCancelComposer()) }>×</span>
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
                                <i className="fa-solid fa-badge-check hud-verified" title="PixelRP Staff" aria-hidden="true" /> }
                            <span className="hud-name">{ target.name }</span>
                        </div>
                        <HudBars stats={ targetStats } mirrored />
                    </div>
                    <div className="hud-portrait">
                        <span className="hud-close" title="Clear target" onClick={ closeTarget }><FaTimes /></span>
                        <span className={ `hud-lock ${ locked ? 'locked' : '' }` } title={ locked ? 'Unlock target' : 'Lock target' } onClick={ toggleTargetLock }>
                            { locked ? <FaLock /> : <FaLockOpen /> }
                        </span>
                        { targetGang &&
                            <span className="hud-gang" title={ `${ targetGang.name } · ${ targetGang.isOwner ? 'Leader' : 'Member' }` } onClick={ () => CreateLinkEvent(`rp-gangs/view/${ targetGang.gangId }`) }>
                                <GangCrest primary={ targetGang.colourA } secondary={ targetGang.colourB } size={ 40 } />
                            </span> }
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
