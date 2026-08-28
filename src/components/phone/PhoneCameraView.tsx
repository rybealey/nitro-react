import { NitroRectangle, RoomObjectCategory, RoomObjectType, RoomSessionEvent, RpPhotoListEvent, RpSavePhotoComposer, TextureUtils } from '@nitrots/nitro-renderer';
import { FC, useEffect, useRef, useState } from 'react';
import { GetRoomEngine, GetRoomObjectBounds, GetRoomSession, PlaySound, SendMessageComposer, SoundNames } from '../../api';
import { useMessageEvent, useRoomSessionManagerEvent } from '../../hooks';
import { PhoneIcon } from './PhoneIcon';
import { usePhonePhotos } from './usePhone';

// Camera app, iOS style: the phone screen itself is the viewfinder — the
// display goes transparent so the room shows straight through it. The
// shutter captures exactly the room region behind the screen; Use Photo
// files the shot straight into the Photos app (no inventory furni) along
// with its metadata — the players inside the frame, resolved at shutter
// time, plus room + capture-type recorded server-side.

interface PhoneCameraViewProps
{
    openPhotos: () => void;
    onExit: () => void;
}

export const PhoneCameraView: FC<PhoneCameraViewProps> = props =>
{
    const { openPhotos = null, onExit = null } = props;
    const { photos = [], requestPhotos = null } = usePhonePhotos();
    const [ inRoom, setInRoom ] = useState(() => !!GetRoomSession());
    const [ capturedUrl, setCapturedUrl ] = useState<string>(null);
    const [ isSaving, setIsSaving ] = useState(false);
    const [ showFlash, setShowFlash ] = useState(false);
    const [ showSavedToast, setShowSavedToast ] = useState(false);
    const viewportRef = useRef<HTMLDivElement>(null);
    const savingRef = useRef(false);
    // Player ids whose avatars intersected the viewfinder at shutter time -
    // computed per capture, shipped with Use Photo (server validates against
    // the room roster and resolves usernames itself).
    const taggedUserIdsRef = useRef<number[]>([]);

    useRoomSessionManagerEvent<RoomSessionEvent>(RoomSessionEvent.CREATED, event => setInRoom(true));
    useRoomSessionManagerEvent<RoomSessionEvent>(RoomSessionEvent.ENDED, event =>
    {
        setInRoom(false);
        setCapturedUrl(null);
        setIsSaving(false);
        savingRef.current = false;
    });

    // Save completion: RpSavePhoto replies with the refreshed photo list
    // (usePhonePhotos picks the photos up from the same event).
    useMessageEvent<RpPhotoListEvent>(RpPhotoListEvent, event =>
    {
        if(!savingRef.current) return;

        savingRef.current = false;

        setIsSaving(false);
        setCapturedUrl(null);
        setShowSavedToast(true);
    });

    useEffect(() =>
    {
        if(!showSavedToast) return;

        const timeout = window.setTimeout(() => setShowSavedToast(false), 1800);

        return () => window.clearTimeout(timeout);
    }, [ showSavedToast ]);

    useEffect(() =>
    {
        if(requestPhotos) requestPhotos();
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // Every real player whose avatar bounds intersect the viewfinder rect.
    // GetRoomObjectBounds reports canvas-1 coordinates — the same space as
    // getBoundingClientRect (the room canvas fills the window at origin), so
    // a plain rect intersection is exact. Geometric only: someone standing
    // behind furni still counts as "in frame".
    const usersInFrame = (roomId: number, bounds: DOMRect): number[] =>
    {
        const session = GetRoomSession();

        if(!session) return [];

        const userIds: number[] = [];
        const roomObjects = GetRoomEngine().getRoomObjects(roomId, RoomObjectCategory.UNIT);

        for(const roomObject of roomObjects)
        {
            if(roomObject.id < 0) continue;

            const userData = session.userDataManager.getUserDataByIndex(roomObject.id);

            if(!userData || (userData.type !== RoomObjectType.USER)) continue;

            const rect = GetRoomObjectBounds(roomId, roomObject.id, RoomObjectCategory.UNIT, 1);

            if(!rect) continue;

            const intersects = ((rect.x < (bounds.x + bounds.width)) && ((rect.x + rect.width) > bounds.x) && (rect.y < (bounds.y + bounds.height)) && ((rect.y + rect.height) > bounds.y));

            if(intersects) userIds.push(userData.webID);
        }

        return userIds;
    }

    const takePicture = () =>
    {
        const session = GetRoomSession();

        if(!session || !viewportRef.current) return;

        const bounds = viewportRef.current.getBoundingClientRect();
        const rectangle = new NitroRectangle(Math.floor(bounds.x), Math.floor(bounds.y), Math.floor(bounds.width), Math.floor(bounds.height));
        const texture = GetRoomEngine().createTextureFromRoom(session.roomId, 1, rectangle);

        if(!texture) return;

        taggedUserIdsRef.current = usersInFrame(session.roomId, bounds);

        PlaySound(SoundNames.CAMERA_SHUTTER);
        setShowFlash(true);
        window.setTimeout(() => setShowFlash(false), 180);
        setCapturedUrl(TextureUtils.generateImageUrl(texture));
    }

    const usePhoto = () =>
    {
        if(!capturedUrl || isSaving) return;

        savingRef.current = true;

        setIsSaving(true);

        const composer = new RpSavePhotoComposer(taggedUserIdsRef.current);

        composer.assignBase64(capturedUrl);
        SendMessageComposer(composer);
    }

    const latestPhoto = (photos.length ? photos[0] : null);

    return (
        <div className="phone-screen phone-camera">
            { inRoom && !capturedUrl &&
                <>
                    <div ref={ viewportRef } className="phone-camera-viewport">
                        <div className="phone-camera-corner is-tl" />
                        <div className="phone-camera-corner is-tr" />
                        <div className="phone-camera-corner is-bl" />
                        <div className="phone-camera-corner is-br" />
                    </div>
                    <div className="phone-camera-mode">PHOTO</div>
                    <div className="phone-camera-bar">
                        <div className="phone-tap phone-camera-thumb" title="Photos" onClick={ event => (openPhotos && openPhotos()) }>
                            { latestPhoto &&
                                <img src={ latestPhoto.url } alt="" /> }
                            { !latestPhoto &&
                                <PhoneIcon icon="image" size={ 16 } /> }
                        </div>
                        <div className="phone-tap phone-camera-shutter" title="Take photo" onClick={ takePicture }>
                            <div className="phone-camera-shutter-core" />
                        </div>
                        <div className="phone-tap phone-camera-exit" title="Close camera" onClick={ event => (onExit && onExit()) }>
                            <PhoneIcon icon="close" size={ 18 } />
                        </div>
                    </div>
                </> }
            { inRoom && capturedUrl &&
                <div className="phone-camera-preview">
                    <img src={ capturedUrl } alt="" />
                    <div className="phone-camera-preview-bar">
                        <div className={ `phone-tap phone-camera-preview-btn${ isSaving ? ' is-disabled' : '' }` } onClick={ event => (!isSaving && setCapturedUrl(null)) }>Retake</div>
                        <div className={ `phone-tap phone-camera-preview-btn is-primary${ isSaving ? ' is-disabled' : '' }` } onClick={ usePhoto }>{ isSaving ? 'Saving…' : 'Save' }</div>
                    </div>
                </div> }
            { !inRoom &&
                <div className="phone-camera-nosignal">
                    <PhoneIcon icon="camera" size={ 34 } />
                    <div className="phone-camera-nosignal-title">No scene in view</div>
                    <div className="phone-camera-nosignal-text">Step into a room to use the camera - the screen becomes your viewfinder.</div>
                </div> }
            { showFlash &&
                <div className="phone-camera-flash" /> }
            { showSavedToast &&
                <div className="phone-camera-toast">
                    <PhoneIcon icon="check" size={ 14 } />
                    <span>Saved to Photos</span>
                </div> }
        </div>
    );
}
