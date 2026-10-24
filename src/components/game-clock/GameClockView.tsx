import { FC } from 'react';
import { IsGameDay, useGameMinutes } from '../../api/environment/GameClock';
import { FormatMinutes, useUnitsPrefs } from '../../api/prefs/UnitsStore';
import { Flex, Text } from '../../common';

// PixelRP: the city's in-game clock (GameClock) in the top-right HUD, right of
// "online" (Twist, 2026-10-18; design: the "HUD clock" canvas, C and "Pixel
// sun and moon"). A pixel sun from 7 AM, a pixel moon from 7 PM - 13x13
// sprites in the purse icons' style (assets/images/game-clock). Written the
// way the phone's 12/24-hour setting says.

export const GameClockView: FC<{}> = props =>
{
    // one in-game minute is 3.75 real seconds; a second's tick is plenty
    const minutes = useGameMinutes(1000);
    // re-render when the 12/24-hour setting changes
    useUnitsPrefs();

    const day = IsGameDay(minutes);

    return (
        <Flex alignItems="center" gap={ 1 } className="nitro-game-clock rounded p-1 px-2" title={ day ? 'Day in the city' : 'Night in the city' }>
            <span className={ `game-clock-icon ${ day ? 'is-sun' : 'is-moon' }` } aria-hidden="true" />
            <Text variant="white" className="text-nowrap">{ FormatMinutes(minutes) }</Text>
        </Flex>
    );
}
