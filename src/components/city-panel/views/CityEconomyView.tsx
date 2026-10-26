import { FC, useState } from 'react';
import { CityCapability } from '../../../api/rp-city/RpCityMessages';
import { CityPanelBoundary } from '../CityPanelBoundary';
import { CityPanelContext } from '../CityPanelView';
import { CityBinSearchView } from './CityBinSearchView';
import { CityCorporationsView } from './CityCorporationsView';
import { CityLedgerView } from './CityLedgerView';
import { CityTradesView } from './CityTradesView';

// The City Panel's Economy tab: a menu of views on the city's money. Global
// Ledger is every movement of it, Trade History every backpack trade, and
// Corporations is pay, shifts and prices. Bin Search is what searching a bin
// can turn up.

type View = 'ledger' | 'trades' | 'corporations' | 'bins';

interface ViewEntry
{
    key: View;
    label: string;
    /** Listed, not yet built. */
    soon?: boolean;
}

const VIEWS: ViewEntry[] = [
    { key: 'ledger', label: 'Global Ledger' },
    { key: 'trades', label: 'Trade History' },
    { key: 'corporations', label: 'Corporations' },
    { key: 'bins', label: 'Bin Search' }
];

export const CityEconomyView: FC<{ context: CityPanelContext }> = props =>
{
    const { context } = props;
    // Every player's money and trades are in the ledger and the history, so
    // both need the Economy permission; whoever lacks it starts on Corporations.
    const canLedger = ((context.capabilities & CityCapability.Economy) === CityCapability.Economy);
    const [ view, setView ] = useState<View>(canLedger ? 'ledger' : 'corporations');

    const restricted = (key: View) => ((key === 'ledger') || (key === 'trades'));
    const enabled = (entry: ViewEntry) => (!entry.soon && (!restricted(entry.key) || canLedger));
    const current = (restricted(view) && !canLedger) ? 'corporations' : view;

    return (
        <div className="city-economy-page">
            <div className="mt-seg city-economy-nav" role="tablist" aria-label="Economy">
                { VIEWS.map(entry =>
                    <button key={ entry.key } type="button" role="tab" aria-selected={ (current === entry.key) } disabled={ !enabled(entry) }
                        title={ entry.soon ? 'Coming soon' : (restricted(entry.key) && !canLedger) ? 'Needs the Economy permission' : undefined }
                        className={ `mt-seg-button${ (current === entry.key) ? ' is-on' : '' }` } onClick={ () => setView(entry.key) }>
                        { entry.label }
                        { entry.soon && <span className="city-soon">Soon</span> }
                    </button>) }
            </div>
            <div className="city-economy-body">
                <CityPanelBoundary where={ VIEWS.find(entry => (entry.key === current))?.label ?? current }>
                    { (current === 'ledger') && <CityLedgerView /> }
                    { (current === 'trades') && <CityTradesView /> }
                    { (current === 'corporations') && <CityCorporationsView context={ context } /> }
                    { (current === 'bins') && <CityBinSearchView context={ context } /> }
                </CityPanelBoundary>
            </div>
        </div>
    );
}
