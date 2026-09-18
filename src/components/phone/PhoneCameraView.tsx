import { NitroRectangle, RoomObjectCategory, RoomObjectType, RoomSessionEvent, RpPhotoListEvent, RpSavePhotoComposer, TextureUtils } from '@nitrots/nitro-renderer';
import { applyPalette, GIFEncoder, quantize } from 'gifenc';
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
    landscape: boolean;
    setLandscape: (value: boolean) => void;
    openPhotos: () => void;
    onExit: () => void;
}

// What the shutter captures. Orientation is NOT one of these: how the phone is
// held is not a kind of media, so it lives on its own toggle and applies to
// both - including part-way through a recording.
type CaptureMode = 'photo' | 'video';

/// The GIF budget. Thirty seconds is the promise, and the rest follows from it:
/// every frame is a full room render, so the frame RATE and the pixel size are
/// what decide whether a 30-second clip is a few megabytes or a few hundred.
///
/// 8fps reads as motion for avatars walking and dancing - the things people
/// film in a hotel - without paying for smoothness nobody will look for, and
/// 240 frames is a count the encoder gets through without blocking the room.
const GIF_SECONDS = 30;
const GIF_FPS = 8;
const GIF_MAX_FRAMES = GIF_SECONDS * GIF_FPS;
const GIF_FRAME_MS = Math.round(1000 / GIF_FPS);
/// The longest edge a frame is encoded at. The viewfinder is bigger than this,
/// so frames are sampled down: a GIF is 256 colours whatever its size, and the
/// difference between this and full size is megabytes, not legibility.
const GIF_MAX_EDGE = 320;

const MODES: [ CaptureMode, string ][] = [ [ 'photo', 'PHOTO' ], [ 'video', 'VIDEO' ] ];

/// m:ss, for the recording readout.
const clock = (seconds: number): string =>
{
    const whole = Math.floor(seconds);

    return `${ Math.floor(whole / 60) }:${ (whole % 60).toString().padStart(2, '0') }`;
}

