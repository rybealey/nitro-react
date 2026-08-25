import { FC, PointerEvent, WheelEvent, useEffect, useRef, useState } from 'react';
import { PhoneIcon } from './PhoneIcon';
import { usePhonePhotos } from './usePhone';

// Photos app, iOS style: a 3-up grid of every photo the player has saved
// with the Camera, and a full-bleed viewer with meta, navigation, delete
// and a crop/zoom editor that saves the edit back to the library.

const MIN_ZOOM: number = 1;
const MAX_ZOOM: number = 3;

const FormatPhotoDate = (timestamp: number): string =>
{
    const date = new Date(timestamp * 1000);

    return `${ date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) } · ${ date.getHours().toString().padStart(2, '0') }:${ date.getMinutes().toString().padStart(2, '0') }`;
}

interface PhonePhotosViewProps
{
    openCamera: () => void;
    onBack: () => void;
}

export const PhonePhotosView: FC<PhonePhotosViewProps> = props =>
{
    const { openCamera = null, onBack = null } = props;
    const { photos = [], photosLoaded = false, requestPhotos = null, deletePhoto = null, updatePhoto = null } = usePhonePhotos();
    const [ viewerIndex, setViewerIndex ] = useState<number>(-1);
    const [ chromeHidden, setChromeHidden ] = useState(false);
    const [ confirmingDelete, setConfirmingDelete ] = useState(false);
    const [ isEditing, setIsEditing ] = useState(false);
    const [ zoom, setZoom ] = useState<number>(1);
    const [ pan, setPan ] = useState<{ x: number, y: number }>({ x: 0, y: 0 });
    const [ imageSize, setImageSize ] = useState<{ width: number, height: number }>(null);
    const [ toastText, setToastText ] = useState<string>(null);
    const stageRef = useRef<HTMLDivElement>(null);
    const editImageRef = useRef<HTMLImageElement>(null);
    const dragRef = useRef<{ startX: number, startY: number, panX: number, panY: number }>(null);

    useEffect(() =>
    {
        if(requestPhotos) requestPhotos();
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // The library refreshes after deletes/edits — keep the viewer index in
    // range, closing it when the last photo goes.
    useEffect(() =>
    {
        if(viewerIndex >= photos.length) setViewerIndex(photos.length - 1);
    }, [ photos, viewerIndex ]);

    useEffect(() =>
    {
        if(!toastText) return;

        const timeout = window.setTimeout(() => setToastText(null), 1800);

        return () => window.clearTimeout(timeout);
    }, [ toastText ]);

    const viewerPhoto = (((viewerIndex >= 0) && (viewerIndex < photos.length)) ? photos[viewerIndex] : null);

    const closeViewer = () =>
    {
        setViewerIndex(-1);
        setChromeHidden(false);
        setConfirmingDelete(false);
        setIsEditing(false);
    }

    const startEdit = () =>
    {
        if(!viewerPhoto) return;

        setImageSize(null);
        setZoom(1);
        setPan({ x: 0, y: 0 });
        setIsEditing(true);

        const image = new Image();

        image.onload = () => setImageSize({ width: image.naturalWidth, height: image.naturalHeight });
        image.src = viewerPhoto.url;
    }

    // Cover-fit scale for the current zoom, and the pan clamped so the
    // image always covers the whole stage.
    const editLayout = (nextZoom: number = zoom, nextPan: { x: number, y: number } = pan) =>
    {
        if(!stageRef.current || !imageSize) return null;

        const stage = stageRef.current.getBoundingClientRect();
        const coverScale = Math.max((stage.width / imageSize.width), (stage.height / imageSize.height));
        const scale = (coverScale * nextZoom);
        const width = (imageSize.width * scale);
        const height = (imageSize.height * scale);
        const maxX = Math.max(0, ((width - stage.width) / 2));
        const maxY = Math.max(0, ((height - stage.height) / 2));
        const x = Math.max(-maxX, Math.min(maxX, nextPan.x));
        const y = Math.max(-maxY, Math.min(maxY, nextPan.y));

        return { stage, scale, width, height, x, y };
    }

    const applyZoom = (nextZoom: number) =>
    {
        const clamped = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, nextZoom));
        const layout = editLayout(clamped, pan);

        setZoom(clamped);

        if(layout) setPan({ x: layout.x, y: layout.y });
    }

    const onEditPointerDown = (event: PointerEvent<HTMLDivElement>) =>
    {
        try 
        {
            event.currentTarget.setPointerCapture(event.pointerId); 
        }
        catch(e) 
        {}

        dragRef.current = { startX: event.clientX, startY: event.clientY, panX: pan.x, panY: pan.y };
    }

    const onEditPointerMove = (event: PointerEvent<HTMLDivElement>) =>
    {
        if(!dragRef.current) return;

        const layout = editLayout(zoom, { x: (dragRef.current.panX + (event.clientX - dragRef.current.startX)), y: (dragRef.current.panY + (event.clientY - dragRef.current.startY)) });

        if(layout) setPan({ x: layout.x, y: layout.y });
    }

    const onEditPointerUp = () => (dragRef.current = null);

    const onEditWheel = (event: WheelEvent<HTMLDivElement>) => applyZoom(zoom - (event.deltaY * 0.0035));

    const saveEdit = () =>
    {
        const layout = editLayout();

        if(!layout || !viewerPhoto || !editImageRef.current || !updatePhoto) return;

        try
        {
            // Visible stage region mapped back into source-image pixels.
            const sourceX = (((layout.width - layout.stage.width) / 2) - layout.x) / layout.scale;
            const sourceY = (((layout.height - layout.stage.height) / 2) - layout.y) / layout.scale;
            const sourceWidth = (layout.stage.width / layout.scale);
            const sourceHeight = (layout.stage.height / layout.scale);
            const canvas = document.createElement('canvas');

            canvas.width = Math.max(1, Math.round(sourceWidth));
            canvas.height = Math.max(1, Math.round(sourceHeight));

            const context = canvas.getContext('2d');

            context.imageSmoothingEnabled = false;
            context.drawImage(editImageRef.current, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, canvas.width, canvas.height);

            updatePhoto(viewerPhoto.id, canvas.toDataURL('image/png'));
            setIsEditing(false);
            setToastText('Edit saved');
        }

        catch(e)
        {
            setToastText('Couldn\'t save the edit');
        }
    }

    const downloadPhoto = async () =>
    {
        if(!viewerPhoto) return;

        try
        {
            const response = await fetch(viewerPhoto.url);
            const blob = await response.blob();
            const objectUrl = URL.createObjectURL(blob);
            const anchor = document.createElement('a');

            anchor.href = objectUrl;
            anchor.download = `pixelrp-photo-${ viewerPhoto.id }.png`;
            document.body.appendChild(anchor);
            anchor.click();
            anchor.remove();
            window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
            setToastText('Photo downloaded');
        }

        catch(e)
        {
            setToastText('Couldn\'t download the photo');
        }
    }

    const layout = (isEditing ? editLayout() : null);

    return (
        <div className="phone-screen phone-app-screen phone-photos">
            <div className="phone-app-scroll">
                <div className="phone-app-header">
                    <div className="phone-app-header-lead">
                        <div className="phone-tap phone-thread-back" onClick={ event => (onBack && onBack()) }>
                            <PhoneIcon icon="chevron-left" size={ 24 } />
                        </div>
                        <div>
                            <div className="phone-app-kicker">PIXELRP PHOTOS</div>
                            <div className="phone-app-title">Photos</div>
                        </div>
                    </div>
                    <div className="phone-tap phone-fab" title="Open Camera" onClick={ event => (openCamera && openCamera()) }>
                        <PhoneIcon icon="camera" size={ 20 } />
                    </div>
                </div>
                { (photos.length > 0) &&
                    <>
                        <div className="phone-photos-grid">
                            { photos.map((photo, index) =>
                            {
                                return (
                                    <div key={ photo.id } className="phone-tap phone-photos-cell" onClick={ event => 
                                    {
                                        setViewerIndex(index); setChromeHidden(false); 
                                    } }>
                                        <img src={ photo.url } alt="" loading="lazy" />
                                        { photo.published &&
                                            <div className="phone-photos-shared" title="Shared to the city feed">
                                                <PhoneIcon icon="users" size={ 11 } />
                                            </div> }
                                    </div>
                                );
                            }) }
                        </div>
                        <div className="phone-photos-count">{ photos.length } { (photos.length === 1) ? 'Photo' : 'Photos' }</div>
                    </> }
                { photosLoaded && !photos.length &&
                    <div className="phone-messages-empty">
                        <div className="phone-messages-empty-mark">
                            <PhoneIcon icon="camera" size={ 42 } style={ { color: '#ffffff' } } />
                        </div>
                        <div className="phone-messages-empty-title">No photos yet</div>
                        <div className="phone-messages-empty-text">Open the Camera and frame the city<br />through your phone screen.</div>
                        <div className="phone-tap phone-cta" onClick={ event => (openCamera && openCamera()) }>OPEN CAMERA</div>
                    </div> }
                <div className="phone-scroll-spacer" />
            </div>
            { viewerPhoto && !isEditing &&
                <div className="phone-photos-viewer">
                    <img className="phone-photos-viewer-image" src={ viewerPhoto.url } alt="" onClick={ event => setChromeHidden(!chromeHidden) } />
                    { !chromeHidden &&
                        <>
                            <div className="phone-photos-viewer-top">
                                <div className="phone-tap phone-photos-viewer-back" onClick={ closeViewer }>
                                    <PhoneIcon icon="chevron-left" size={ 22 } />
                                </div>
                                <div className="phone-photos-viewer-meta">
                                    <div className="phone-photos-viewer-date">{ FormatPhotoDate(viewerPhoto.timestamp) }</div>
                                    <div className="phone-photos-viewer-sub">
                                        { (viewerIndex + 1) } of { photos.length }
                                        { viewerPhoto.published && <span> · Shared to the city</span> }
                                    </div>
                                </div>
                                <div className="phone-photos-viewer-spacer" />
                            </div>
                            <div className="phone-photos-viewer-bottom">
                                <div className={ `phone-tap phone-photos-viewer-btn${ (viewerIndex >= (photos.length - 1)) ? ' is-disabled' : '' }` } title="Older" onClick={ event => setViewerIndex(Math.min((photos.length - 1), (viewerIndex + 1))) }>
                                    <PhoneIcon icon="chevron-left" size={ 20 } />
                                </div>
                                <div className="phone-tap phone-photos-viewer-btn is-danger" title="Delete photo" onClick={ event => setConfirmingDelete(true) }>
                                    <PhoneIcon icon="trash" size={ 18 } />
                                </div>
                                <div className="phone-tap phone-photos-viewer-btn" title="Crop &amp; zoom" onClick={ startEdit }>
                                    <PhoneIcon icon="crop" size={ 18 } />
                                </div>
                                <div className="phone-tap phone-photos-viewer-btn" title="Download photo" onClick={ downloadPhoto }>
                                    <PhoneIcon icon="download" size={ 18 } />
                                </div>
                                <div className={ `phone-tap phone-photos-viewer-btn is-next${ (viewerIndex <= 0) ? ' is-disabled' : '' }` } title="Newer" onClick={ event => setViewerIndex(Math.max(0, (viewerIndex - 1))) }>
                                    <PhoneIcon icon="chevron-left" size={ 20 } />
                                </div>
                            </div>
                        </> }
                    { confirmingDelete &&
                        <div className="phone-photos-sheet-backdrop" onClick={ event => setConfirmingDelete(false) }>
                            <div className="phone-photos-sheet" onClick={ event => event.stopPropagation() }>
                                <div className="phone-photos-sheet-note">This photo will be removed from your library{ viewerPhoto.published ? ' and the city feed' : '' }. Prints you already own stay.</div>
                                <div className="phone-tap phone-photos-sheet-btn is-danger" onClick={ event => 
                                {
                                    (deletePhoto && deletePhoto(viewerPhoto.id)); setConfirmingDelete(false); 
                                } }>Delete Photo</div>
                                <div className="phone-tap phone-photos-sheet-btn" onClick={ event => setConfirmingDelete(false) }>Cancel</div>
                            </div>
                        </div> }
                </div> }
            { viewerPhoto && isEditing &&
                <div className="phone-photos-viewer is-editing">
                    <div ref={ stageRef } className="phone-photos-edit-stage" onPointerDown={ onEditPointerDown } onPointerMove={ onEditPointerMove } onPointerUp={ onEditPointerUp } onPointerCancel={ onEditPointerUp } onWheel={ onEditWheel }>
                        { layout &&
                            <img ref={ editImageRef } src={ viewerPhoto.url } alt="" draggable={ false } style={ { width: layout.width, height: layout.height, left: `calc(50% - ${ (layout.width / 2) - layout.x }px)`, top: `calc(50% - ${ (layout.height / 2) - layout.y }px)` } } /> }
                        { !layout &&
                            <div className="phone-photos-edit-loading">Loading…</div> }
                    </div>
                    <div className="phone-photos-viewer-top">
                        <div className="phone-tap phone-photos-edit-action" onClick={ event => setIsEditing(false) }>Cancel</div>
                        <div className="phone-photos-viewer-meta">
                            <div className="phone-photos-viewer-date">Crop &amp; Zoom</div>
                        </div>
                        <div className={ `phone-tap phone-photos-edit-action is-save${ !layout ? ' is-disabled' : '' }` } onClick={ saveEdit }>Save</div>
                    </div>
                    <div className="phone-photos-edit-bottom">
                        <input type="range" min={ MIN_ZOOM } max={ MAX_ZOOM } step={ 0.01 } value={ zoom } onChange={ event => applyZoom(parseFloat(event.target.value)) } />
                        <div className="phone-photos-edit-hint">Drag to reposition · Scroll or slide to zoom</div>
                    </div>
                </div> }
            { toastText &&
                <div className="phone-camera-toast">
                    <PhoneIcon icon="check" size={ 14 } />
                    <span>{ toastText }</span>
                </div> }
        </div>
    );
}
