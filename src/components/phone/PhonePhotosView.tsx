import { FC, useEffect, useState } from 'react';
import { PhoneIcon } from './PhoneIcon';
import { usePhonePhotos } from './usePhone';

// Photos app, iOS style: a 3-up grid of every photo the player has saved
// with the Camera, newest first, with a full-screen viewer on tap.

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
    const { photos = [], photosLoaded = false, requestPhotos = null } = usePhonePhotos();
    const [ viewerIndex, setViewerIndex ] = useState<number>(-1);

    useEffect(() =>
    {
        if(requestPhotos) requestPhotos();
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const viewerPhoto = (((viewerIndex >= 0) && (viewerIndex < photos.length)) ? photos[viewerIndex] : null);

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
                                    <div key={ photo.id } className="phone-tap phone-photos-cell" onClick={ event => setViewerIndex(index) }>
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
            { viewerPhoto &&
                <div className="phone-photos-viewer">
                    <div className="phone-photos-viewer-top">
                        <div className="phone-tap phone-photos-viewer-back" onClick={ event => setViewerIndex(-1) }>
                            <PhoneIcon icon="chevron-left" size={ 22 } />
                        </div>
                        <div className="phone-photos-viewer-date">{ FormatPhotoDate(viewerPhoto.timestamp) }</div>
                        <div className="phone-photos-viewer-spacer" />
                    </div>
                    <div className="phone-photos-viewer-stage">
                        <img src={ viewerPhoto.url } alt="" />
                    </div>
                    <div className="phone-photos-viewer-bottom">
                        <div className={ `phone-tap phone-photos-viewer-nav${ (viewerIndex >= (photos.length - 1)) ? ' is-disabled' : '' }` } onClick={ event => setViewerIndex(Math.min((photos.length - 1), (viewerIndex + 1))) }>
                            <PhoneIcon icon="chevron-left" size={ 20 } />
                        </div>
                        { viewerPhoto.published &&
                            <div className="phone-photos-viewer-shared">
                                <PhoneIcon icon="users" size={ 13 } />
                                <span>Shared to the city</span>
                            </div> }
                        <div className={ `phone-tap phone-photos-viewer-nav is-next${ (viewerIndex <= 0) ? ' is-disabled' : '' }` } onClick={ event => setViewerIndex(Math.max(0, (viewerIndex - 1))) }>
                            <PhoneIcon icon="chevron-left" size={ 20 } />
                        </div>
                    </div>
                </div> }
        </div>
    );
}
