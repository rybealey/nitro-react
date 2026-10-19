import { WritePref } from '../prefs/AccountPrefs';

// pixelrp: through AccountPrefs, so a setting the account keeps (a window's
// position, a panel left open) is saved there too; anything else stays local.
export const SetLocalStorage = <T>(key: string, value: T) => WritePref(key, JSON.stringify(value));
