import { RpSaveUiSettingsComposer } from '@nitrots/nitro-renderer';
import { useEffect, useState } from 'react';
import { SendMessageComposer } from '../../api';
import { DEFAULT_USERNAME_ICON } from './IconChoices';
import { DEFAULT_CHROME_COLOR, DEFAULT_CHROME_OPACITY, DEFAULT_HEADER_KEY } from './UiChrome';
import { DEFAULT_USERNAME_COLOR } from './UsernameColors';

// The account's UI settings: the window colours (Settings > UI > Colours) and
// the name's colour and icon (the Customisation window). The server keeps all
// six in one row and takes them in one message (RpSaveUiSettingsComposer), so
// a save from either window carries the other's values too. They are kept
// here, shared, so neither window can save over what the other just changed.
// The values arrive at login (RpUiSettingsEvent, read in RpSettingsView).

export interface UiAccountSettings
{
    chromeColor: string;
    chromeOpacity: number;
    headerKey: string;
    usernameColor: string;
    usernameIcon: string;
    usernameIconColor: string;
}

let settings: UiAccountSettings = {
    chromeColor: DEFAULT_CHROME_COLOR,
    chromeOpacity: DEFAULT_CHROME_OPACITY,
    headerKey: DEFAULT_HEADER_KEY,
    usernameColor: DEFAULT_USERNAME_COLOR,
    usernameIcon: DEFAULT_USERNAME_ICON,
    usernameIconColor: DEFAULT_USERNAME_COLOR
};

const listeners = new Set<() => void>();

const notify = (): void => listeners.forEach(listener => listener());

export const GetUiAccountSettings = (): UiAccountSettings => settings;

// what the server holds - nothing is sent back
export const SetUiAccountSettings = (next: UiAccountSettings): void =>
{
    settings = { ...next };
    notify();
}

export const SaveUiAccountSettings = (changes: Partial<UiAccountSettings>): void =>
{
    settings = { ...settings, ...changes };
    notify();

    // '' resets the server row's color/header/username/icon to default
    SendMessageComposer(new RpSaveUiSettingsComposer(
        (settings.chromeColor === DEFAULT_CHROME_COLOR) ? '' : settings.chromeColor,
        settings.chromeOpacity,
        (settings.headerKey === DEFAULT_HEADER_KEY) ? '' : settings.headerKey,
        (settings.usernameColor === DEFAULT_USERNAME_COLOR) ? '' : settings.usernameColor,
        settings.usernameIcon,
        (settings.usernameIconColor === DEFAULT_USERNAME_COLOR) ? '' : settings.usernameIconColor));
}

export const useUiAccountSettings = (): UiAccountSettings =>
{
    const [ , setTick ] = useState(0);

    useEffect(() =>
    {
        const listener = () => setTick(value => (value + 1));

        listeners.add(listener);

        return () =>
        {
            listeners.delete(listener);
        };
    }, []);

    return settings;
}
