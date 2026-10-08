export interface INavigatorSearchFilter
{
    name: string;
    query: string;
    /** pixelrp: shown if the gamedata text for this filter has not reached the client yet */
    fallback?: string;
}
