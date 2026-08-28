import { RpAlbumListItem, RpPhotoListItem } from '@nitrots/nitro-renderer';
import { FC, useEffect, useMemo, useState } from 'react';
import { GetSessionDataManager } from '../../api';
import { useFriends } from '../../hooks';
import { PhoneAvatar, PhoneAvatarColor } from './PhoneAvatar';
import { PhoneIcon } from './PhoneIcon';
import { usePhoneAlbums, usePhonePhotos } from './usePhone';

// Photos app - Collections tab (iOS Albums style). My Albums (with the
// undeletable virtual Screenshots album first), Shared Albums (create,
// invite/remove friends, contribute), People and Places. People/Places/
// Screenshots are computed from photo metadata (tagged players, room name,
// capture source); only real albums live server-side.

type CollectionView =
    { type: 'screenshots' } |
    { type: 'person', name: string } |
    { type: 'place', name: string } |
    { type: 'album', id: number };

interface ViewerItem
{
    id: number;
    url: string;
    timestamp: number;
    ownerId?: number;
    ownerName?: string;
}

const FormatViewerDate = (timestamp: number): string =>
{
    const date = new Date(timestamp * 1000);

    return `${ date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) } · ${ date.getHours().toString().padStart(2, '0') }:${ date.getMinutes().toString().padStart(2, '0') }`;
}

// Deterministic pastel for non-friend People circles (no figure available).
const NameColor = (name: string): string =>
{
    let hash = 0;

    for(let i = 0; i < name.length; i++) hash = ((hash + name.charCodeAt(i)) % 997);

    return PhoneAvatarColor(hash);
}

