import { FC, useMemo } from 'react';
import { FaCaretDown, FaCaretUp } from 'react-icons/fa';
import { Flex, FlexProps } from '../../../../common';
import { ContextMenuPixelArrowView } from './ContextMenuPixelArrowView';

interface CaretViewProps extends FlexProps
{
    collapsed?: boolean;
    pixel?: boolean;
}
export const ContextMenuCaretView: FC<CaretViewProps> = props =>
{
    const { justifyContent = 'center', alignItems = 'center', classNames = [], collapsed = true, pixel = false, ...rest } = props;

    const getClassNames = useMemo(() =>
    {
        const newClassNames: string[] = [ 'menu-footer' ];

        if(classNames.length) newClassNames.push(...classNames);

        return newClassNames;
    }, [ classNames ]);

    return <Flex justifyContent={ justifyContent } alignItems={ alignItems } classNames={ getClassNames } { ...rest }>
        { pixel && <ContextMenuPixelArrowView direction={ collapsed ? 'up' : 'down' } /> }
        { (!pixel && !collapsed) && <FaCaretDown className="fa-icon align-self-center" /> }
        { (!pixel && collapsed) && <FaCaretUp className="fa-icon align-self-center" /> }
    </Flex>
}
