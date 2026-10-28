import { FC, Fragment } from 'react';

// The building's lots drawn as a Habbo floor seen at an angle (the
// "Apartments" canvas, B + C). Lot (x, y) is lot y * grid + x, as the
// emulator counts them: x runs down to the right, y down to the left.
//
// Before buying, the centre lot is lit with an arrow over it. Once owned,
// their lots are orange with low walls on their back edges - the door on the
// westernmost one, as RpApartments.FloorPlan puts it - and every lot sharing a
// side with them carries a pin badge: hover lifts it, a click picks the lot.

const TILE_W = 30; // half a lot's width on screen
const TILE_H = 15; // half its height
const TOP_X = 160;
const TOP_Y = 50;
const WALL = 12; // the room's walls, low so the lots behind still show
const BACK_WALL = 40; // the building's own back walls

export const APARTMENT_FLOOR_WIDTH = 320;
export const APARTMENT_FLOOR_HEIGHT = 212;

interface ApartmentFloorPlanProps
{
    grid: number;
    /** The lots they own; empty before buying. */
    owned: Set<number>;
    /** The lot for sale before buying, lit with an arrow. -1 once owned. */
    forSale: number;
    /** Lots that can be bought next - sharing a side with an owned one. */
    addable: Set<number>;
    picked: number;
    hover: number;
    onPick: (lot: number) => void;
    onHover: (lot: number) => void;
}

const Top = (x: number, y: number) => ({ x: TOP_X + (x - y) * TILE_W, y: TOP_Y + (x + y) * TILE_H });

const Diamond = (x: number, y: number) =>
{
    const t = Top(x, y);

    return `${ t.x },${ t.y } ${ t.x + TILE_W },${ t.y + TILE_H } ${ t.x },${ t.y + TILE_H * 2 } ${ t.x - TILE_W },${ t.y + TILE_H }`;
}

// A point a fraction of the way along an edge, raised by `up` pixels.
const Along = (a: { x: number, y: number }, b: { x: number, y: number }, f: number, up: number = 0) => `${ a.x + (b.x - a.x) * f },${ a.y + (b.y - a.y) * f - up }`;

/** The lot the door is on: the westernmost (smallest x), nearest the middle row - RpApartments.FloorPlan's rule. */
export const DoorLot = (owned: Set<number>, grid: number) =>
{
    let door = -1;

    owned.forEach(lot =>
    {
        if(door < 0)
        {
            door = lot;
            return;
        }

        const [ x, y ] = [ lot % grid, Math.floor(lot / grid) ];
        const [ dx, dy ] = [ door % grid, Math.floor(door / grid) ];
        const middle = Math.floor(grid / 2);

        if((x < dx) || ((x === dx) && (Math.abs(y - middle) < Math.abs(dy - middle)))) door = lot;
    });

    return door;
}

/** Whether a lot shares a side with one of these - up, down, left or right; corners do not count. */
export const IsNextTo = (owned: Set<number>, lot: number, grid: number) =>
{
    const x = lot % grid;
    const y = Math.floor(lot / grid);

    return ((x > 0) && owned.has(lot - 1)) || ((x < grid - 1) && owned.has(lot + 1)) || ((y > 0) && owned.has(lot - grid)) || ((y < grid - 1) && owned.has(lot + grid));
}

