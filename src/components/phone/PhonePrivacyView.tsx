import { FC, useEffect, useState } from 'react';
import { GetRpPrivacy, PRIVACY_CONTACTS, PRIVACY_CUSTOM, PRIVACY_EVERYONE, PRIVACY_NOBODY, RpPrivacy, SaveRpPrivacy, SubscribeRpPrivacy } from '../../api/rp-phone/RpPrivacyMessages';
import { PhoneIcon } from './PhoneIcon';

// Settings > Privacy. Who may see the personal details that show on a
// player's profile.
//
// Two fields, separate audiences, because they leak different things. A
// birthday is a real date about a real person and reads no one / contacts /
// everyone. A region says roughly when somebody is about, which is useful to
// the people they play with: no one / custom / everyone, where custom reveals
// the two lists as switches.
//
// The birthday deliberately does NOT get the custom treatment - none of its
// three options is two of the others added together, so the pattern would only
// add a tap.
//
// Nothing here is enforced client-side. The server withholds the data itself,
// and a hidden field comes back looking exactly like one that was never set.

interface Option { id: number; label: string; hint: string }

const BIRTHDAY_OPTIONS: Option[] = [
    { id: PRIVACY_NOBODY, label: 'No one', hint: 'Hidden from your profile' },
    { id: PRIVACY_CONTACTS, label: 'Contacts', hint: 'People saved in your phone' },
    { id: PRIVACY_EVERYONE, label: 'Everyone', hint: 'Anyone who opens your profile' }
];

const REGION_OPTIONS: Option[] = [
    { id: PRIVACY_NOBODY, label: 'No one', hint: 'Hidden from your profile' },
    { id: PRIVACY_CUSTOM, label: 'Custom', hint: 'Pick which lists can see it' },
    { id: PRIVACY_EVERYONE, label: 'Everyone', hint: 'Anyone who opens your profile' }
];

interface PhonePrivacyViewProps
{
    onBack: () => void;
}

const PickerRow: FC<{ option: Option; picked: boolean; onPick: () => void }> = ({ option, picked, onPick }) => (
    <div className="phone-settings-item phone-tap phone-privacy-item" onClick={ event => onPick() }>
        <div className="phone-privacy-text">
            <div className="phone-settings-item-label">{ option.label }</div>
            <div className="phone-privacy-hint">{ option.hint }</div>
        </div>
        { picked && <PhoneIcon icon="check" size={ 17 } className="phone-privacy-check" /> }
    </div>
);

export const PhonePrivacyView: FC<PhonePrivacyViewProps> = props =>
{
    const { onBack = null } = props;
    const [ privacy, setPrivacy ] = useState<RpPrivacy>(() => GetRpPrivacy());

    // The login push may land after this mounts, and the server echoes every
    // save back - either way the screen follows what the server holds.
    useEffect(() => SubscribeRpPrivacy(() => setPrivacy(GetRpPrivacy())), []);

    const update = (patch: Partial<RpPrivacy>) => SaveRpPrivacy({ ...privacy, ...patch });

    return (
        <div className="phone-screen phone-app-screen phone-settings phone-privacy">
            <div className="phone-app-scroll">
                <div className="phone-app-header">
                    <div className="phone-app-header-lead">
                        <div className="phone-tap phone-thread-back" onClick={ event => (onBack && onBack()) }>
                            <PhoneIcon icon="chevron-left" size={ 24 } />
                        </div>
                        <div>
                            <div className="phone-app-kicker">PIXELRP SETTINGS</div>
                            <div className="phone-app-title">Privacy</div>
                        </div>
                    </div>
                </div>
                <div className="phone-settings-list">
                    <div>
                        <div className="phone-section-label">Birthday</div>
                        <div className="phone-settings-card">
                            { BIRTHDAY_OPTIONS.map(option => (
                                <PickerRow key={ option.id } option={ option } picked={ privacy.birthday === option.id }
                                    onPick={ () => update({ birthday: option.id }) } />
                            )) }
                        </div>
                        <div className="phone-settings-footnote phone-privacy-note">Shown as a day and month. The year stays private either way.</div>
                    </div>

                    <div>
                        <div className="phone-section-label">Region</div>
                        <div className="phone-settings-card">
                            { REGION_OPTIONS.map(option => (
                                <PickerRow key={ option.id } option={ option } picked={ privacy.region === option.id }
                                    onPick={ () => update({ region: option.id }) } />
                            )) }
                        </div>
                        <div className="phone-settings-footnote phone-privacy-note">Set your region in General. This only decides who sees it beside your motto.</div>
                    </div>

                    { (privacy.region === PRIVACY_CUSTOM) &&
                        <div>
                            <div className="phone-section-label">Share region with</div>
                            <div className="phone-settings-card">
                                <div className="phone-settings-item phone-tap phone-privacy-item"
                                    onClick={ event => update({ regionColleagues: !privacy.regionColleagues }) }>
                                    <div className="phone-privacy-text">
                                        <div className="phone-settings-item-label">Colleagues</div>
                                        <div className="phone-privacy-hint">People in your corporation</div>
                                    </div>
                                    <div className={ `phone-privacy-switch${ privacy.regionColleagues ? ' is-on' : '' }` }><div className="phone-privacy-knob" /></div>
                                </div>
                                <div className="phone-settings-item phone-tap phone-privacy-item"
                                    onClick={ event => update({ regionFriends: !privacy.regionFriends }) }>
                                    <div className="phone-privacy-text">
                                        <div className="phone-settings-item-label">Friends</div>
                                        <div className="phone-privacy-hint">People on your friends list</div>
                                    </div>
                                    <div className={ `phone-privacy-switch${ privacy.regionFriends ? ' is-on' : '' }` }><div className="phone-privacy-knob" /></div>
                                </div>
                            </div>
                            <div className="phone-settings-footnote phone-privacy-note">Turning both off is the same as sharing with no one.</div>
                        </div> }
                </div>
                <div className="phone-scroll-spacer" />
            </div>
        </div>
    );
}