export const PhoneCameraView: FC<PhoneCameraViewProps> = props =>
{
    const { landscape = false, setLandscape = null, openPhotos = null, onExit = null } = props;
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
    const [ mode, setMode ] = useState<CaptureMode>('photo');
    const [ recording, setRecording ] = useState(false);
    const [ elapsed, setElapsed ] = useState(0);
    // What the capture produced. A GIF and a still travel the same path from
    // here on, so only the flag that decides the file's extension differs.
    const [ capturedIsGif, setCapturedIsGif ] = useState(false);
    // The encoder and the timer, kept off state: they change every frame and
    // nothing renders from them.
    const recorderRef = useRef<{ gif: any, canvas: HTMLCanvasElement, frames: number, stop: () => void }>(null);
    const tickRef = useRef<number>(0);

    useRoomSessionManagerEvent<RoomSessionEvent>(RoomSessionEvent.CREATED, event => setInRoom(true));
    useRoomSessionManagerEvent<RoomSessionEvent>(RoomSessionEvent.ENDED, event =>
    {
        setInRoom(false);
        // A recording with no room to point at cannot finish, so it is dropped
        // rather than left running against a scene that is gone.
        if(recorderRef.current) discardRecording();
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
        setCapturedIsGif(false);
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

        // Closing the camera mid-take must not leave the interval grabbing
        // frames against a viewfinder that is no longer on screen.
        return () =>
        {
            if(tickRef.current) window.clearInterval(tickRef.current);

            tickRef.current = 0;
            recorderRef.current = null;
        };
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

    /// One frame of the viewfinder, sampled down and handed to the encoder.
    ///
    /// TextureUtils.getPixels gives RGBA straight off the render texture, but at
    /// the viewfinder's full size - so it goes through a canvas first, which is
    /// both the downscale and the only place the browser will do that work for
    /// us. quantize/applyPalette are per frame rather than once for the clip:
    /// a room changes colour as people walk through it, and a palette fixed on
    /// frame one bands everything after it.
    const grabFrame = (recorder: { gif: any, canvas: HTMLCanvasElement, frames: number }) =>
    {
        const session = GetRoomSession();

        if(!session || !viewportRef.current) return false;

        const bounds = viewportRef.current.getBoundingClientRect();
        const rectangle = new NitroRectangle(Math.floor(bounds.x), Math.floor(bounds.y), Math.floor(bounds.width), Math.floor(bounds.height));
        const texture = GetRoomEngine().createTextureFromRoom(session.roomId, 1, rectangle);

        if(!texture) return false;

        const source = TextureUtils.generateCanvas(texture);

        if(!source) return false;

        const context = recorder.canvas.getContext('2d', { willReadFrequently: true });

        if(!context) return false;

        context.drawImage(source, 0, 0, recorder.canvas.width, recorder.canvas.height);

        const data = context.getImageData(0, 0, recorder.canvas.width, recorder.canvas.height).data;
        const palette = quantize(data, 256);

        recorder.gif.writeFrame(applyPalette(data, palette), recorder.canvas.width, recorder.canvas.height,
            { palette, delay: GIF_FRAME_MS });

        return true;
    }

    const discardRecording = () =>
    {
        if(tickRef.current) window.clearInterval(tickRef.current);

        tickRef.current = 0;
        recorderRef.current = null;

        setRecording(false);
        setElapsed(0);
    }

    const startRecording = () =>
    {
        const session = GetRoomSession();

        if(!session || !viewportRef.current || recorderRef.current) return;

        const bounds = viewportRef.current.getBoundingClientRect();

        if(!bounds.width || !bounds.height) return;

        // The frame keeps the viewfinder's shape - which is why turning the
        // phone really does produce a wide GIF - scaled so its longest edge is
        // the budget. Even numbers: an odd width makes some decoders unhappy.
        const scale = Math.min(1, GIF_MAX_EDGE / Math.max(bounds.width, bounds.height));
        const canvas = document.createElement('canvas');

        canvas.width = Math.max(2, Math.round(bounds.width * scale / 2) * 2);
        canvas.height = Math.max(2, Math.round(bounds.height * scale / 2) * 2);

        // Who was in shot is settled when recording STARTS, not when it stops:
        // the tag means "was in this clip", and somebody who walks out half way
        // through was still in it.
        taggedUserIdsRef.current = usersInFrame(session.roomId, bounds);

        const recorder = { gif: GIFEncoder(), canvas, frames: 0, stop: () => stopRecording() };

        recorderRef.current = recorder;

        setRecording(true);
        setElapsed(0);
        PlaySound(SoundNames.CAMERA_SHUTTER);

        tickRef.current = window.setInterval(() =>
        {
            const current = recorderRef.current;

            if(!current) return;

            if(!grabFrame(current))
            {
                // The room stopped answering mid-take. Keep what there is
                // rather than throwing away twenty seconds of somebody's clip.
                stopRecording();
                return;
            }

            current.frames += 1;

            setElapsed(current.frames / GIF_FPS);

            if(current.frames >= GIF_MAX_FRAMES) stopRecording();
        }, GIF_FRAME_MS);
    }

    const stopRecording = () =>
    {
        const recorder = recorderRef.current;

        if(!recorder) return;

        if(tickRef.current) window.clearInterval(tickRef.current);

        tickRef.current = 0;
        recorderRef.current = null;

        setRecording(false);

        // Nothing captured at all - a stop pressed before the first tick.
        if(!recorder.frames)
        {
            setElapsed(0);
            return;
        }

        recorder.gif.finish();

        const blob = new Blob([ recorder.gif.bytesView() ], { type: 'image/gif' });
        const reader = new FileReader();

        reader.onload = () =>
        {
            setCapturedIsGif(true);
            setCapturedUrl(String(reader.result));
            setElapsed(0);
        };
        reader.readAsDataURL(blob);
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
        setCapturedIsGif(false);
        setCapturedUrl(TextureUtils.generateImageUrl(texture));
    }

    const usePhoto = () =>
    {
        if(!capturedUrl || isSaving) return;

        savingRef.current = true;

        setIsSaving(true);

        // No flag for "this one is a GIF": the bytes say so themselves (a GIF
        // opens GIF89a, a PNG opens \x89PNG) and the server picks the
        // extension from them. A flag would be a second source of truth that
        // could disagree with the file it describes.
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
                    { /* Orientation, on its own and always there. It is how the
                         phone is HELD, not a kind of media, so it belongs to
                         neither mode and interrupts neither - including a
                         recording already under way. */ }
                    <button type="button" className={ 'phone-camera-rotate phone-tap' + (landscape ? ' is-on' : '') }
                        aria-label={ landscape ? 'Hold upright' : 'Hold wide' }
                        title={ landscape ? 'Hold upright' : 'Hold wide' }
                        onClick={ () => (setLandscape && setLandscape(!landscape)) }>
                        <PhoneIcon icon="rotate" size={ 17 } />
                    </button>
                    { (mode === 'video') && !recording &&
                        <div className="phone-camera-chip">GIF &middot; UP TO { GIF_SECONDS }s</div> }
                    { recording &&
                        <div className="phone-camera-chip is-rec">
                            <span className="phone-camera-rec-dot" />
                            { clock(elapsed) } / { clock(GIF_SECONDS) }
                        </div> }
                    { /* The mode row stands down while recording: switching to
                         stills half way through a take has no meaning, and a
                         live control that does nothing is worse than none. */ }
                    { !recording &&
                        <div className="phone-camera-mode">
                            { MODES.map(([ value, label ]) => (
                                <div key={ label } className={ 'phone-tap phone-camera-mode-option' + ((mode === value) ? ' is-on' : '') }
                                    onClick={ () => setMode(value) }>{ label }</div>
                            )) }
                        </div> }
                    { recording &&
                        <div className="phone-camera-mode is-recording">RECORDING</div> }
                    <div className="phone-camera-bar">
                        { !recording &&
                            <div className="phone-tap phone-camera-thumb" title="Photos" onClick={ event => (openPhotos && openPhotos()) }>
                                { latestPhoto &&
                                    <img src={ latestPhoto.url } alt="" /> }
                                { !latestPhoto &&
                                    <PhoneIcon icon="image" size={ 16 } /> }
                            </div> }
                        { recording && <div className="phone-camera-bar-spacer" /> }
                        { (mode === 'photo') &&
                            <div className="phone-tap phone-camera-shutter" title="Take photo" onClick={ takePicture }>
                                <div className="phone-camera-shutter-core" />
                            </div> }
                        { (mode === 'video') &&
                            <div className="phone-camera-record-wrap">
                                { recording &&
                                    <svg className="phone-camera-progress" viewBox="0 0 82 82" aria-hidden="true">
                                        <circle cx="41" cy="41" r="37" className="phone-camera-progress-track" />
                                        <circle cx="41" cy="41" r="37" className="phone-camera-progress-value"
                                            style={ { strokeDashoffset: (232.5 * (1 - Math.min(1, elapsed / GIF_SECONDS))) } } />
                                    </svg> }
                                <div className={ 'phone-tap phone-camera-shutter is-record' + (recording ? ' is-recording' : '') }
                                    title={ recording ? 'Stop recording' : 'Record a GIF' }
                                    onClick={ () => (recording ? stopRecording() : startRecording()) }>
                                    <div className="phone-camera-shutter-core" />
                                </div>
                            </div> }
                        { !recording &&
                            <div className="phone-tap phone-camera-exit" title="Close camera" onClick={ event => (onExit && onExit()) }>
                                <PhoneIcon icon="close" size={ 18 } />
                            </div> }
                        { recording && <div className="phone-camera-bar-spacer" /> }
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
