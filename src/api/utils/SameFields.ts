// pixelrp: whether two objects of one class hold the same values - each field
// compared as it is, arrays item by item. For keeping the object already in
// state when a click builds an equal one, so nothing redraws for it.
export const SameFields = <T>(a: T, b: T): boolean =>
{
    if(a === b) return true;

    if(!a || !b || (Object.getPrototypeOf(a) !== Object.getPrototypeOf(b))) return false;

    const keys = Object.keys(a);

    if(keys.length !== Object.keys(b).length) return false;

    for(const key of keys)
    {
        const valueA = a[key];
        const valueB = b[key];

        if(valueA === valueB) continue;

        if(!Array.isArray(valueA) || !Array.isArray(valueB) || (valueA.length !== valueB.length)) return false;

        for(let i = 0; i < valueA.length; i++)
        {
            if(valueA[i] !== valueB[i]) return false;
        }
    }

    return true;
}
