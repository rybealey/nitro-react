import { FC, useEffect, useRef, useState } from 'react';
import { SendRpCatalogRenameFurni } from '../../../../../api/rp-furni/RpFurniMessages';
import { CanUseFurniFunction } from '../../../../../api/rp-rights/RpRoomRightsMessages';
import { Text } from '../../../../../common';
import { useCatalog } from '../../../../../hooks';

/**
 * The product name in the shop, editable in place by staff.
 *
 * The Function tool could already rename a furni, but only one PLACED in the
 * room you are standing in - so tidying up a catalogue page meant buying the
 * piece first. This is the same edit made where the name is actually wrong.
 *
 * Gated on the same rp_furni_function permission the Function tool uses, which
 * is rank 5 and up. The gate is a courtesy: RpCatalogRenameFurniEvent checks it
 * again, and resolves the offer through the catalog rather than trusting the
 * id, so a crafted packet reaches nothing a staff member could not.
 *
 * The rename lands hotel-wide, so it is not applied optimistically - the name
 * shown stays whatever the server last said until the catalog is reopened.
 */
export const CatalogEditableNameView: FC<{}> = props =>
{
    const { currentOffer = null } = useCatalog();
    const [ editing, setEditing ] = useState(false);
    const [ draft, setDraft ] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);

    // A new selection abandons an edit in progress: the box would otherwise
    // still be holding the previous furni's name over a different product.
    useEffect(() =>
    {
        setEditing(false);
    }, [ currentOffer ]);

    useEffect(() =>
    {
        if(editing) inputRef.current?.select();
    }, [ editing ]);

    if(!currentOffer) return null;

    const canRename = CanUseFurniFunction();

    const begin = () =>
    {
        if(!canRename) return;

        setDraft(currentOffer.localizationName ?? '');
        setEditing(true);
    }

    const commit = () =>
    {
        const name = draft.trim();

        setEditing(false);

        // Nothing to say, or nothing changed - the server would refuse a blank
        // anyway, and this saves the round trip.
        if(!name.length || (name === currentOffer.localizationName)) return;

        SendRpCatalogRenameFurni(currentOffer.offerId, name);
    }

    if(!editing)
    {
        return (
            <Text grow truncate pointer={ canRename } onClick={ begin }
                title={ canRename ? 'Rename this furni' : undefined }>
                { currentOffer.localizationName }
            </Text>
        );
    }

    return (
        <input ref={ inputRef } type="text" className="form-control form-control-sm" value={ draft }
            maxLength={ 56 } spellCheck={ false } autoFocus
            onChange={ event => setDraft(event.target.value) }
            onBlur={ commit }
            onKeyDown={ event =>
            {
                if(event.key === 'Enter') commit();
                // Escape leaves the name alone; blur would otherwise commit it.
                if(event.key === 'Escape') setEditing(false);
            } } />
    );
}
