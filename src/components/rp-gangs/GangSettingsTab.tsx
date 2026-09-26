import { FC, useEffect, useState } from 'react';
import { SendMessageComposer } from '../../api';
import { RpGangRenameComposer, RpGangSetColoursComposer } from '../../api/rp-gangs/RpGangMessages';
import { GangDetail } from '../../api/rp-gangs/RpGangTypes';
import { Button, LayoutCurrencyIcon } from '../../common';
import { GangColourPicker, HexToColourInt } from './GangColourPicker';
import { GangCrest } from './GangCrest';

type EditingColor = 'primary' | 'secondary';

const GANG_NAME_MAX_LENGTH = 29;

// Settings tab (owner and admins; Gang Window canvas): the gang's colours,
// and its name - click the name to rename it. The crest previews the colours
// live; Save Colours stays off until something changed, with Undo beside it.
// Renaming costs detail.renameCost credits and the name must not be another
// gang's; the server checks both and charges only on success.
export const GangSettingsTab: FC<{ detail: GangDetail }> = ({ detail }) =>
{
    const [ editing, setEditing ] = useState<EditingColor>('primary');
    const [ primary, setPrimary ] = useState(detail.colourA);
    const [ secondary, setSecondary ] = useState(detail.colourB);
    const [ renaming, setRenaming ] = useState(false);
    const [ draftName, setDraftName ] = useState('');

    // saved colours arriving (ours or someone else's save) reset the picks
    useEffect(() =>
    {
        setPrimary(detail.colourA);
        setSecondary(detail.colourB);
    }, [ detail.colourA, detail.colourB ]);

    // a rename landing closes the editor
    useEffect(() =>
    {
        setRenaming(false);
    }, [ detail.name ]);

    const same = (a: string, b: string) => ((a ?? '').toLowerCase() === (b ?? '').toLowerCase());
    const changed = (!same(primary, detail.colourA) || !same(secondary, detail.colourB));
    const canRename = (draftName.trim().length > 0);

    const saveColours = () =>
    {
        if(!changed) return;

        SendMessageComposer(new RpGangSetColoursComposer(HexToColourInt(primary), HexToColourInt(secondary)));
    }

    const undo = () =>
    {
        setPrimary(detail.colourA);
        setSecondary(detail.colourB);
    }

    const startRename = () =>
    {
        setDraftName(detail.name);
        setRenaming(true);
    }

    const rename = () =>
    {
        if(!canRename) return;

        if(draftName.trim() === detail.name)
        {
            setRenaming(false);

            return;
        }

        SendMessageComposer(new RpGangRenameComposer(draftName.trim()));
    }

    return (
        <>
            <div className="gang-head">
                <div className="gang-crest-plate">
                    <GangCrest primary={ primary } secondary={ secondary } size={ 34 } crop />
                </div>
                <div className="gang-head-info">
                    { !renaming &&
                        <span className="gang-rename" title="Rename gang" onClick={ startRename }>
                            <span className="gang-rename-text">{ detail.name }</span>
                            <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9.5 2.5l2 2L5 11H3V9z" /></svg>
                        </span> }
                    { renaming &&
                        <>
                            <div className="gang-rename-row">
                                <input className="form-control" type="text" maxLength={ GANG_NAME_MAX_LENGTH } autoFocus aria-label="Gang name" value={ draftName }
                                    onChange={ event => setDraftName(event.target.value) }
                                    onKeyDown={ event => { if(event.key === 'Enter') rename(); else if(event.key === 'Escape') setRenaming(false); } } />
                                <span className="gang-chrome-btn" onClick={ () => setRenaming(false) }>Cancel</span>
                                <div className="gang-cost-button">
                                    <span className="gang-cost-tab"><LayoutCurrencyIcon type={ -1 } /> { detail.renameCost }</span>
                                    <Button variant="success" disabled={ !canRename } onClick={ rename }>Rename</Button>
                                </div>
                            </div>
                            <div className="gang-note">Renaming costs { detail.renameCost } credits. The name must not be taken by another gang.</div>
                        </> }
                </div>
            </div>
            <div className="gang-section">
                <div className="gang-section-head">
                    <span className="gang-section-label">Gang colours</span>
                </div>
                <GangColourPicker editing={ editing } onEditing={ setEditing } primary={ primary } secondary={ secondary }
                    onPick={ colour => ((editing === 'primary') ? setPrimary(colour) : setSecondary(colour)) } />
                <div className="gang-settings-actions">
                    { changed &&
                        <span className="gang-chrome-btn" onClick={ undo }>Undo</span> }
                    <Button variant="success" disabled={ !changed } onClick={ saveColours }>Save Colours</Button>
                </div>
            </div>
        </>
    );
}
