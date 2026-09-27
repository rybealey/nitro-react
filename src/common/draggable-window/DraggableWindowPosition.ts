export class DraggableWindowPosition
{
    public static CENTER: string = 'DWP_CENTER';
    public static TOP_CENTER: string = 'DWP_TOP_CENTER';
    public static TOP_LEFT: string = 'DWP_TOP_LEFT';
    // PixelRP: hard against the left of the viewport, clear of the side
    // drawer - where the windows the drawer opens belong, beside the button
    // that opened them rather than over the middle of the room.
    public static SIDE_DRAWER: string = 'DWP_SIDE_DRAWER';
    // PixelRP: the top right, just under the purse row (measured) and in
    // line with its right edge - where Chat History's own button lives.
    public static TOP_RIGHT: string = 'DWP_TOP_RIGHT';
    public static NOTHING: string = 'DWP_NOTHING';
}
