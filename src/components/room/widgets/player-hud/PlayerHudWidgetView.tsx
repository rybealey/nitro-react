import { RoomObjectCategory, RoomObjectType, RoomSessionUserFigureUpdateEvent } from '@nitrots/nitro-renderer';
import { FC, useState } from 'react';
import { FaLock, FaLockOpen } from 'react-icons/fa';
import { AvatarInfoUser, AvatarInfoUtilities, GetSessionDataManager, RoomWidgetUpdateRoomObjectEvent } from '../../../../api';
import { Flex, LayoutAvatarImageView } from '../../../../common';
import { useRoom, useRoomSessionManagerEvent, useUiEvent } from '../../../../hooks';

// The stat values (health, energy, aggression, wanted level, passive/aggressive)
// are MOCKED — there's no live RP data source wired up yet. Only the avatar
// figures and names are real. Swap PLAYER_STATS / mockStatsFor for real data
// once the backend exists.
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

const PLAYER_STATS: HudStats = { hp: 100, hpMax: 120, energy: 99, energyMax: 100, aggro: 45, wanted: 0, aggressive: false };

// Deterministic pseudo-stats derived from the name, so each target reads as
// distinct but stays stable for the same user.
const mockStatsFor = (name: string): HudStats =>
{
    let hash = 0;

    for(let i = 0; i < name.length; i++) hash = (((hash * 31) + name.charCodeAt(i)) >>> 0);

    const aggressive = ((hash % 3) === 0);

    return {
        hp: (45 + (hash % 55)),
        hpMax: 100,
        energy: (30 + ((hash >> 3) % 70)),
        energyMax: 100,
        aggro: aggressive ? (55 + (hash % 45)) : 0,
        wanted: (hash % 6),
        aggressive
    };
};

const HudStars: FC<{ wanted: number }> = ({ wanted }) =>
{
    return (
        <div className="hud-stars">
            { [ 0, 1, 2, 3, 4 ].map(index => <span key={ index } className={ (index < wanted) ? 'on' : 'off' }>{ (index < wanted) ? '★' : '☆' }</span>) }
        </div>
    );
}

const HudBars: FC<{ stats: HudStats, mirrored?: boolean }> = ({ stats, mirrored = false }) =>
{
    const rows = [
        { key: 'hp', cls: 'hp', pct: Math.round((stats.hp / stats.hpMax) * 100), text: `${ stats.hp } / ${ stats.hpMax }` },
        { key: 'en', cls: 'en', pct: Math.round((stats.energy / stats.energyMax) * 100), text: `${ stats.energy } / ${ stats.energyMax }` }
    ];

    return (
        <div className={ `hud-bars ${ mirrored ? 'mirrored' : '' }` }>
            { rows.map(row => (
                <div key={ row.key } className="hud-bar">
                    <div className={ `hud-bar-fill ${ row.cls }` } style={ { width: `${ row.pct }%` } } />
                    <span className="hud-bar-value">{ row.text }</span>
                </div>
            )) }
            { stats.aggressive &&
                <div className="hud-bar aggro"><div className="hud-bar-fill agg" style={ { width: `${ stats.aggro }%` } } /></div> }
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
    const { roomSession } = useRoom();

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

    const selfName = (GetSessionDataManager().userName ?? '');
    const selfGender = GetSessionDataManager().gender;
    const targetStats = target ? mockStatsFor(target.name) : null;

    return (
        <Flex alignItems="end" gap={ 2 } className="nitro-player-hud-bar">
            <Flex alignItems="center" gap={ 2 } className="hud-plate">
                <div className="hud-portrait">
                    <HudAvatar figure={ ownFigure } gender={ selfGender } variant="self" />
                    <HudStars wanted={ PLAYER_STATS.wanted } />
                </div>
                <div className="hud-info">
                    <div className="hud-name-row">
                        <span className="hud-name">{ selfName }</span>
                        <span className={ `hud-state ${ PLAYER_STATS.aggressive ? 'aggressive' : 'passive' }` }>{ PLAYER_STATS.aggressive ? 'AGGRESSIVE' : 'PASSIVE' }</span>
                    </div>
                    <HudBars stats={ PLAYER_STATS } />
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
