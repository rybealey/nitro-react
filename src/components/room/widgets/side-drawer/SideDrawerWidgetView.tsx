import { FC } from 'react';
import { OverlayTrigger, Tooltip } from 'react-bootstrap';
import { Base, Column, Flex } from '../../../../common';
import { useLocalStorage } from '../../../../hooks';

// Center-left edge drawer. Expanded by default; the open/collapsed state is
// persisted per-browser in localStorage so it stays consistent for each player
// across sessions. The buttons are placeholders for now and intentionally do
// nothing yet — behaviour comes later.
const DRAWER_BUTTONS: { key: string; title: string }[] = [
    { key: 'inventory', title: 'Inventory' },
    { key: 'gangs', title: 'Gangs' },
    { key: 'corporations', title: 'Corporations' },
    { key: 'wanted', title: 'Wanted' },
    { key: 'support', title: 'Support' },
    { key: 'settings', title: 'Settings' },
];

export const SideDrawerWidgetView: FC<{}> = props =>
{
    const [ isExpanded, setIsExpanded ] = useLocalStorage('pixelrp.side-drawer.expanded', true);

    return (
        <Flex alignItems="center" className={ `nitro-side-drawer-container ${ isExpanded ? 'is-expanded' : '' }` }>
            <Column center gap={ 0 } className="nitro-side-drawer">
                <Base className="side-drawer-items">
                    { DRAWER_BUTTONS.map(button => (
                        <OverlayTrigger key={ button.key } placement="right" overlay={ <Tooltip id={ `side-drawer-tooltip-${ button.key }` }>{ button.title }</Tooltip> }>
                            <Base pointer className={ `side-drawer-item ${ button.key }` } />
                        </OverlayTrigger>
                    )) }
                </Base>
                <Base pointer className="side-drawer-toggle" title={ isExpanded ? 'Collapse' : 'Expand' } onClick={ () => setIsExpanded(value => !value) }>
                    { isExpanded ? '‹' : '›' }
                </Base>
            </Column>
        </Flex>
    );
};
