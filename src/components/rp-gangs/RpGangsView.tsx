import { ColorConverter, ILinkEventTracker } from '@nitrots/nitro-renderer';
import { FC, useEffect, useMemo, useState } from 'react';
import { AddEventLinkTracker, GetAvatarPalette, GetAvatarSetType, GetSessionDataManager, RemoveLinkEventTracker, SendMessageComposer } from '../../api';
import { RpBuyGangComposer, RpGetUserGangComposer, RpUserGangEvent } from '../../api/rp-gangs/RpGangMessages';
import { GetRpGang, SetRpGang } from '../../api/rp-gangs/RpGangRegistry';
import { Button, Column, Flex, LayoutCurrencyIcon, NitroCardContentView, NitroCardHeaderView, NitroCardView } from '../../common';
import { useMessageEvent } from '../../hooks';

// The Gang window, opened from the side drawer's gangs button
// (CreateLinkEvent('rp-gangs/toggle')) and the profile's gang card.
//
// Gangs ARE Habbo groups underneath (see
// docs/superpowers/specs/2026-09-04-gangs-on-groups-design.md): the two
// colors chosen here are stored as raw RGB in the group's colour1/colour2,
// which is what will paint a gang's turf furni later. The swatches are the
// SAME palette Choose Your Looks offers (the clothing palette from figure
// data, HC un-gated in this fork), so gang colors and outfit colors speak
// one language.
//
// Membership gates the view: RpGetUserGangComposer on open answers with
// RpUserGangEvent (gangId 0 = no gang -> the create view), and the same
// event arrives as a hotel-wide broadcast on every gang mutation, so the
// window flips to the member view the instant a creation succeeds.

type EditingColor = 'primary' | 'secondary';

const GANG_NAME_MAX_LENGTH = 29;
// the clothing palette - the big standard color grid in Choose Your Looks
const PALETTE_SET_TYPE = 'ch';

export const GangCrest: FC<{ primary: string, secondary: string, size?: number }> = ({ primary, secondary, size = 52 }) =>
{
    // 50/50 vertical split: primary fills the left half, secondary the right,
    // inside a neutral outline (neither half owns the border)
    return (
        <svg className="gang-crest" width={ size } height={ size } viewBox="0 0 24 24" fill="none">
            <defs>
                <clipPath id="gang-crest-clip">
                    <path d="M12 2 L20 5 V12 C20 17 16.5 20.5 12 22 C7.5 20.5 4 17 4 12 V5 Z" />
                </clipPath>
            </defs>
            <g clipPath="url(#gang-crest-clip)">
                <rect x="0" y="0" width="12" height="24" fill={ primary } />
                <rect x="12" y="0" width="12" height="24" fill={ secondary } />
            </g>
            <path d="M12 2 L20 5 V12 C20 17 16.5 20.5 12 22 C7.5 20.5 4 17 4 12 V5 Z" fill="none" stroke="rgba(0, 0, 0, 0.4)" strokeWidth="0.8" strokeLinejoin="round" />
        </svg>
    );
}

