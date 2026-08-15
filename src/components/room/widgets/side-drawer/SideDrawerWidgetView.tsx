import { FC, useState } from 'react';
import { Base, Column, Flex } from '../../../../common';

// Center-left edge drawer. Collapsed by default (just the chevron tab);
// expanding slides out the button stack. The buttons are placeholders for now
// and intentionally do nothing yet — behaviour comes later.
const DRAWER_BUTTONS: { key: string; title: string }[] = [
    { key: 'backpack', title: 'Backpack' },
    { key: 'gang', title: 'Gang' },
    { key: 'wanted', title: 'Wanted List' },
    { key: 'tickets', title: 'Tickets' },
];

export const SideDrawerWidgetView: FC<{}> = props =>
{
    const [ isExpanded, setIsExpanded ] = useState(false);

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
