import { FC, ReactElement, useId } from 'react';
import { OverlayTrigger, OverlayTriggerProps, Tooltip } from 'react-bootstrap';

// The side drawer's hover bubble (react-bootstrap Tooltip) for any HUD
// control, in place of the browser's own title tooltip, which is unstyled and
// slow to appear.
//
// The child must be a plain DOM element (<div>, <span>, <i>), not <Base>:
// OverlayTrigger anchors through an injected ref, which Base drops (it only
// wires innerRef). And no title on the child, or both bubbles show.
interface HoverBubbleProps
{
    text: string;
    placement?: OverlayTriggerProps['placement'];
    // Extra class on the bubble itself (it portals to <body>, so style it at top level).
    className?: string;
    // Keeps the bubble shut, e.g. while something is being dragged over it.
    hidden?: boolean;
    children: ReactElement;
}

export const HoverBubble: FC<HoverBubbleProps> = props =>
{
    const { text = '', placement = 'top', className = undefined, hidden = false, children = null } = props;
    const id = useId();

    return (
        <OverlayTrigger placement={ placement } show={ hidden ? false : undefined } overlay={ <Tooltip id={ `hover-bubble-${ id }` } className={ className }>{ text }</Tooltip> }>
            { children }
        </OverlayTrigger>
    );
};
