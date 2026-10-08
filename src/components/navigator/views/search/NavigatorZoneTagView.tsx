import { FC } from 'react';
import { NAVIGATOR_ZONE_SAFE, NAVIGATOR_ZONE_TURF, NAVIGATOR_ZONE_UNSAFE } from '../../../../api/rp-navigator/RpNavigatorMessages';
import { useNavigator } from '../../../../hooks';

const LABELS: Record<number, [ string, string ]> = {
    [NAVIGATOR_ZONE_SAFE]: [ 'SAFE', 'is-safe' ],
    [NAVIGATOR_ZONE_UNSAFE]: [ 'UNSAFE', 'is-unsafe' ],
    [NAVIGATOR_ZONE_TURF]: [ 'TURF', 'is-turf' ]
};

// PixelRP: a room row's zone - SAFE, UNSAFE or TURF (a gang turf, which plays
// as unsafe). Nothing until the zones for the search have arrived.
export const NavigatorZoneTagView: FC<{ roomId: number }> = props =>
{
    const { roomId = 0 } = props;
    const { roomZones = null } = useNavigator();
    const zone = roomZones?.get(roomId);
    const label = ((zone !== undefined) ? LABELS[zone] : null);

    if(!label) return null;

    return <span className={ `navigator-zone-tag ${ label[1] }` }>{ label[0] }</span>;
}
