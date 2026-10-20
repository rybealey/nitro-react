import { FC, useEffect, useRef, useState } from 'react';
import { IPurchasableOffer, Offer, SearchOffer } from '../../../../../api';
import { AddFurniFunctionListener, SendRpCatalogRenameFurni } from '../../../../../api/rp-furni/RpFurniMessages';
import { CanEditShop } from '../../../../../api/rp-rights/RpRanks';
import { Base, Flex, Text } from '../../../../../common';
import { useCatalog } from '../../../../../hooks';

// How long a rename may wait for the server's word before the old name comes
// back. The server says nothing when it refuses one, so silence is the refusal.
const RENAME_CONFIRM_MS = 5000;

// The page this offer came on still holds the name it was sent with, and the
// shop does not ask for the page again on its own - so the name the server
// just accepted is written into the offer, exactly as a fresh page would
// carry it: an Offer's name is read from its catalog name, a search tile's
// from its own.
const RenameOffer = (offer: IPurchasableOffer, name: string) =>
{
    if(offer instanceof Offer) (offer as any)._localizationId = name;
    else if(offer instanceof SearchOffer) (offer as any)._name = name;
}

/**
 * The product name in the shop, editable in place by staff.
 *
 * The Function tool could already rename a furni, but only one PLACED in the
 * room you are standing in - so tidying up a catalogue page meant buying the
 * piece first. This is the same edit made where the name is actually wrong.
 *
 * Open from Builder up (CanEditShop), not on the Function tool's
 * rp_furni_function. The gate is a courtesy: RpCatalogRenameFurniEvent checks
 * it again, and resolves the offer through the catalog rather than trusting the
 * id - below staff only on shelves that rank can buy from - so a crafted packet
 * reaches nothing its sender could not see.
 *
 * The rename lands hotel-wide, so the typed name is only shown while the
 * server is asked: its broadcast of the renamed furni (RpFurniFunctionComposer,
 * which every client gets) is the confirmation, and only then is the offer
 * itself renamed. No word back within RENAME_CONFIRM_MS and the old name
 * returns. Before this the title went straight back to the old name on every
 * rename, accepted or not, until the page was opened again.
 */
export const CatalogEditableNameView: FC<{}> = props =>
{
    const { currentOffer = null, currentPage = null } = useCatalog();
    const [ editing, setEditing ] = useState(false);
    const [ draft, setDraft ] = useState('');
    const [ , setRenameTick ] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);
    const pending = useRef<{ offer: IPurchasableOffer, name: string, timer: ReturnType<typeof setTimeout> }>(null);

    const refresh = () => setRenameTick(value => (value + 1));

    // The server's word on a rename: the renamed furni's record, carrying the
    // name exactly as it was saved.
    useEffect(() => AddFurniFunctionListener(data =>
    {
        const wait = pending.current;

        if(!wait || (data.spriteId !== wait.offer.product?.productClassId) || (data.publicName !== wait.name)) return;

        clearTimeout(wait.timer);
        pending.current = null;

        RenameOffer(wait.offer, wait.name);

        // A search tile is a different object from the offer it opened.
        for(const offer of (currentPage?.offers ?? []))
        {
            if((offer !== wait.offer) && (offer.offerId === wait.offer.offerId)) RenameOffer(offer, wait.name);
        }

        refresh();
    }), [ currentPage ]);

    useEffect(() => () =>
    {
        if(pending.current) clearTimeout(pending.current.timer);
    }, []);

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

    const canRename = CanEditShop();
    const shownName = ((pending.current?.offer.offerId === currentOffer.offerId) ? pending.current.name : currentOffer.localizationName);

    const begin = () =>
    {
        if(!canRename) return;

        setDraft(shownName ?? '');
        setEditing(true);
    }

    const commit = () =>
    {
        const name = draft.trim();

        setEditing(false);

        // Nothing to say, or nothing changed - the server would refuse a blank
        // anyway, and this saves the round trip. Enter and the blur that
        // follows it both land here, the blur from a render before the first
        // was sent - so it is caught on the ref, not on shownName.
        if(!name.length || (name === shownName)) return;
        if((pending.current?.offer === currentOffer) && (pending.current.name === name)) return;

        if(pending.current) clearTimeout(pending.current.timer);

        const offer = currentOffer;

        pending.current = { offer, name, timer: setTimeout(() =>
        {
            if(pending.current?.offer !== offer) return;

            pending.current = null;
            refresh();
        }, RENAME_CONFIRM_MS) };

        refresh();
        SendRpCatalogRenameFurni(offer.offerId, name);
    }

    if(!editing)
    {
        if(!canRename) return <Text grow truncate>{ shownName }</Text>;

        // Habbo's own pencil, as the infostand marks an editable motto, right
        // after the name so it reads as "this name can be changed".
        return (
            <Flex alignItems="center" gap={ 1 } pointer onClick={ begin } title="Rename this furni">
                <Text truncate>{ shownName }</Text>
                <Base className="icon pencil-icon flex-shrink-0" />
            </Flex>
        );
    }

    return (
        <input ref={ inputRef } type="text" className="form-control form-control-sm" value={ draft }
            maxLength={ 56 } spellCheck={ false } autoFocus
            onChange={ event => setDraft(event.target.value) }
            onBlur={ commit }
            onKeyDown={ event =>
            {
                // The name's keys are the name's alone. Enter closes this box
                // before the key reaches the chat box's listener on body, which
                // then saw no other box selected and spoke the name as chat;
                // macros and the shop's own shortcuts have no business here
                // either.
                event.stopPropagation();

                if(event.key === 'Enter') commit();
                // Escape leaves the name alone; blur would otherwise commit it.
                if(event.key === 'Escape') setEditing(false);
            } } />
    );
}
