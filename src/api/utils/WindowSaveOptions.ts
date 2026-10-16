export interface WindowSaveOptions
{
    offset: { x: number, y: number };
    size: { width: number, height: number };
    // PixelRP: the windowPosition the offset was dragged against. The anchored
    // positions (SIDE_DRAWER, TOP_RIGHT) are measured from a live element, so
    // an offset saved against a different anchor - or from before this was
    // tracked - points somewhere nobody chose for the current layout. The
    // first open under a new anchor drops it rather than applying it to a base
    // it was never measured from.
    offsetPosition?: string;
}
