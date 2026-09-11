export interface WindowSaveOptions
{
    offset: { x: number, y: number };
    size: { width: number, height: number };
    // PixelRP: set once a SIDE_DRAWER window has been re-anchored beside the
    // drawer. An offset saved against the old centred default means something
    // different against the new one, so the first open after the change drops
    // it rather than applying it to a base it was never measured from.
    drawerAnchored?: boolean;
}