export const ApartmentFloorPlan: FC<ApartmentFloorPlanProps> = props =>
{
    const { grid, owned, forSale, addable, picked, hover, onPick, onHover } = props;

    const lots: number[] = [];

    for(let lot = 0; lot < grid * grid; lot++) lots.push(lot);

    // Back to front, so nearer walls and badges cover farther ones.
    const order = [ ...lots ].sort((a, b) => ((a % grid) + Math.floor(a / grid)) - ((b % grid) + Math.floor(b / grid)) || ((a % grid) - (b % grid)));

    const top = Top(0, 0);
    const right = Top(grid, 0);
    const bottom = Top(grid, grid);
    const left = Top(0, grid);
    const door = DoorLot(owned, grid);

    const fill = (lot: number) =>
    {
        if(owned.has(lot) || (lot === forSale)) return '#f59436';

        if(addable.has(lot)) return (hover === lot) ? '#ffd9b3' : '#fde8d4';

        return '#e6e9ec';
    };

    const walls = order.filter(lot => owned.has(lot)).map(lot =>
    {
        const x = lot % grid;
        const y = Math.floor(lot / grid);
        const t = Top(x, y);
        const l = { x: t.x - TILE_W, y: t.y + TILE_H };
        const r = { x: t.x + TILE_W, y: t.y + TILE_H };
        const west = !((x > 0) && owned.has(lot - 1));
        const north = !((y > 0) && owned.has(lot - grid));

        return (
            <g key={ lot }>
                { west &&
                    <Fragment>
                        <polygon points={ `${ l.x },${ l.y } ${ t.x },${ t.y } ${ t.x },${ t.y - WALL } ${ l.x },${ l.y - WALL }` } fill="#ffffff" />
                        <polyline points={ `${ l.x },${ l.y - WALL } ${ t.x },${ t.y - WALL }` } fill="none" stroke="#a9b3bd" strokeWidth="1" />
                        { (lot === door) && <polygon points={ `${ Along(l, t, 0.35) } ${ Along(l, t, 0.55) } ${ Along(l, t, 0.55, 9) } ${ Along(l, t, 0.35, 9) }` } fill="#c9ced4" /> }
                    </Fragment> }
                { north &&
                    <Fragment>
                        <polygon points={ `${ t.x },${ t.y } ${ r.x },${ r.y } ${ r.x },${ r.y - WALL } ${ t.x },${ t.y - WALL }` } fill="#e6e9ec" />
                        <polyline points={ `${ t.x },${ t.y - WALL } ${ r.x },${ r.y - WALL }` } fill="none" stroke="#a9b3bd" strokeWidth="1" />
                        <polygon points={ `${ Along(t, r, 0.27, 3) } ${ Along(t, r, 0.53, 3) } ${ Along(t, r, 0.53, 9) } ${ Along(t, r, 0.27, 9) }` } fill="#ffc679" />
                    </Fragment> }
            </g>
        );
    });

    const sale = (forSale >= 0) ? Top(forSale % grid, Math.floor(forSale / grid)) : null;

    return (
        <div className="ap-floor" style={ { width: APARTMENT_FLOOR_WIDTH, height: APARTMENT_FLOOR_HEIGHT } }>
            <svg role="img" aria-label="Floor plan of the lots in this building" width={ APARTMENT_FLOOR_WIDTH } height={ APARTMENT_FLOOR_HEIGHT } viewBox={ `0 0 ${ APARTMENT_FLOOR_WIDTH } ${ APARTMENT_FLOOR_HEIGHT }` } shapeRendering="crispEdges">
                <polygon points={ `${ left.x },${ left.y } ${ top.x },${ top.y } ${ top.x },${ top.y - BACK_WALL } ${ left.x },${ left.y - BACK_WALL }` } fill="#eceef1" />
                <polygon points={ `${ top.x },${ top.y } ${ right.x },${ right.y } ${ right.x },${ right.y - BACK_WALL } ${ top.x },${ top.y - BACK_WALL }` } fill="#dfe2e6" />
                <polyline points={ `${ left.x },${ left.y - BACK_WALL } ${ top.x },${ top.y - BACK_WALL } ${ right.x },${ right.y - BACK_WALL }` } fill="none" stroke="#a9b3bd" strokeWidth="1" />
                <polygon points={ `${ left.x },${ left.y } ${ bottom.x },${ bottom.y } ${ bottom.x },${ bottom.y + 7 } ${ left.x },${ left.y + 7 }` } fill="#c9ced4" />
                <polygon points={ `${ bottom.x },${ bottom.y } ${ right.x },${ right.y } ${ right.x },${ right.y + 7 } ${ bottom.x },${ bottom.y + 7 }` } fill="#a9b3bd" />
                <g stroke="#ffffff" strokeWidth="2">
                    { lots.map(lot => <polygon key={ lot } points={ Diamond(lot % grid, Math.floor(lot / grid)) } fill={ fill(lot) } />) }
                </g>
                { (picked >= 0) && <polygon points={ Diamond(picked % grid, Math.floor(picked / grid)) } fill="#ffc48f" stroke="#e87332" strokeWidth="2" /> }
                { sale &&
                    <Fragment>
                        <polygon points={ `${ sale.x },${ sale.y + 4 } ${ sale.x + 24 },${ sale.y + 15 } ${ sale.x },${ sale.y + 26 } ${ sale.x - 24 },${ sale.y + 15 }` } fill="none" stroke="#ffc679" strokeWidth="1" />
                        <polygon points={ `${ sale.x - 8 },${ sale.y - 18 } ${ sale.x + 8 },${ sale.y - 18 } ${ sale.x },${ sale.y - 8 }` } fill="#b35400" />
                        <rect x={ sale.x - 3 } y={ sale.y - 26 } width="6" height="8" fill="#b35400" />
                    </Fragment> }
                { walls }
            </svg>
            { order.filter(lot => !owned.has(lot) && (lot !== forSale)).map(lot =>
            {
                const t = Top(lot % grid, Math.floor(lot / grid));
                const canAdd = addable.has(lot);
                const isPicked = (lot === picked);
                const lit = isPicked || (hover === lot);

                return (
                    <div key={ lot } className="ap-lot-hit" data-lot={ lot } style={ { left: t.x - TILE_W, top: t.y } }>
                        <button type="button" className={ `ap-lot-area${ canAdd ? ' can-add' : '' }` } aria-label={ canAdd ? 'Lot you can buy' : 'Lot not next to yours' } onClick={ () => onPick(lot) } onMouseEnter={ () => onHover(lot) } onMouseLeave={ () => onHover(-1) } />
                        { canAdd &&
                            <button type="button" tabIndex={ -1 } aria-hidden="true" className="ap-pin" onClick={ () => onPick(lot) } onMouseEnter={ () => onHover(lot) } onMouseLeave={ () => onHover(-1) }>
                                <svg width="14" height="32" viewBox="-7 -27 14 32" shapeRendering="crispEdges">
                                    <polygon points="0,-2 7,1 0,4 -7,1" fill="#000000" fillOpacity={ (hover === lot) ? 0.14 : 0.18 } />
                                    <g transform={ (hover === lot && !isPicked) ? 'translate(0 -3)' : undefined }>
                                        <rect x="-6" y="-23" width="12" height="12" rx="2" fill={ lit ? '#e87332' : '#ffffff' } stroke={ lit ? '#c9601f' : '#e87332' } strokeWidth="1" />
                                        <polygon points="-3,-11 3,-11 0,-7" fill={ lit ? '#c9601f' : '#e87332' } />
                                        { isPicked
                                            ? <g fill="#ffffff"><rect x="-4" y="-18" width="2" height="2" /><rect x="-2" y="-16" width="2" height="2" /><rect x="0" y="-18" width="2" height="2" /><rect x="2" y="-20" width="2" height="2" /></g>
                                            : <g fill={ (hover === lot) ? '#ffffff' : '#e87332' }><rect x="-1" y="-20" width="2" height="6" /><rect x="-3" y="-18" width="6" height="2" /></g> }
                                    </g>
                                </svg>
                            </button> }
                    </div>
                );
            }) }
        </div>
    );
}

