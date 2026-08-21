import { RoomObjectCategory, RoomObjectType, RoomSessionUserFigureUpdateEvent, RpStatsEvent } from '@nitrots/nitro-renderer';
import { FC, useEffect, useState } from 'react';
import { FaBolt, FaHeart, FaLock, FaLockOpen, FaRegStar, FaStar } from 'react-icons/fa';
import { AvatarInfoUser, AvatarInfoUtilities, GetSessionDataManager, RoomWidgetUpdateRoomObjectEvent } from '../../../../api';
import { Flex, LayoutAvatarImageView } from '../../../../common';
import { useMessageEvent, useRoom, useRoomSessionManagerEvent, useUiEvent } from '../../../../hooks';
import { TargetState } from '../../../../hooks/rooms/targetState';

// Health and energy are REAL — pushed by the emulator per room unit
// (RpStatsEvent, keyed by roomIndex; see user_rp_stats + :sethp/:seten).
// Aggression and wanted level remain MOCKED until their systems exist.
interface HudStats
{
    hp: number;
    hpMax: number;
    energy: number;
    energyMax: number;
    aggro: number;
    wanted: number;
    aggressive: boolean;
}

const DEFAULT_STATS: HudStats = { hp: 100, hpMax: 100, energy: 100, energyMax: 100, aggro: 45, wanted: 0, aggressive: false };

// Live RP stats per room unit, keyed by roomIndex. Filled by RpStatsEvent
// (sent on room entry and on every change); cleared when the room changes.
const rpStatsStore: Map<number, { hp: number, hpMax: number, energy: number, energyMax: number }> = new Map();

// Deterministic pseudo-values for the still-mocked fields (aggression, wanted
// level) — stable per name. Health/energy defaults here are overridden by the
// live values whenever the server has sent them.
const mockStatsFor = (name: string): HudStats =>
{
    let hash = 0;

    for(let i = 0; i < name.length; i++) hash = (((hash * 31) + name.charCodeAt(i)) >>> 0);

    const aggressive = ((hash % 3) === 0);

    return {
        hp: 100,
        hpMax: 100,
        energy: 100,
        energyMax: 100,
        aggro: aggressive ? (55 + (hash % 45)) : 0,
        wanted: (hash % 6),
        aggressive
    };
};

// Merge the live server stats (when known) over the base values.
const withLiveStats = (roomIndex: number, base: HudStats): HudStats =>
{
    const live = rpStatsStore.get(roomIndex);

    if(!live) return base;

    return { ...base, hp: live.hp, hpMax: live.hpMax, energy: live.energy, energyMax: live.energyMax };
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

const HudAvatar: FC<{ figure: string, gender?: string, variant: 'self' | 'target', direction?: number }> = ({ figure, gender = 'M', variant, direction = 2 }) =>
{
    return (
        <div className={ `hud-avatar ${ variant }` }>
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
    useMessageEvent<RpStatsEvent>(RpStatsEvent, event =>
    {
        const parser = event.getParser();

        rpStatsStore.set(parser.roomIndex, { hp: parser.health, hpMax: parser.healthMax, energy: parser.energy, energyMax: parser.energyMax });

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

    useUiEvent(RoomWidgetUpdateRoomObjectEvent.OBJECT_DESELECTED, () =>
    {
        if(!locked) setTarget(null);
    });

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

    // Mirror the selected target for non-React consumers — the chat input reads
    // this when expanding the "@x" target-mention shorthand into a shout.
    useEffect(() =>
    {
        TargetState.name = (target ? target.name : null);

        return () =>
        {
            TargetState.name = null;
        }
    }, [ target ]);

    const selfName = (GetSessionDataManager().userName ?? '');
    const selfGender = GetSessionDataManager().gender;
    const playerStats = withLiveStats(roomSession?.ownRoomIndex ?? -1, DEFAULT_STATS);
    const targetStats = target ? withLiveStats(target.roomIndex, mockStatsFor(target.name)) : null;

    return (
        <Flex alignItems="end" gap={ 2 } className="nitro-player-hud-bar">
            <Flex alignItems="center" gap={ 2 } className="hud-plate">
                <div className="hud-portrait">
                    <HudAvatar figure={ ownFigure } gender={ selfGender } variant="self" />
                    <HudStars wanted={ playerStats.wanted } />
                </div>
                <div className="hud-info">
                    <div className="hud-name-row">
                        <span className="hud-name">{ selfName }</span>
                        <span className={ `hud-state ${ playerStats.aggressive ? 'aggressive' : 'passive' }` }>{ playerStats.aggressive ? 'AGGRESSIVE' : 'PASSIVE' }</span>
                    </div>
                    <HudBars stats={ playerStats } />
                </div>
            </Flex>

            { target && targetStats &&
                <Flex alignItems="center" gap={ 2 } className="hud-plate target">
                    <div className="hud-info mirrored">
                        <div className="hud-name-row">
                            <span className={ `hud-state ${ targetStats.aggressive ? 'aggressive' : 'passive' }` }>{ targetStats.aggressive ? 'AGGRESSIVE' : 'PASSIVE' }</span>
                            <span className="hud-name">{ target.name }</span>
                        </div>
                        <HudBars stats={ targetStats } mirrored />
                    </div>
                    <div className="hud-portrait">
                        <span className="hud-close" title="Clear target" onClick={ closeTarget }>✕</span>
                        <span className={ `hud-lock ${ locked ? 'locked' : '' }` } title={ locked ? 'Unlock target' : 'Lock target' } onClick={ () => setLocked(value => !value) }>
                            { locked ? <FaLock /> : <FaLockOpen /> }
                        </span>
                        <HudAvatar figure={ target.figure } variant="target" direction={ 4 } />
                        <HudStars wanted={ targetStats.wanted } />
                    </div>
                </Flex> }
        </Flex>
    );
}
