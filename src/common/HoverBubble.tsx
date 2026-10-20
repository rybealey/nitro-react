import { cloneElement, FC, ReactElement, RefObject, useId, useState } from 'react';
import { Overlay, OverlayTrigger, OverlayTriggerProps, Tooltip } from 'react-bootstrap';

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
    // [along the edge, away from it] in px: the gap between the child and the
    // bubble, arrow included (our tooltip CSS draws the arrow inside the
    // bubble's padding). Left out, react-bootstrap's own [0, 6]. The infostand
    // passes its 8px panel padding so the arrow meets the panel's edge.
    offset?: [ number, number ];
    // Place the bubble against this element instead of the child, which is
    // still what you hover. The infostand's furni id sits at the right of its
    // row but takes its bubble from the row, so it lines up with the others.
    anchor?: RefObject<HTMLElement>;
    children: ReactElement;
}

export const HoverBubble: FC<HoverBubbleProps> = props =>
{
    const { text = '', placement = 'top', offset = undefined, anchor = undefined, children = null } = props;
    const [ show, setShow ] = useState(false);
    const id = useId();
    const bubble = <Tooltip id={ `hover-bubble-${ id }` }>{ text }</Tooltip>;

    if(anchor)
    {
        return (
            <>
                { cloneElement(children, { onMouseEnter: () => setShow(true), onMouseLeave: () => setShow(false) }) }
                <Overlay target={ anchor } show={ show } placement={ placement } offset={ offset }>
                    { bubble }
                </Overlay>
            </>
        );
    }

    return (
        <OverlayTrigger placement={ placement } offset={ offset } overlay={ bubble }>
            { children }
        </OverlayTrigger>
    );
};