/**
 * The lot shape alone, small - the real estate board's rows and size line
 * (the "Real Estate board" canvas board): every lot grey, the apartment's
 * orange, no walls.
 */
export const ApartmentLotShape: FC<{ grid: number, lots: number[], width: number, height: number, gap?: number }> = props =>
{
    const { grid, lots, width, height, gap = 7 } = props;
    const owned = new Set(lots);
    const top = Top(0, 0);
    const right = Top(grid, 0);
    const bottom = Top(grid, grid);
    const left = Top(0, grid);
    const all: number[] = [];

    for(let lot = 0; lot < grid * grid; lot++) all.push(lot);

    return (
        <svg aria-hidden="true" width={ width } height={ height } viewBox={ `${ left.x } ${ top.y - 2 } ${ right.x - left.x } ${ bottom.y - top.y + 4 }` } shapeRendering="crispEdges">
            <polygon points={ `${ top.x },${ top.y } ${ right.x },${ right.y } ${ bottom.x },${ bottom.y } ${ left.x },${ left.y }` } fill="#e6e9ec" />
            <g stroke="#ffffff" strokeWidth={ gap }>
                { all.map(lot => <polygon key={ lot } points={ Diamond(lot % grid, Math.floor(lot / grid)) } fill={ owned.has(lot) ? '#f59436' : '#e6e9ec' } />) }
            </g>
        </svg>
    );
}
