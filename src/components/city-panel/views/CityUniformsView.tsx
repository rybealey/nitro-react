import { HabboClubLevelEnum } from '@nitrots/nitro-renderer';
import { FC, useCallback, useEffect, useMemo, useState } from 'react';
import { CreateUniformModels, DisposeUniformModels, FigureData, generateRandomFigure, GetSessionDataManager, SendMessageComposer, UniformModel, UniformPartsOf } from '../../../api';
import { CityUniformCorp, RpCityUniformComposer, RpCityUniformFigureEvent, RpCityUniformListEvent, RpCityUniformSaveComposer, RpCityUniformsComposer, UniformKind } from '../../../api/rp-city/RpCityMessages';
import { LayoutAvatarImageView } from '../../../common';
import { useMessageEvent } from '../../../hooks';
import { AvatarEditorIcon } from '../../avatar-editor/views/AvatarEditorIcon';
import { AvatarEditorModelView } from '../../avatar-editor/views/AvatarEditorModelView';

// The City Panel's Uniforms tab: what a corporation's ranks wear on duty, and
// what prisoners wear - for each gender - edited the way Choose Your Look
// edits your own clothes (design: the canvas's Uniforms artboard). Saving
// re-dresses everyone wearing it at once (emulator UniformManager.Save).
//
// A uniform is clothing only. The preview wears it over a plain head, but in
// game every player keeps their own hair and face under it.

const CATEGORIES = [ 'Head', 'Torso', 'Legs' ];

// The head the preview draws the uniform on - never saved (UniformPartsOf).
const PREVIEW_HEAD: Record<string, string> = {
    [FigureData.MALE]: 'hd-180-1.hr-100-61',
    [FigureData.FEMALE]: 'hd-600-1.hr-515-33'
};

interface Wearer
{
    kind: string;
    rankId: number;
    title: string;
}

const PRISONERS: Wearer = { kind: UniformKind.Prisoner, rankId: 0, title: 'Prisoner uniform' };

