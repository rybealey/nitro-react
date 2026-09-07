import { FC, useEffect, useState } from 'react';
import { PhoneIcon } from './PhoneIcon';
import { IsPhotoWallpaper, MakePhotoWallpaper, PhotoWallpaperUrl, WALLPAPERS, WallpaperStyle } from './PhoneWallpapers';
import { usePhonePhotos, usePhonePrefs } from './usePhone';

// Wallpaper sub-screen (reached from Settings): six built-in wallpapers as
// phone-shaped tiles, then the player's latest captured photos. Tapping
// either applies it to the home screen at once; All opens every photo.

interface PhoneWallpaperViewProps
{
    onBack: () => void;
}

const STRIP_COUNT: number = 4;

export const PhoneWallpaperView: FC<PhoneWallpaperViewProps> = props =>
{
    const { onBack = null } = props;
    const { wallpaper, setWallpaper } = usePhonePrefs();
    const { photos, photosLoaded, requestPhotos } = usePhonePhotos();
    const [ sheetOpen, setSheetOpen ] = useState(false);

    useEffect(() =>
    {
        if(!photosLoaded) requestPhotos();
    }, []);

    const chosenUrl = PhotoWallpaperUrl(wallpaper);
    const recent = photos.slice(0, STRIP_COUNT);

    const pickPhoto = (url: string) =>
    {
        setWallpaper(MakePhotoWallpaper(url));
        setSheetOpen(false);
    }

    const tile = (key: string, name: string, index: number) =>
    {
        const chosen = (wallpaper === key);

        return (
            <div key={ key } className="phone-tap phone-wallpaper-option" style={ { animationDelay: `${ 40 + (index * 35) }ms` } } onClick={ event => setWallpaper(key) }>
                <div className={ `phone-wallpaper-tile${ chosen ? ' is-chosen' : '' }` }>
                    <div className={ `phone-wallpaper-tile-art${ (key === 'lobby') ? ' is-lobby' : '' }` } style={ WallpaperStyle(key, 0.5) } />
                    <div className="phone-wallpaper-tile-dock"><span /><span /><span /><span /></div>
                    { chosen &&
                        <div className="phone-wallpaper-check"><PhoneIcon icon="check" size={ 11 } /></div> }
                </div>
                <div className={ `phone-wallpaper-name${ chosen ? ' is-chosen' : '' }` }>{ name }</div>
            </div>
        );
    }

    const thumb = (url: string, large: boolean) =>
    {
        const chosen = (chosenUrl === url);

        return (
            <div key={ url } className={ `phone-tap phone-wallpaper-photo${ large ? ' is-large' : '' }${ chosen ? ' is-chosen' : '' }` } onClick={ event => pickPhoto(url) }>
                <img src={ url } alt="" loading="lazy" />
                { chosen &&
                    <div className="phone-wallpaper-check is-centre"><PhoneIcon icon="check" size={ 13 } /></div> }
            </div>
        );
    }

    return (
        <div className="phone-screen phone-app-screen phone-settings phone-wallpaper">
            <div className="phone-app-scroll">
                <div className="phone-app-header">
                    <div className="phone-app-header-lead">
                        <div className="phone-tap phone-thread-back" onClick={ event => (onBack && onBack()) }>
                            <PhoneIcon icon="chevron-left" size={ 24 } />
                        </div>
                        <div>
                            <div className="phone-app-kicker">DISPLAY</div>
                            <div className="phone-app-title">Wallpaper</div>
                        </div>
                    </div>
                </div>
                <div className="phone-settings-list">
                    <div>
                        <div className="phone-section-label">Wallpapers</div>
                        <div className="phone-settings-card">
                            <div className="phone-wallpaper-grid">
                                { WALLPAPERS.map((item, index) => tile(item.key, item.name, index)) }
                            </div>
                        </div>
                    </div>
                    <div>
                        <div className="phone-section-label">Your photos</div>
                        <div className="phone-settings-card">
                            { (recent.length > 0)
                                ? <div className="phone-wallpaper-strip">
                                    { recent.map(photo => thumb(photo.url, false)) }
                                    <div className="phone-tap phone-wallpaper-all" onClick={ event => setSheetOpen(true) }>
                                        <PhoneIcon icon="image" size={ 16 } />
                                        <span>All { photos.length }</span>
                                    </div>
                                </div>
                                : <div className="phone-wallpaper-empty">{ photosLoaded ? 'Take a photo with the Camera and it will show up here.' : 'Loading your photos…' }</div> }
                        </div>
                    </div>
                </div>
                <div className="phone-settings-footnote">{ IsPhotoWallpaper(wallpaper) ? 'Your photo is cropped to fill the home screen. It only changes your phone.' : 'Your wallpaper is the picture behind your home screen and nothing else.' }</div>
                <div className="phone-scroll-spacer" />
            </div>

            { sheetOpen &&
                <>
                    <div className="phone-calendar-scrim" onClick={ event => setSheetOpen(false) } />
                    <div className="phone-calendar-sheet phone-wallpaper-sheet">
                        <div className="phone-calendar-grabber" />
                        <div className="phone-wallpaper-sheet-head">
                            <div className="phone-wallpaper-sheet-title">Your photos</div>
                            <div className="phone-wallpaper-sheet-sub">Tap one to use it</div>
                        </div>
                        <div className="phone-wallpaper-sheet-grid">
                            { photos.map(photo => thumb(photo.url, true)) }
                        </div>
                    </div>
                </> }
        </div>
    );
}
