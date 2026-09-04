import { FC } from 'react';
import { OverlayTrigger, Tooltip } from 'react-bootstrap';
import { CreateLinkEvent } from '../../../../api';
import { Base, Flex } from '../../../../common';
import { useLocalStorage } from '../../../../hooks';

// Center-left edge drawer. Expanded by default; the open/collapsed state is
// persisted per-browser in localStorage so it stays consistent for each player
// across sessions. Buttons without an onClick are placeholders — behaviour
// comes later.
//
// The toggle is a SIBLING of .nitro-side-drawer (the tray), not a child: the
// tray has backdrop-filter, and a backdrop-filtered ancestor becomes the
// backdrop root for its children — a child's own backdrop-filter then samples
// nothing and the tab renders flat and unblurred. As a sibling it's anchored
// absolutely to the container's right edge (same geometry: the container's
// width IS the tray's width), stays out of the icon column's flex flow, and
// its blur actually reaches the room behind it.
const DRAWER_BUTTONS: { key: string; title: string; onClick?: () => void }[] = [
    // key stays 'inventory' - it names the icon file and the CSS class; only
    // the tooltip is player-facing, and the panel itself is called Backpack.
    { key: 'inventory', title: 'Backpack', onClick: () => CreateLinkEvent('rp-inventory/toggle') },
    { key: 'corporations', title: 'Corporations', onClick: () => CreateLinkEvent('rp-corporations/toggle') },
    { key: 'gangs', title: 'Gangs', onClick: () => CreateLinkEvent('rp-gangs/toggle') },
    { key: 'wanted', title: 'Wanted List', onClick: () => CreateLinkEvent('rp-wanted/toggle') },
    { key: 'settings', title: 'Settings', onClick: () => CreateLinkEvent('rp-settings/toggle') },
];

export const SideDrawerWidgetView: FC<{}> = props =>
{
    const [ isExpanded, setIsExpanded ] = useLocalStorage('pixelrp.side-drawer.expanded', true);

    return (
        <Flex alignItems="center" className={ `nitro-side-drawer-container ${ isExpanded ? 'is-expanded' : '' }` }>
            <Flex alignItems="center" gap={ 0 } className="nitro-side-drawer">
                <Base className="side-drawer-items">
                    { /* plain divs, not <Base>: OverlayTrigger anchors via an
                         injected ref, which Base drops (it only wires innerRef) */ }
                    { DRAWER_BUTTONS.map(button => (
                        <OverlayTrigger key={ button.key } placement="right" overlay={ <Tooltip id={ `side-drawer-tooltip-${ button.key }` }>{ button.title }</Tooltip> }>
                            <div className={ `cursor-pointer side-drawer-item ${ button.key }` } onClick={ button.onClick } />
                        </OverlayTrigger>
                    )) }
                </Base>
            </Flex>
            <Base pointer className="side-drawer-toggle" title={ isExpanded ? 'Collapse' : 'Expand' } onClick={ () => setIsExpanded(value => !value) }>
                { isExpanded ? '‹' : '›' }
            </Base>
        </Flex>
    );
};