export const CityUniformsView: FC<{}> = props =>
{
    const [ corps, setCorps ] = useState<CityUniformCorp[]>([]);
    const [ prisoner, setPrisoner ] = useState({ male: false, female: false });
    const [ corpId, setCorpId ] = useState(0);
    const [ wearer, setWearer ] = useState<Wearer>(null);
    const [ gender, setGender ] = useState(FigureData.MALE);
    const [ saved, setSaved ] = useState<string>(null);
    const [ figure, setFigure ] = useState<FigureData>(null);
    const [ models, setModels ] = useState<UniformModel[]>([]);
    // Bumped with every fresh set of models, so the editor remounts on them
    // and never draws one that has been freed.
    const [ modelsId, setModelsId ] = useState(0);
    const [ category, setCategory ] = useState(1);
    const [ direction, setDirection ] = useState(2);
    const [ figureText, setFigureText ] = useState('');
    const [ notice, setNotice ] = useState('');
    const [ , setTick ] = useState(0);

    useEffect(() =>
    {
        SendMessageComposer(new RpCityUniformsComposer());
    }, []);

    useMessageEvent<RpCityUniformListEvent>(RpCityUniformListEvent, event =>
    {
        const parser = event.getParser();

        setCorps(parser.corps);
        setPrisoner({ male: parser.prisonerMale, female: parser.prisonerFemale });
        setCorpId(prev => (prev || (parser.corps.length ? parser.corps[0].id : 0)));
    });

    // One uniform in the editor: its parts over the preview head, and a fresh
    // set of Head / Torso / Legs models on that figure.
    const load = useCallback((parts: string, forGender: string) =>
    {
        const next = new FigureData();

        next.loadAvatarData([ PREVIEW_HEAD[forGender], parts ].filter(Boolean).join('.'), forGender);
        next.direction = direction;
        next.notify = () =>
        {
            setFigureText(UniformPartsOf(next.getFigureString()));
            setTick(prev => (prev + 1));
        };

        setFigure(next);
        setModels(CreateUniformModels(next));
        setModelsId(prev => (prev + 1));
        setFigureText(UniformPartsOf(parts));
    }, [ direction ]);

    useEffect(() =>
    {
        if(!wearer) return;

        setSaved(null);
        setNotice('');
        SendMessageComposer(new RpCityUniformComposer(wearer.kind, wearer.rankId, gender));
    }, [ wearer, gender ]);

    useMessageEvent<RpCityUniformFigureEvent>(RpCityUniformFigureEvent, event =>
    {
        const parser = event.getParser();

        if(!wearer || (parser.kind !== wearer.kind) || (parser.rankId !== wearer.rankId) || (parser.gender !== gender)) return;

        setSaved(parser.figure);
        setNotice(parser.notice);
        load(parser.figure, gender);
    });

    useEffect(() => () =>
    {
        if(figure) figure.notify = null;
    }, [ figure ]);

    // Each load builds fresh models; the ones it replaces (and the last, on
    // leaving the tab) are freed rather than left holding their thumbnails.
    useEffect(() => () => DisposeUniformModels(models), [ models ]);

    const corp = corps.find(entry => (entry.id === corpId)) ?? null;
    const isMale = (gender === FigureData.MALE);
    const current = (figure ? UniformPartsOf(figure.getFigureString()) : '');
    const changed = ((saved !== null) && (current !== saved));

    const rotate = (by: number) =>
    {
        const next = ((direction + by + 8) % 8);

        setDirection(next);

        if(figure) figure.direction = next;
    }

    const randomise = () =>
    {
        if(!figure) return;

        const random = generateRandomFigure(figure, gender, HabboClubLevelEnum.VIP, [], [ FigureData.FACE, FigureData.HAIR ]);

        load(UniformPartsOf(random), gender);
    }

    const save = () =>
    {
        if(!wearer || !figure) return;

        SendMessageComposer(new RpCityUniformSaveComposer(wearer.kind, wearer.rankId, gender, current));
    }

    const dot = (has: boolean) => <span className={ `city-uniform-dot${ has ? ' is-set' : '' }` } title={ has ? 'Has a uniform' : 'No uniform yet' } />;

    const model = useMemo(() => (models.length ? models[category] : null), [ models, category ]);

    return (
        <div className="city-uniforms">
            <div className="city-uniform-wearers">
                <span className="mt-label">Corporation</span>
                <select className="form-select form-select-sm" aria-label="Corporation" value={ corpId } onChange={ event => setCorpId(Number(event.target.value)) }>
                    { corps.map(entry => <option key={ entry.id } value={ entry.id }>{ entry.name }</option>) }
                </select>
                <div className="mt-card city-uniform-list">
                    { corp && corp.ranks.map(rank =>
                        <button key={ rank.id } type="button" className={ `city-uniform-row${ ((wearer?.kind === UniformKind.Rank) && (wearer.rankId === rank.id)) ? ' is-active' : '' }` }
                            onClick={ () => setWearer({ kind: UniformKind.Rank, rankId: rank.id, title: `${ corp.name } · ${ rank.name }` }) }>
                            <span>{ rank.name }</span>{ dot(isMale ? rank.hasMale : rank.hasFemale) }
                        </button>) }
                    { corp && !corp.ranks.length && <div className="mt-empty">No ranks.</div> }
                </div>
                <span className="mt-label">Everyone else</span>
                <div className="mt-card city-uniform-list">
                    <button type="button" className={ `city-uniform-row is-prisoner${ (wearer?.kind === UniformKind.Prisoner) ? ' is-active' : '' }` } onClick={ () => setWearer(PRISONERS) }>
                        <span>Prisoners</span>{ dot(isMale ? prisoner.male : prisoner.female) }
                    </button>
                </div>
                <span className="mt-hint">{ dot(false) } No uniform yet: they wear their own clothes.</span>
            </div>
            <div className="city-uniform-editor">
                { !wearer && <div className="mt-empty">Pick a rank, or the prisoners, to dress them.</div> }
                { wearer &&
                    <>
                        <div className="city-uniform-head">
                            <div className="city-uniform-title">
                                <b>{ wearer.title }</b>
                                <span className="mt-muted">{ (wearer.kind === UniformKind.Prisoner) ? 'Worn by everyone serving a sentence, from booking to release.' : 'Worn while clocked in at this rank.' }</span>
                            </div>
                            <div className="city-uniform-gender" role="group" aria-label="Gender">
                                <button type="button" aria-label="Male" aria-pressed={ isMale } onClick={ () => setGender(FigureData.MALE) }><AvatarEditorIcon icon="male" selected={ isMale } /></button>
                                <button type="button" aria-label="Female" aria-pressed={ !isMale } onClick={ () => setGender(FigureData.FEMALE) }><AvatarEditorIcon icon="female" selected={ !isMale } /></button>
                            </div>
                            <button type="button" className="mt-chrome mt-small" disabled={ !figure } onClick={ () => load(UniformPartsOf(GetSessionDataManager().figure), gender) }>Copy my look</button>
                        </div>
                        <div className="mt-seg city-seg-3" role="tablist" aria-label="Outfit parts">
                            { CATEGORIES.map((name, index) =>
                                <button key={ name } type="button" role="tab" aria-selected={ (category === index) } className={ `mt-seg-button${ (category === index) ? ' is-on' : '' }` } onClick={ () => setCategory(index) }>{ name }</button>) }
                        </div>
                        <div className="city-uniform-body">
                            <div className="city-uniform-model">
                                { model && <AvatarEditorModelView key={ `${ modelsId }-${ category }` } model={ model } gender={ gender } setGender={ () => null } /> }
                            </div>
                            <div className="city-uniform-side">
                                <div className="city-uniform-preview">
                                    { figure && <LayoutAvatarImageView className="city-uniform-avatar" figure={ figure.getFigureString() } gender={ gender } direction={ direction } scale={ 2 } animate /> }
                                    <AvatarEditorIcon className="city-uniform-spotlight" icon="spotlight" />
                                    <div className="city-uniform-shadow" />
                                    <div className="city-uniform-arrows">
                                        <AvatarEditorIcon pointer icon="arrow-left" onClick={ () => rotate(1) } />
                                        <AvatarEditorIcon pointer icon="arrow-right" onClick={ () => rotate(-1) } />
                                    </div>
                                </div>
                                <div className="city-uniform-tools">
                                    <button type="button" className="mt-chrome" aria-label="Undo changes" title="Undo changes" disabled={ !changed } onClick={ () => load(saved ?? '', gender) }>Undo</button>
                                    <button type="button" className="mt-chrome" aria-label="Clear the outfit" title="Clear the outfit" onClick={ () => load('', gender) }>Clear</button>
                                    <button type="button" className="mt-chrome" aria-label="Random outfit" title="Random outfit" onClick={ randomise }>Random</button>
                                </div>
                                <button type="button" className="mt-success" disabled={ !figure || (saved === null) } onClick={ save }>{ current ? 'Save uniform' : 'Remove uniform' }</button>
                            </div>
                        </div>
                        <div className="city-uniform-foot">
                            <label className="mt-label" htmlFor="city-uniform-figure">Figure</label>
                            <input id="city-uniform-figure" className="form-control form-control-sm city-mono" type="text" value={ figureText } onChange={ event => setFigureText(event.target.value) } onBlur={ () => (UniformPartsOf(figureText) !== current) && load(UniformPartsOf(figureText), gender) } />
                            <span className="mt-muted">{ notice || ((wearer.kind === UniformKind.Prisoner) ? 'Saving re-dresses every prisoner now.' : 'Saving re-dresses everyone on duty at this rank now.') }</span>
                        </div>
                    </> }
            </div>
        </div>
    );
}
