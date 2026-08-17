import { FC } from 'react';
import { Base, Column, Flex } from '../../../../common';
import { useLocalStorage } from '../../../../hooks';

// Center-left edge drawer. Expanded by default; the open/collapsed state is
// persisted per-browser in localStorage so it stays consistent for each player
// across sessions. The buttons are placeholders for now and intentionally do
// nothing yet — behaviour comes later.
const DRAWER_BUTTONS: { key: string; title: string }[] = [
    { key: 'backpack', title: 'Backpack' },
    { key: 'gang', title: 'Gang' },
    { key: 'wanted', title: 'Wanted List' },
    { key: 'tickets', title: 'Tickets' },
];

export const SideDrawerWidgetView: FC<{}> = props =>
{
    const [ isExpanded, setIsExpanded ] = useLocalStorage('pixelrp.side-drawer.expanded', true);

    return (
        <Flex alignItems="center" className={ `nitro-side-drawer-container ${ isExpanded ? 'is-expanded' : '' }` }>
            <Column center gap={ 0 } className="nitro-side-drawer">
                <Base className="side-drawer-items">
                    { DRAWER_BUTTONS.map(button => (
                        <Base key={ button.key } pointer title={ button.title } className={ `side-drawer-item ${ button.key }` } />
                    )) }
                </Base>
                <Base pointer className="side-drawer-toggle" title={ isExpanded ? 'Collapse' : 'Expand' } onClick={ () => setIsExpanded(value => !value) }>
                    { isExpanded ? '‹' : '›' }
                </Base>
            </Column>
        </Flex>
    );
};