export const PhonePhotosCollectionsView: FC<{}> = props =>
{
    const { photos = [] } = usePhonePhotos();
    const { albums = [], albumPhotos = {}, requestAlbums = null, requestAlbumPhotos = null, createAlbum = null, deleteAlbum = null, setAlbumMember = null, setAlbumPhoto = null } = usePhoneAlbums();
    const { friends = [] } = useFriends();
    const [ view, setView ] = useState<CollectionView>(null);
    const [ createShared, setCreateShared ] = useState<boolean>(null);
    const [ createName, setCreateName ] = useState('');
    const [ invitedIds, setInvitedIds ] = useState<number[]>([]);
    const [ membersOpen, setMembersOpen ] = useState(false);
    const [ pickerOpen, setPickerOpen ] = useState(false);
    const [ pickerIds, setPickerIds ] = useState<number[]>([]);
    const [ confirmingDelete, setConfirmingDelete ] = useState(false);
    const [ viewer, setViewer ] = useState<{ items: ViewerItem[], index: number }>(null);

    const ownId = GetSessionDataManager().userId;

    useEffect(() =>
    {
        if(requestAlbums) requestAlbums();
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // ----- metadata-derived groups -----

    const screenshots = useMemo(() => photos.filter(photo => ((photo.source === 'screenshot') || (photo.source === 'saved'))), [ photos ]);

    const people = useMemo(() =>
    {
        const map: Map<string, RpPhotoListItem[]> = new Map();

        for(const photo of photos)
        {
            for(const name of (photo.taggedUsers || []))
            {
                if(!name) continue;

                if(!map.has(name)) map.set(name, []);

                map.get(name).push(photo);
            }
        }

        return Array.from(map.entries()).sort((a, b) => (b[1].length - a[1].length));
    }, [ photos ]);

    const places = useMemo(() =>
    {
        const map: Map<string, RpPhotoListItem[]> = new Map();

        for(const photo of photos)
        {
            if(!photo.roomName) continue;

            if(!map.has(photo.roomName)) map.set(photo.roomName, []);

            map.get(photo.roomName).push(photo);
        }

        return Array.from(map.entries()).sort((a, b) => (b[1].length - a[1].length));
    }, [ photos ]);

    const myAlbums = useMemo(() => albums.filter(album => (!album.shared && (album.ownerId === ownId))), [ albums, ownId ]);
    const sharedAlbums = useMemo(() => albums.filter(album => album.shared), [ albums ]);

    const activeAlbum: RpAlbumListItem = ((view?.type === 'album') ? albums.find(album => (album.id === view.id)) : null);
    const activeAlbumPhotos = ((view?.type === 'album') ? (albumPhotos[view.id] || []) : []);
    const isAlbumOwner = (activeAlbum && (activeAlbum.ownerId === ownId));

    // Albums vanishing under us (deleted / removed as member) drop back to
    // the sections view.
    useEffect(() =>
    {
        if((view?.type === 'album') && albums.length && !albums.some(album => (album.id === view.id))) setView(null);
    }, [ albums, view ]);

    const openAlbum = (albumId: number) =>
    {
        setView({ type: 'album', id: albumId });

        if(requestAlbumPhotos) requestAlbumPhotos(albumId);
    }

    const openCreate = (shared: boolean) =>
    {
        setCreateShared(shared);
        setCreateName('');
        setInvitedIds([]);
    }

    const submitCreate = () =>
    {
        if(!createName.trim().length || !createAlbum) return;

        createAlbum(createName, createShared, (createShared ? invitedIds : []));
        setCreateShared(null);
    }

    const toggleInvite = (userId: number) => setInvitedIds(prevValue => ((prevValue.indexOf(userId) >= 0) ? prevValue.filter(id => (id !== userId)) : [ ...prevValue, userId ]));

    const togglePick = (photoId: number) => setPickerIds(prevValue => ((prevValue.indexOf(photoId) >= 0) ? prevValue.filter(id => (id !== photoId)) : [ ...prevValue, photoId ]));

    const submitPicker = () =>
    {
        if(!activeAlbum || !setAlbumPhoto) return;

        for(const photoId of pickerIds) setAlbumPhoto(activeAlbum.id, photoId, true);

        setPickerOpen(false);
        setPickerIds([]);
    }

    const viewerItem = (viewer ? viewer.items[viewer.index] : null);

    // Whether the open viewer photo can be pulled from the open album.
    const canRemoveFromAlbum = (viewerItem && activeAlbum && (view?.type === 'album') && (isAlbumOwner || (viewerItem.ownerId === ownId)));

    const openViewer = (items: ViewerItem[], index: number) => setViewer({ items, index });

    const friendByName = (name: string) => friends.find(friend => ((friend.name || '').toLowerCase() === name.toLowerCase()));

    const albumCover = (coverUrl: string, shared: boolean, extraClass: string = '') =>
    {
        return (
            <div className={ `phone-album-cover${ extraClass }` }>
                { coverUrl && <img src={ coverUrl } alt="" loading="lazy" /> }
                { !coverUrl && <PhoneIcon icon="image" size={ 22 } className="phone-album-cover-empty" /> }
                { shared &&
                    <div className="phone-album-shared-badge"><PhoneIcon icon="users" size={ 12 } /></div> }
            </div>
        );
    }

    const photoGrid = (items: ViewerItem[]) =>
    {
        return (
            <div className="phone-photos-grid">
                { items.map((item, index) => (
                    <div key={ `${ item.id }-${ index }` } className="phone-tap phone-photos-cell" onClick={ event => openViewer(items, index) }>
                        <img src={ item.url } alt="" loading="lazy" />
                    </div>
                )) }
            </div>
        );
    }

    const detailHeader = (title: string, subtitle: string) =>
    {
        return (
            <div className="phone-collections-detail-head">
                <div className="phone-tap phone-thread-back" onClick={ event => setView(null) }>
                    <PhoneIcon icon="chevron-left" size={ 22 } />
                </div>
                <div className="phone-collections-detail-meta">
                    <div className="phone-collections-detail-title">{ title }</div>
                    <div className="phone-collections-detail-sub">{ subtitle }</div>
                </div>
                { (view?.type === 'album') && activeAlbum &&
                    <div className="phone-collections-detail-actions">
                        { (isAlbumOwner || activeAlbum.shared) &&
                            <div className="phone-tap phone-photos-viewer-btn is-compact" title="Add photos" onClick={ event =>
                            {
                                setPickerIds([]); setPickerOpen(true);
                            } }>
                                <PhoneIcon icon="plus" size={ 16 } />
                            </div> }
                        { activeAlbum.shared && isAlbumOwner &&
                            <div className="phone-tap phone-photos-viewer-btn is-compact" title="Members" onClick={ event => setMembersOpen(true) }>
                                <PhoneIcon icon="users" size={ 15 } />
                            </div> }
                        { isAlbumOwner &&
                            <div className="phone-tap phone-photos-viewer-btn is-compact is-danger" title="Delete album" onClick={ event => setConfirmingDelete(true) }>
                                <PhoneIcon icon="trash" size={ 15 } />
                            </div> }
                    </div> }
            </div>
        );
    }

    const toItems = (list: RpPhotoListItem[]): ViewerItem[] => list.map(photo => ({ id: photo.id, url: photo.url, timestamp: photo.timestamp, ownerId: ownId }));

    return (
        <div className="phone-collections">
            { !view &&
                <>
                    <div className="phone-collections-section-head">
                        <span>My Albums</span>
                    </div>
                    <div className="phone-collections-row">
                        <div className="phone-tap phone-album-tile" onClick={ event => openCreate(false) }>
                            <div className="phone-album-cover is-new">
                                <PhoneIcon icon="plus" size={ 20 } />
                            </div>
                            <div className="phone-album-name">New Album</div>
                        </div>
                        <div className="phone-tap phone-album-tile" onClick={ event => setView({ type: 'screenshots' }) }>
                            { albumCover((screenshots.length ? screenshots[0].url : ''), false) }
                            <div className="phone-album-name">Screenshots</div>
                            <div className="phone-album-count">{ screenshots.length }</div>
                        </div>
                        { myAlbums.map(album => (
                            <div key={ album.id } className="phone-tap phone-album-tile" onClick={ event => openAlbum(album.id) }>
                                { albumCover(album.coverUrl, false) }
                                <div className="phone-album-name">{ album.name }</div>
                                <div className="phone-album-count">{ album.photoCount }</div>
                            </div>
                        )) }
                    </div>

                    <div className="phone-collections-section-head">
                        <PhoneIcon icon="users" size={ 15 } />
                        <span>Shared Albums</span>
                        <div className="phone-tap phone-collections-new" onClick={ event => openCreate(true) }>
                            <PhoneIcon icon="plus" size={ 12 } />
                            <span>New</span>
                        </div>
                    </div>
                    { (sharedAlbums.length > 0) &&
                        <div className="phone-collections-row">
                            { sharedAlbums.map(album => (
                                <div key={ album.id } className="phone-tap phone-album-tile is-wide" onClick={ event => openAlbum(album.id) }>
                                    { albumCover(album.coverUrl, true, ' is-wide') }
                                    <div className="phone-album-name">{ album.name }</div>
                                    <div className="phone-album-count">{ (album.members.length + 1) } people · { album.photoCount }</div>
                                </div>
                            )) }
                        </div> }
                    { !sharedAlbums.length &&
                        <div className="phone-collections-empty">Share an album with friends and everyone can add their shots.</div> }

                    { (people.length > 0) &&
                        <>
                            <div className="phone-collections-section-head">
                                <PhoneIcon icon="user" size={ 15 } />
                                <span>People</span>
                            </div>
                            <div className="phone-collections-row">
                                { people.map(([ name, personPhotos ]) =>
                                {
                                    const friend = friendByName(name);

                                    return (
                                        <div key={ name } className="phone-tap phone-person" onClick={ event => setView({ type: 'person', name }) }>
                                            { friend &&
                                                <PhoneAvatar id={ friend.id } figure={ friend.figure } size={ 56 } className="phone-person-avatar" /> }
                                            { !friend &&
                                                <div className="phone-person-letter" style={ { backgroundColor: NameColor(name) } }>{ name.charAt(0).toUpperCase() }</div> }
                                            <div className="phone-person-name">{ name }</div>
                                            <div className="phone-album-count">{ personPhotos.length }</div>
                                        </div>
                                    );
                                }) }
                            </div>
                        </> }

                    { (places.length > 0) &&
                        <>
                            <div className="phone-collections-section-head">
                                <PhoneIcon icon="map-pin-home" size={ 15 } />
                                <span>Places</span>
                            </div>
                            <div className="phone-places-grid">
                                { places.map(([ name, placePhotos ]) => (
                                    <div key={ name } className="phone-tap phone-place-tile" onClick={ event => setView({ type: 'place', name }) }>
                                        <img src={ placePhotos[0].url } alt="" loading="lazy" />
                                        <div className="phone-place-overlay">
                                            <div className="phone-place-name">{ name }</div>
                                            <div className="phone-place-count">{ placePhotos.length } { (placePhotos.length === 1) ? 'photo' : 'photos' }</div>
                                        </div>
                                    </div>
                                )) }
                            </div>
                        </> }
                </> }

            { (view?.type === 'screenshots') &&
                <>
                    { detailHeader('Screenshots', `${ screenshots.length } ${ (screenshots.length === 1) ? 'photo' : 'photos' } · Default album`) }
                    { photoGrid(toItems(screenshots)) }
                    { !screenshots.length &&
                        <div className="phone-collections-empty">Screenshots you take with the side button, and photos you save from chats, land here.</div> }
                </> }

            { (view?.type === 'person') &&
                <>
                    { detailHeader(view.name, `${ (people.find(entry => (entry[0] === view.name))?.[1].length || 0) } photos together`) }
                    { photoGrid(toItems(people.find(entry => (entry[0] === view.name))?.[1] || [])) }
                </> }

            { (view?.type === 'place') &&
                <>
                    { detailHeader(view.name, `${ (places.find(entry => (entry[0] === view.name))?.[1].length || 0) } photos here`) }
                    { photoGrid(toItems(places.find(entry => (entry[0] === view.name))?.[1] || [])) }
                </> }

            { (view?.type === 'album') && activeAlbum &&
                <>
                    { detailHeader(activeAlbum.name, (activeAlbum.shared ? `Shared by ${ isAlbumOwner ? 'you' : activeAlbum.ownerName } · ${ (activeAlbum.members.length + 1) } people` : `${ activeAlbum.photoCount } ${ (activeAlbum.photoCount === 1) ? 'photo' : 'photos' }`)) }
                    { photoGrid(activeAlbumPhotos.map(photo => ({ id: photo.id, url: photo.url, timestamp: photo.timestamp, ownerId: photo.ownerId, ownerName: photo.ownerName }))) }
                    { !activeAlbumPhotos.length &&
                        <div className="phone-collections-empty">No photos in this album yet - tap + to add some of yours.</div> }
                </> }

            <div className="phone-scroll-spacer" />

            { /* ----- create album / shared album sheet ----- */ }
            { (createShared !== null) &&
                <div className="phone-photo-picker">
                    <div className="phone-photo-picker-top">
                        <div className="phone-tap phone-photos-edit-action" onClick={ event => setCreateShared(null) }>Cancel</div>
                        <div className="phone-photos-viewer-meta">
                            <div className="phone-photos-viewer-date">{ createShared ? 'New Shared Album' : 'New Album' }</div>
                        </div>
                        <div className={ `phone-tap phone-photos-edit-action is-save${ !createName.trim().length ? ' is-disabled' : '' }` } onClick={ submitCreate }>Create</div>
                    </div>
                    <div className="phone-collections-name-row">
                        <div className="phone-album-cover is-input-mark">
                            <PhoneIcon icon="image" size={ 20 } />
                        </div>
                        <input type="text" spellCheck={ false } autoFocus={ true } maxLength={ 32 } placeholder="Album name" value={ createName } onChange={ event => setCreateName(event.target.value) } />
                    </div>
                    { createShared &&
                        <>
                            <div className="phone-collections-invite-head">
                                <span>INVITE PLAYERS</span>
                                <span className="phone-collections-invite-count">{ invitedIds.length } selected</span>
                            </div>
                            <div className="phone-app-scroll phone-photo-picker-scroll">
                                { friends.filter(friend => (friend.id > 0)).map(friend => (
                                    <div key={ friend.id } className="phone-tap phone-compose-row" onClick={ event => toggleInvite(friend.id) }>
                                        <PhoneAvatar id={ friend.id } figure={ friend.figure } size={ 42 } />
                                        <div className="phone-compose-row-body">
                                            <div className="phone-compose-row-name">{ friend.name }</div>
                                            <div className="phone-compose-row-handle">@{ (friend.name || '').toLowerCase() }</div>
                                        </div>
                                        <div className={ `phone-invite-check${ (invitedIds.indexOf(friend.id) >= 0) ? ' is-picked' : '' }` }>
                                            { (invitedIds.indexOf(friend.id) >= 0) && <PhoneIcon icon="check" size={ 13 } /> }
                                        </div>
                                    </div>
                                )) }
                                { !friends.length &&
                                    <div className="phone-list-note">Add some friends first - shared albums are invite-only.</div> }
                                <div className="phone-scroll-spacer" />
                            </div>
                        </> }
                    { !createShared &&
                        <div className="phone-collections-empty">Albums collect photos from your library - the photos stay in Recents too.</div> }
                </div> }

            { /* ----- members sheet (shared album, owner) ----- */ }
            { membersOpen && activeAlbum &&
                <div className="phone-photo-picker">
                    <div className="phone-photo-picker-top">
                        <div className="phone-tap phone-photos-edit-action" onClick={ event => setMembersOpen(false) }>Done</div>
                        <div className="phone-photos-viewer-meta">
                            <div className="phone-photos-viewer-date">Members</div>
                            <div className="phone-photos-viewer-sub">{ (activeAlbum.members.length + 1) } people</div>
                        </div>
                        <div className="phone-photos-edit-action" />
                    </div>
                    <div className="phone-app-scroll phone-photo-picker-scroll">
                        <div className="phone-section-label">IN THIS ALBUM</div>
                        { activeAlbum.members.map(member =>
                        {
                            const friend = friendByName(member.name);

                            return (
                                <div key={ member.id } className="phone-compose-row">
                                    { friend && <PhoneAvatar id={ member.id } figure={ friend.figure } size={ 42 } /> }
                                    { !friend && <div className="phone-person-letter is-small" style={ { backgroundColor: NameColor(member.name) } }>{ member.name.charAt(0).toUpperCase() }</div> }
                                    <div className="phone-compose-row-body">
                                        <div className="phone-compose-row-name">{ member.name }</div>
                                        <div className="phone-compose-row-handle">Can view &amp; add photos</div>
                                    </div>
                                    <div className="phone-tap phone-round-btn is-decline" title="Remove from album" onClick={ event => (setAlbumMember && setAlbumMember(activeAlbum.id, member.id, false)) }>
                                        <PhoneIcon icon="close" size={ 14 } />
                                    </div>
                                </div>
                            );
                        }) }
                        { !activeAlbum.members.length &&
                            <div className="phone-list-note">Nobody else yet - invite friends below.</div> }
                        <div className="phone-section-label">INVITE FRIENDS</div>
                        { friends.filter(friend => ((friend.id > 0) && !activeAlbum.members.some(member => (member.id === friend.id)))).map(friend => (
                            <div key={ friend.id } className="phone-compose-row">
                                <PhoneAvatar id={ friend.id } figure={ friend.figure } size={ 42 } />
                                <div className="phone-compose-row-body">
                                    <div className="phone-compose-row-name">{ friend.name }</div>
                                    <div className="phone-compose-row-handle">@{ (friend.name || '').toLowerCase() }</div>
                                </div>
                                <div className="phone-tap phone-round-btn is-accept" title="Invite to album" onClick={ event => (setAlbumMember && setAlbumMember(activeAlbum.id, friend.id, true)) }>
                                    <PhoneIcon icon="plus" size={ 14 } />
                                </div>
                            </div>
                        )) }
                        <div className="phone-scroll-spacer" />
                    </div>
                </div> }

            { /* ----- add-photos picker ----- */ }
            { pickerOpen && activeAlbum &&
                <div className="phone-photo-picker">
                    <div className="phone-photo-picker-top">
                        <div className="phone-tap phone-photos-edit-action" onClick={ event => setPickerOpen(false) }>Cancel</div>
                        <div className="phone-photos-viewer-meta">
                            <div className="phone-photos-viewer-date">Add to { activeAlbum.name }</div>
                            <div className="phone-photos-viewer-sub">{ pickerIds.length ? `${ pickerIds.length } selected` : 'Tap to select' }</div>
                        </div>
                        <div className="phone-photos-edit-action" />
                    </div>
                    <div className="phone-app-scroll phone-photo-picker-scroll">
                        { (photos.length > 0) &&
                            <div className="phone-photos-grid">
                                { photos.map(photo =>
                                {
                                    const alreadyIn = activeAlbumPhotos.some(albumPhoto => (albumPhoto.id === photo.id));
                                    const selectedIndex = pickerIds.indexOf(photo.id);

                                    return (
                                        <div key={ photo.id } className={ `phone-tap phone-photos-cell${ alreadyIn ? ' is-muted-cell' : '' }` } onClick={ event => (!alreadyIn && togglePick(photo.id)) }>
                                            <img src={ photo.url } alt="" loading="lazy" />
                                            { !alreadyIn &&
                                                <div className={ `phone-photo-picker-check${ (selectedIndex >= 0) ? ' is-selected' : '' }` }>
                                                    { (selectedIndex >= 0) && (selectedIndex + 1) }
                                                </div> }
                                        </div>
                                    );
                                }) }
                            </div> }
                        { !photos.length &&
                            <div className="phone-list-note">Your library is empty - take some photos first.</div> }
                        <div className="phone-scroll-spacer" />
                    </div>
                    <div className="phone-photo-picker-bottom">
                        <div className={ `phone-tap phone-cta phone-photo-picker-send${ !pickerIds.length ? ' is-disabled' : '' }` } onClick={ submitPicker }>
                            { pickerIds.length ? `ADD ${ pickerIds.length } ${ (pickerIds.length === 1) ? 'PHOTO' : 'PHOTOS' }` : 'ADD' }
                        </div>
                    </div>
                </div> }

            { /* ----- delete album confirm ----- */ }
            { confirmingDelete && activeAlbum &&
                <div className="phone-photos-sheet-backdrop" onClick={ event => setConfirmingDelete(false) }>
                    <div className="phone-photos-sheet" onClick={ event => event.stopPropagation() }>
                        <div className="phone-photos-sheet-note">The album will be deleted{ activeAlbum.shared ? ' for everyone in it' : '' }. The photos stay in their owners&apos; libraries.</div>
                        <div className="phone-tap phone-photos-sheet-btn is-danger" onClick={ event =>
                        {
                            (deleteAlbum && deleteAlbum(activeAlbum.id)); setConfirmingDelete(false); setView(null);
                        } }>Delete Album</div>
                        <div className="phone-tap phone-photos-sheet-btn" onClick={ event => setConfirmingDelete(false) }>Cancel</div>
                    </div>
                </div> }

            { /* ----- lightweight viewer ----- */ }
            { viewerItem &&
                <div className="phone-photos-viewer">
                    <img className="phone-photos-viewer-image" src={ viewerItem.url } alt="" onClick={ event => setViewer(null) } />
                    <div className="phone-photos-viewer-top">
                        <div className="phone-tap phone-photos-viewer-back" onClick={ event => setViewer(null) }>
                            <PhoneIcon icon="chevron-left" size={ 22 } />
                        </div>
                        <div className="phone-photos-viewer-meta">
                            <div className="phone-photos-viewer-date">{ FormatViewerDate(viewerItem.timestamp) }</div>
                            <div className="phone-photos-viewer-sub">
                                { (viewer.index + 1) } of { viewer.items.length }
                                { viewerItem.ownerName && (viewerItem.ownerId !== ownId) && <span> · by { viewerItem.ownerName }</span> }
                            </div>
                        </div>
                        <div className="phone-photos-viewer-spacer" />
                    </div>
                    <div className="phone-photos-viewer-bottom">
                        <div className={ `phone-tap phone-photos-viewer-btn${ (viewer.index >= (viewer.items.length - 1)) ? ' is-disabled' : '' }` } title="Older" onClick={ event => setViewer({ ...viewer, index: Math.min((viewer.items.length - 1), (viewer.index + 1)) }) }>
                            <PhoneIcon icon="chevron-left" size={ 20 } />
                        </div>
                        { canRemoveFromAlbum &&
                            <div className="phone-tap phone-photos-viewer-btn is-danger" title="Remove from album" onClick={ event =>
                            {
                                (setAlbumPhoto && setAlbumPhoto(activeAlbum.id, viewerItem.id, false)); setViewer(null);
                            } }>
                                <PhoneIcon icon="close" size={ 16 } />
                            </div> }
                        <div className={ `phone-tap phone-photos-viewer-btn is-next${ (viewer.index <= 0) ? ' is-disabled' : '' }` } title="Newer" onClick={ event => setViewer({ ...viewer, index: Math.max(0, (viewer.index - 1)) }) }>
                            <PhoneIcon icon="chevron-left" size={ 20 } />
                        </div>
                    </div>
                </div> }
        </div>
    );
}