// '#rrggbb', 'rrggbb' or 'rgb(r, g, b)' -> raw RGB int for the wire
const cssColorToInt = (value: string): number =>
{
    const matches = value.match(/rgba?\((\d+)[,\s]+(\d+)[,\s]+(\d+)/);

    if(matches) return ((parseInt(matches[1]) << 16) + (parseInt(matches[2]) << 8) + parseInt(matches[3]));

    return (parseInt(value.replace('#', ''), 16) || 0);
}

export const RpGangsView: FC<{}> = props =>
{
    const [ isVisible, setIsVisible ] = useState(false);
    const [ gangName, setGangName ] = useState('');
    const [ editing, setEditing ] = useState<EditingColor>('primary');
    const [ primaryHex, setPrimaryHex ] = useState<string>(null);
    const [ secondaryHex, setSecondaryHex ] = useState<string>(null);
    const [ gangCost, setGangCost ] = useState<number>(0);
    const [ buyPending, setBuyPending ] = useState(false);
    const [ , setVersion ] = useState(0);

    const ownUserId = GetSessionDataManager().userId;

    // The Choose Your Looks clothing palette, as CSS colors. Figure data is
    // loaded long before any window opens in-room, but guard anyway.
    const palette = useMemo(() =>
    {
        if(!isVisible) return [];

        const setType = GetAvatarSetType(PALETTE_SET_TYPE);

        if(!setType) return [];

        const avatarPalette = GetAvatarPalette(setType.paletteID);

        if(!avatarPalette) return [];

        const colors: string[] = [];

        for(const partColor of avatarPalette.colors.getValues())
        {
            if(partColor && partColor.isSelectable) colors.push(ColorConverter.int2rgb(partColor.rgb));
        }

        return colors;
    }, [ isVisible ]);

    // default the two gang colors to the palette's first entries once known
    useEffect(() =>
    {
        if(palette.length < 2) return;

        setPrimaryHex(prevValue => (prevValue ?? palette[0]));
        setSecondaryHex(prevValue => (prevValue ?? palette[1]));
    }, [ palette ]);

    // Request replies and hotel-wide broadcasts alike: keep the registry
    // fresh, learn the price, and re-render - a successful creation flips
    // this window from create to member live off the broadcast.
    useMessageEvent<RpUserGangEvent>(RpUserGangEvent, event =>
    {
        const parser = event.getParser();

        SetRpGang(parser.userId, { gangId: parser.gangId, name: parser.name, colourA: parser.colourA, colourB: parser.colourB, isOwner: parser.isOwner });

        if(parser.gangCost > 0) setGangCost(parser.gangCost);
        if(parser.userId === ownUserId) setBuyPending(false);

        setVersion(value => (value + 1));
    });

    useEffect(() =>
    {
        if(!isVisible) return;

        SendMessageComposer(new RpGetUserGangComposer(ownUserId));
    }, [ isVisible, ownUserId ]);

    useEffect(() =>
    {
        const linkTracker: ILinkEventTracker = {
            linkReceived: (url: string) =>
            {
                const parts = url.split('/');

                if(parts.length < 2) return;

                switch(parts[1])
                {
                    case 'show':
                        setIsVisible(true);
                        return;
                    case 'hide':
                        setIsVisible(false);
                        return;
                    case 'toggle':
                        setIsVisible(prevValue => !prevValue);
                        return;
                }
            },
            eventUrlPrefix: 'rp-gangs/'
        };

        AddEventLinkTracker(linkTracker);

        return () => RemoveLinkEventTracker(linkTracker);
    }, []);

    if(!isVisible) return null;

    const ownGang = GetRpGang(ownUserId);
    const activeHex = ((editing === 'primary') ? primaryHex : secondaryHex);
    const canCreate = (!!gangName.trim() && !!primaryHex && !!secondaryHex && !buyPending);

    const selectColor = (color: string) =>
    {
        if(editing === 'primary') setPrimaryHex(color);
        else setSecondaryHex(color);
    }

    const createGang = () =>
    {
        if(!canCreate) return;

        setBuyPending(true);
        SendMessageComposer(new RpBuyGangComposer(gangName.trim(), cssColorToInt(primaryHex), cssColorToInt(secondaryHex)));
    }

    return (
        <NitroCardView uniqueKey="rp-gangs" className="nitro-rp-gangs" theme="primary-slim">
            <NitroCardHeaderView headerText="Gang" onCloseClick={ () => setIsVisible(false) } />
            <NitroCardContentView>
                { ownGang &&
                    <div className="gang-member-view">
                        <GangCrest primary={ ownGang.colourA } secondary={ ownGang.colourB } size={ 72 } />
                        <div className="gang-member-name">{ ownGang.name }</div>
                        <div className="gang-member-role">{ ownGang.isOwner ? 'You lead this gang.' : 'You are a member of this gang.' }</div>
                        <div className="gang-member-hint">Rosters, invites and turf are on the way.</div>
                    </div> }
                { !ownGang &&
                    <>
                        <Flex alignItems="center" gap={ 2 }>
                            <GangCrest primary={ primaryHex ?? '#999999' } secondary={ secondaryHex ?? '#4c4c4c' } />
                            <input className="form-control" type="text" placeholder="Enter gang name..." maxLength={ GANG_NAME_MAX_LENGTH }
                                value={ gangName } onChange={ event => setGangName(event.target.value) } />
                        </Flex>
                        <Column gap={ 0 }>
                            { /* the pickers are tabs attached to the palette: the open
                                 tab IS the color being edited */ }
                            <Flex gap={ 1 } className="gang-palette-tabs">
                                <Flex center pointer gap={ 1 } className={ `gang-palette-tab${ (editing === 'primary') ? ' is-active' : '' }` } onClick={ () => setEditing('primary') }>
                                    <span className="gang-tab-swatch" style={ { backgroundColor: primaryHex } } /> PRIMARY
                                </Flex>
                                <Flex center pointer gap={ 1 } className={ `gang-palette-tab${ (editing === 'secondary') ? ' is-active' : '' }` } onClick={ () => setEditing('secondary') }>
                                    <span className="gang-tab-swatch" style={ { backgroundColor: secondaryHex } } /> SECONDARY
                                </Flex>
                            </Flex>
                            <div className="gang-color-grid">
                                { palette.map((color, index) => (
                                    <div key={ index } className={ `gang-color-swatch cursor-pointer${ (color === activeHex) ? ' is-selected' : '' }` }
                                        style={ { backgroundColor: color } } onClick={ () => selectColor(color) } />
                                )) }
                            </div>
                        </Column>
                        <Flex className="gang-create-row">
                            <Flex center gap={ 1 } className="gang-create-cost">
                                <LayoutCurrencyIcon type={ -1 } /> { gangCost }
                            </Flex>
                            <Button fullWidth variant="success" disabled={ !canCreate } onClick={ createGang }>{ buyPending ? 'Founding…' : 'Create Gang' }</Button>
                        </Flex>
                    </> }
            </NitroCardContentView>
        </NitroCardView>
    );
};
