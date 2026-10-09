import { FC, useState } from 'react';
import { CityCapability } from '../../../api/rp-city/RpCityMessages';
import { CityPanelContext } from '../CityPanelView';
import { CityCorporationsView } from './CityCorporationsView';
import { CityLedgerView } from './CityLedgerView';

// The City Panel's Economy tab: a menu of views on the city's money. Global
// Ledger is every movement of it, Corporations is pay, shifts and prices.
// Trade History waits on the trading overhaul and is only listed for now.

type View = 'ledger' | 'trades' | 'corporations';

interface ViewEntry
{
    key: View;
    label: string;
    /** Listed, not yet built. */
    soon?: boolean;
}

const VIEWS: ViewEntry[] = [
    { key: 'ledger', label: 'Global Ledger' },
    { key: 'trades', label: 'Trade History', soon: true },
    { key: 'corporations', label: 'Corporations' }
];

export const CityEconomyView: FC<{ context: CityPanelContext }> = props =>
{
    const { context } = props;
    // Every player's money is in the ledger, so it needs the Economy
    // permission; whoever lacks it starts on Corporations.
    const canLedger = ((context.capabilities & CityCapability.Economy) === CityCapability.Economy);
    const [ view, setView ] = useState<View>(canLedger ? 'ledger' : 'corporations');

    const enabled = (entry: ViewEntry) => (!entry.soon && ((entry.key !== 'ledger') || canLedger));
    const current = ((view === 'ledger') && !canLedger) ? 'corporations' : view;

    return (
        <div className="city-economy-page">
            <div className="mt-seg city-economy-nav" role="tablist" aria-label="Economy">
                { VIEWS.map(entry =>
                    <button key={ entry.key } type="button" role="tab" aria-selected={ (current === entry.key) } disabled={ !enabled(entry) }
                        title={ entry.soon ? 'Coming soon' : ((entry.key === 'ledger') && !canLedger) ? 'Needs the Economy permission' : undefined }
                        className={ `mt-seg-button${ (current === entry.key) ? ' is-on' : '' }` } onClick={ () => setView(entry.key) }>
                        { entry.label }
                        { entry.soon && <span className="city-soon">Soon</span> }
                    </button>) }
            </div>
            <div className="city-economy-body">
                { (current === 'ledger') && <CityLedgerView /> }
                { (current === 'corporations') && <CityCorporationsView context={ context } /> }
            </div>
        </div>
    );
}
