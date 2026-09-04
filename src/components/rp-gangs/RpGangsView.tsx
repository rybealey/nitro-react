import { ColorConverter, GroupBuyComposer, GroupBuyDataComposer, GroupBuyDataEvent, ILinkEventTracker } from '@nitrots/nitro-renderer';
import { FC, useEffect, useMemo, useState } from 'react';
import { AddEventLinkTracker, GetAvatarPalette, GetAvatarSetType, RemoveLinkEventTracker, SendMessageComposer } from '../../api';
import { Button, Column, Flex, LayoutCurrencyIcon, NitroCardContentView, NitroCardHeaderView, NitroCardView } from '../../common';
import { useGroup, useMessageEvent } from '../../hooks';

// The Gang window, opened from the side drawer's gangs button
// (CreateLinkEvent('rp-gangs/toggle')).
//
// Gangs ARE Habbo groups underneath (see
// docs/superpowers/specs/2026-09-04-gangs-on-groups-design.md): the two
// colors chosen here become the group's colorA/colorB, which is what will
// paint a gang's turf furni later. The swatches are the SAME palette Choose
// Your Looks offers (the clothing palette from figure data, HC un-gated in
// this fork), so gang colors and outfit colors speak one language.
//
// This first slice always shows the CREATE view: nobody has a gang yet, and
// the is-in-a-gang gate needs a server packet (RpUserGangEvent, specced) to
// answer truthfully. When that lands, members see their gang instead.

type EditingColor = 'primary' | 'secondary';

const GANG_NAME_MAX_LENGTH = 29;
// the clothing palette - the big standard color grid in Choose Your Looks
const PALETTE_SET_TYPE = 'ch';

const GangCrest: FC<{ primary: string, secondary: string, size?: number }> = ({ primary, secondary, size = 52 }) =>
{
    // 50/50 vertical split: primary fills the left half, secondary the right,
    // inside a neutral outline (neither half owns the border anymore)
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
            <path d="M12 2 L20 5 V12 C20 17 16.5 20.5 12 22 C7.5 20.5 4 17 4 12 V5 Z" fill="none" stroke="rgba(0, 0, 0, 0.4)" strokeWidth="1.6" strokeLinejoin="round" />
        </svg>
    );
}

export const RpGangsView: FC<{}> = props =>
{
    const [ isVisible, setIsVisible ] = useState(false);
    const [ gangName, setGangName ] = useState('');
    const [ editing, setEditing ] = useState<EditingColor>('primary');
    const [ primaryHex, setPrimaryHex ] = useState<string>(null);
    const [ secondaryHex, setSecondaryHex ] = useState<string>(null);
    const [ purchaseCost, setPurchaseCost ] = useState<number>(0);
    const { groupCustomize = null } = useGroup();

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

    useMessageEvent<GroupBuyDataEvent>(GroupBuyDataEvent, event =>
    {
        setPurchaseCost(event.getParser().groupCost);
    });

    useEffect(() =>
    {
        if(!isVisible) return;

        SendMessageComposer(new GroupBuyDataComposer());
    }, [ isVisible ]);

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

    const activeHex = ((editing === 'primary') ? primaryHex : secondaryHex);
    const canCreate = (!!gangName.trim() && !!primaryHex && !!secondaryHex);

    const selectColor = (color: string) =>
    {
        if(editing === 'primary') setPrimaryHex(color);
        else setSecondaryHex(color);
    }

    // The purchase stores group colour IDS (that's what tints group furni),
    // so map each chosen figure-palette color to the closest group colour.
    // Slice 2's RpBuyGangComposer may store the exact hex instead.
    const nearestGroupColorId = (hex: string, list: { id: number, color: string }[]): number =>
    {
        if(!hex || !list?.length) return -1;

        // accepts '#rrggbb', 'rrggbb' and 'rgb(r, g, b)' (int2rgb's output
        // feeds CSS directly elsewhere, so its exact shape is CSS-valid but
        // not pinned down here)
        const parse = (value: string) =>
        {
            const matches = value.match(/rgba?\((\d+)[,\s]+(\d+)[,\s]+(\d+)/);

            if(matches) return [ parseInt(matches[1]), parseInt(matches[2]), parseInt(matches[3]) ];

            const clean = value.replace('#', '');

            return [ parseInt(clean.substring(0, 2), 16), parseInt(clean.substring(2, 4), 16), parseInt(clean.substring(4, 6), 16) ];
        };

        const [ r, g, b ] = parse(hex);

        let bestId = list[0].id;
        let bestDistance = Number.MAX_VALUE;

        for(const entry of list)
        {
            const [ er, eg, eb ] = parse(entry.color);
            const distance = (((r - er) ** 2) + ((g - eg) ** 2) + ((b - eb) ** 2));

            if(distance < bestDistance)
            {
                bestDistance = distance;
                bestId = entry.id;
            }
        }

        return bestId;
    }

    const createGang = () =>
    {
        if(!canCreate) return;

        // A gang is a group purchase: default badge (first base in the first
        // part color — the badge editor is a later slice), no homeroom. The
        // emulator's gang slice accepts roomless purchases and flags the
        // group as a gang; until it lands the stock handler validates and
        // refuses, so clicking is safe but inert on an unpatched server.
        const badge: number[] = [];

        if(groupCustomize?.badgeBases?.length && groupCustomize?.badgePartColors?.length)
        {
            badge.push(groupCustomize.badgeBases[0].id, groupCustomize.badgePartColors[0].id, 0);
        }

        const colorA = nearestGroupColorId(primaryHex, groupCustomize?.groupColorsA);
        const colorB = nearestGroupColorId(secondaryHex, groupCustomize?.groupColorsB);

        SendMessageComposer(new GroupBuyComposer(gangName.trim(), '', -1, colorA, colorB, badge));
    }

    return (
        <NitroCardView uniqueKey="rp-gangs" className="nitro-rp-gangs" theme="primary-slim">
            <NitroCardHeaderView headerText="Gang" onCloseClick={ () => setIsVisible(false) } />
            <NitroCardContentView>
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
                        <LayoutCurrencyIcon type={ -1 } /> { purchaseCost }
                    </Flex>
                    <Button fullWidth variant="success" disabled={ !canCreate } onClick={ createGang }>Create Gang</Button>
                </Flex>
            </NitroCardContentView>
        </NitroCardView>
    );
};
