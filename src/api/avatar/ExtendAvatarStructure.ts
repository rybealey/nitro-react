import { HabboAvatarAnimations, HabboAvatarGeometry, HabboAvatarPartSets } from '@nitrots/nitro-renderer';

// PixelRP: teach the avatar renderer the part types Habbo added for its Unity
// client - misc items (mc / mcl / mcr) and pets (pt / ptl / ptr).
//
// The renderer draws a part only if its TYPE is listed in a body part of the
// avatar geometry (AvatarStructure.getParts drops anything else without a
// word), and this renderer's tables predate both types. That is the whole
// reason a sword or a pet showed nothing: the sets, the libraries and the
// sprites were all there, and the type was never asked for.
//
// Where they go comes from the sprites themselves. mcl / mcr and ptl / ptr
// ship carry, drink, wave and walk frames - the poses of an ARM - so they sit
// in the arm body parts, just outside the coat sleeve (lc / rc), mirror into
// each other like every other left / right pair, and follow the same walk
// and wave frames. mc and pt are the body-level layer and sit in the torso,
// outermost, above the chest accessory.
//
// The renderer reads these tables once, when its avatar structure
// initialises inside Nitro init, so this runs before bootstrap. It extends
// the renderer's own objects rather than replacing them, and is idempotent,
// so a hot reload that calls it twice changes nothing.

const TORSO_TYPES = [ { id: 'mc', radius: 0.08 }, { id: 'pt', radius: 0.085 } ];
const LEFT_TYPES = [ { id: 'mcl', radius: 0.03 }, { id: 'ptl', radius: 0.035 } ];
const RIGHT_TYPES = [ { id: 'mcr', radius: 0.03 }, { id: 'ptr', radius: 0.035 } ];

// swim is left alone: a swimmer is a head over water and draws nothing else.
const GEOMETRY_TYPES = [ 'vertical', 'sitting', 'horizontal', 'swhorizontal' ];

// Which existing layer each new one takes its animation from.
const ANIMATES_LIKE: Record<string, string> = { mcl: 'lc', ptl: 'lc', mcr: 'rc', ptr: 'rc', mc: 'lg', pt: 'lg' };

let extended = false;

const addItems = (bodyPart: any, items: { id: string, radius: number }[]) =>
{
    if(!bodyPart) return;

    if(!bodyPart.items) bodyPart.items = [];

    for(const item of items)
    {
        if(bodyPart.items.some((existing: any) => (existing.id === item.id))) continue;

        bodyPart.items.push({ id: item.id, x: 0, y: 0, z: 0, radius: item.radius, nx: 0, ny: 0, nz: -1, double: false });
    }
}

const addActive = (activePartSets: any[], id: string, types: string[]) =>
{
    const set = activePartSets.find(entry => (entry.id === id));

    if(!set) return;

    for(const type of types)
    {
        if(set.activeParts.some((part: any) => (part.setType === type))) continue;

        set.activeParts.push({ setType: type });
    }
}

export const ExtendAvatarStructure = (): void =>
{
    if(extended) return;

    extended = true;

    // This runs before the hotel boots, so it must never be the reason it
    // does not: a renderer update that reshapes these tables loses misc items
    // and pets, and everything else still loads.
    try
    {
        extend();
    }
    catch(error)
    {
        console.warn('[pixelrp] could not teach the avatar renderer misc items and pets', error);
    }
}

const extend = (): void =>
{
    const geometry: any = HabboAvatarGeometry.geometry;

    for(const type of geometry.types)
    {
        if(GEOMETRY_TYPES.indexOf(type.id) === -1) continue;

        const bodyPart = (id: string) => type.bodyParts.find((part: any) => (part.id === id));

        addItems(bodyPart('torso'), TORSO_TYPES);
        addItems(bodyPart('leftarm'), LEFT_TYPES);
        addItems(bodyPart('rightarm'), RIGHT_TYPES);
    }

    const partSets: any = HabboAvatarPartSets.partSets;
    const known = (setType: string) => partSets.partSet.some((entry: any) => (entry.setType === setType));

    for(const [ setType, flippedSetType ] of [ [ 'mcl', 'mcr' ], [ 'mcr', 'mcl' ], [ 'ptl', 'ptr' ], [ 'ptr', 'ptl' ] ])
    {
        if(!known(setType)) partSets.partSet.push({ setType, flippedSetType });
    }

    for(const setType of [ 'mc', 'pt' ])
    {
        if(!known(setType)) partSets.partSet.push({ setType });
    }

    const all = [ 'mc', 'mcl', 'mcr', 'pt', 'ptl', 'ptr' ];

    addActive(partSets.activePartSets, 'figure', all);
    addActive(partSets.activePartSets, 'walk', all);
    addActive(partSets.activePartSets, 'sit', [ 'mc', 'pt' ]);
    addActive(partSets.activePartSets, 'handLeft', [ 'mcl' ]);
    addActive(partSets.activePartSets, 'handRight', [ 'mcr' ]);

    // Walk and wave give each layer its frames explicitly. A new layer copies
    // the frames of the layer it moves with, so a sword swings with the hand
    // holding it instead of hanging still while the arm walks away from it.
    for(const animation of (HabboAvatarAnimations.animations as any[]))
    {
        if((animation.id !== 'Move') && (animation.id !== 'Wave')) continue;

        for(const [ setType, source ] of Object.entries(ANIMATES_LIKE))
        {
            if(animation.parts.some((part: any) => (part.setType === setType))) continue;

            const template = animation.parts.find((part: any) => (part.setType === source));

            if(!template) continue;

            animation.parts.push({ ...template, setType, frames: template.frames.map((frame: any) => ({ ...frame })) });
        }
    }
}
