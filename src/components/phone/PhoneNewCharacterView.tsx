import { FC, useEffect, useState } from 'react';
import { CHARACTER_CREATED, CHARACTER_REFUSED, SendRpCreateCharacter, SubscribeRpCharacterResult } from '../../api/rp-phone/RpCharacterMessages';
import { LayoutAvatarImageView } from '../../common';
import { PhoneIcon } from './PhoneIcon';

// Wallet > New character. One account, up to three characters; this makes one.
//
// Two questions and no more. The name is what other players will know this
// character by and cannot be changed or deleted afterwards, which is the one
// thing this screen has to say plainly. Gender picks the outfit they start in
// - figuredata's sets are gendered, so a new character has to begin in one or
// the other - and nothing else about the look is decided here.
//
// Nothing is validated for real on this side. The hints below the field are a
// courtesy; the server checks the name against the same rules registration
// uses and answers with a sentence to show when it refuses.

// Previews only. The server reads the real starting looks from the
// start_look_male / start_look_female settings, so these two are here to be
// looked at, not to be sent.
const LOOK_MALE = 'hr-100-61.hd-180-1.ch-210-66.lg-270-110.sh-305-62';
const LOOK_FEMALE = 'hr-515-33.hd-600-1.ch-635-70.lg-716-66.sh-735-68';

const GENDERS = [
    { id: 'F', label: 'Female', figure: LOOK_FEMALE },
    { id: 'M', label: 'Male', figure: LOOK_MALE }
];

const MAX_NAME = 25;

interface PhoneNewCharacterViewProps
{
    onBack: () => void;
    onCreated: () => void;
}

export const PhoneNewCharacterView: FC<PhoneNewCharacterViewProps> = props =>
{
    const { onBack = null, onCreated = null } = props;
    const [ name, setName ] = useState('');
    const [ gender, setGender ] = useState('F');
    const [ error, setError ] = useState<string>(null);
    const [ sending, setSending ] = useState(false);

    // The server answers every create, and its refusal is the only one worth
    // showing - it is the one that knows what names are taken.
    useEffect(() => SubscribeRpCharacterResult((outcome, message) =>
    {
        setSending(false);

        if(outcome === CHARACTER_REFUSED)
        {
            setError(message || 'That name cannot be used.');

            return;
        }

        if(outcome === CHARACTER_CREATED) (onCreated && onCreated());
    }), [ onCreated ]);

    const submit = () =>
    {
        if(sending || (name.trim().length < 3)) return;

        setError(null);
        setSending(true);
        SendRpCreateCharacter(name.trim(), gender);
    };

    return (
        <div className="phone-screen phone-app-screen phone-settings phone-newchar">
            <div className="phone-app-scroll">
                <div className="phone-app-header">
                    <div className="phone-app-header-lead">
                        <div className="phone-tap phone-thread-back" onClick={ event => (onBack && onBack()) }>
                            <PhoneIcon icon="chevron-left" size={ 24 } />
                        </div>
                        <div>
                            <div className="phone-app-kicker">WALLET</div>
                            <div className="phone-app-title">New character</div>
                        </div>
                    </div>
                </div>

                <div className="phone-settings-list">
                    <div>
                        <div className="phone-section-label">Name</div>
                        <div className="phone-settings-card phone-newchar-field">
                            <input className="phone-newchar-input" value={ name } maxLength={ MAX_NAME } placeholder="Their name"
                                spellCheck={ false } autoComplete="off"
                                onChange={ event => { setName(event.target.value); setError(null); } } />
                            <div className="phone-newchar-count">{ name.length } / { MAX_NAME }</div>
                        </div>
                        <div className={ `phone-settings-footnote phone-newchar-note${ error ? ' is-bad' : '' }` }>
                            { error || 'Letters, numbers and _ . - only. This is the name other players will know you by.' }
                        </div>
                    </div>

                    <div>
                        <div className="phone-section-label">Starting look</div>
                        <div className="phone-newchar-genders">
                            { GENDERS.map(option => (
                                <div key={ option.id }
                                    className={ `phone-newchar-gender phone-tap${ (gender === option.id) ? ' is-on' : '' }` }
                                    onClick={ event => setGender(option.id) }>
                                    <div className="phone-newchar-figure">
                                        <LayoutAvatarImageView figure={ option.figure } gender={ option.id } direction={ 2 } />
                                    </div>
                                    <div className="phone-newchar-gender-label">{ option.label }</div>
                                </div>
                            )) }
                        </div>
                        <div className="phone-settings-footnote phone-newchar-note">
                            This only sets the clothes they start in. Everything about their look is yours to change in the Avatar Editor.
                        </div>
                    </div>

                    <div>
                        <div className={ `phone-newchar-create phone-tap${ ((name.trim().length < 3) || sending) ? ' is-off' : '' }` }
                            onClick={ event => submit() }>
                            { sending ? 'Creating…' : 'Create character' }
                        </div>
                        <div className="phone-settings-footnote phone-newchar-note">A character cannot be renamed or deleted once it exists.</div>
                    </div>
                </div>
                <div className="phone-scroll-spacer" />
            </div>
        </div>
    );
}
