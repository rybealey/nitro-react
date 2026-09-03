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
// The toggle stays a CHILD of .nitro-side-drawer (the tray) because the CSS
// anchors it absolutely to the tray's right edge as a notch — it must not sit
// in the icon column's flex flow, or it pushes the icons off the tray's
// center axis.
const DRAWER_BUTTONS: { key: string; title: string; onClick?: () => void }[] = [
    { key: 'inventory', title: 'Inventory', onClick: () => CreateLinkEvent('rp-inventory/toggle') },
    { key: 'corporations', title: 'Corporations', onClick: () => CreateLinkEvent('rp-corporations/toggle') },
    { key: 'gangs', title: 'Gangs' },
    { key: 'wanted', title: 'Wanted List', onClick: () => CreateLinkEvent('rp-wanted/toggle') },
    { key: 'support', title: 'Support' },
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
                <Base pointer className="side-drawer-toggle" title={ isExpanded ? 'Collapse' : 'Expand' } onClick={ () => setIsExpanded(value => !value) }>
                    { isExpanded ? '‹' : '›' }
                </Base>
            </Flex>
        </Flex>
    );
};
