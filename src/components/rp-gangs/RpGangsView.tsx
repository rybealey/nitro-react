import { GroupBuyComposer, GroupBuyDataComposer, GroupBuyDataEvent, ILinkEventTracker } from '@nitrots/nitro-renderer';
import { FC, useEffect, useState } from 'react';
import { AddEventLinkTracker, RemoveLinkEventTracker, SendMessageComposer } from '../../api';
import { Button, Column, Flex, LayoutCurrencyIcon, NitroCardContentView, NitroCardHeaderView, NitroCardView } from '../../common';
import { useGroup, useMessageEvent } from '../../hooks';

// The Gang window, opened from the side drawer's gangs button
// (CreateLinkEvent('rp-gangs/toggle')).
//
// Gangs ARE Habbo groups underneath (see
// docs/superpowers/specs/2026-09-04-gangs-on-groups-design.md): the two
// group colors chosen here are the same colorA/colorB that tint group
// furniture, which is what will paint a gang's turf furni later. The color
// palettes and the purchase cost come from the emulator's existing group
// system (GroupBadgePartsEvent / GroupBuyDataEvent) — nothing here is mocked.
//
// This first slice always shows the CREATE view: nobody has a gang yet, and
// the is-in-a-gang gate needs a server packet (RpUserGangEvent, specced) to
// answer truthfully. When that lands, members see their gang instead.

type EditingColor = 'primary' | 'secondary';

const GANG_NAME_MAX_LENGTH = 29;

export const RpGangsView: FC<{}> = props =>
{
    const [ isVisible, setIsVisible ] = useState(false);
    const [ gangName, setGangName ] = useState('');
    const [ editing, setEditing ] = useState<EditingColor>('primary');
    // selected color IDS (the emulator stores ids, not hex); null until the
    // palettes arrive and the defaults below pick the first of each list
    const [ primaryColorId, setPrimaryColorId ] = useState<number>(null);
    const [ secondaryColorId, setSecondaryColorId ] = useState<number>(null);
    const [ purchaseCost, setPurchaseCost ] = useState<number>(0);
    const { groupCustomize = null } = useGroup();

    useMessageEvent<GroupBuyDataEvent>(GroupBuyDataEvent, event =>
    {
        setPurchaseCost(event.getParser().groupCost);
    });

    // default each color to the first palette entry once the palettes arrive
    useEffect(() =>
    {
        if(!groupCustomize || !groupCustomize.groupColorsA?.length || !groupCustomize.groupColorsB?.length) return;

        setPrimaryColorId(prevValue => (prevValue ?? groupCustomize.groupColorsA[0].id));
        setSecondaryColorId(prevValue => (prevValue ?? groupCustomize.groupColorsB[0].id));
    }, [ groupCustomize ]);

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

    const hexFor = (colorId: number, list: { id: number, color: string }[]) => ('#' + (list?.find(entry => (entry.id === colorId))?.color ?? '000000'));

    const primaryHex = hexFor(primaryColorId, groupCustomize?.groupColorsA);
    const secondaryHex = hexFor(secondaryColorId, groupCustomize?.groupColorsB);
    const palette = ((editing === 'primary') ? groupCustomize?.groupColorsA : groupCustomize?.groupColorsB) ?? [];
    const selectedColorId = ((editing === 'primary') ? primaryColorId : secondaryColorId);
    const canCreate = (!!gangName.trim() && (primaryColorId !== null) && (secondaryColorId !== null));

    const selectColor = (colorId: number) =>
    {
        if(editing === 'primary') setPrimaryColorId(colorId);
        else setSecondaryColorId(colorId);
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

        SendMessageComposer(new GroupBuyComposer(gangName.trim(), '', -1, primaryColorId, secondaryColorId, badge));
    }

    return (
        <NitroCardView uniqueKey="rp-gangs" className="nitro-rp-gangs" theme="primary-slim">
            <NitroCardHeaderView headerText="Gang" onCloseClick={ () => setIsVisible(false) } />
            <NitroCardContentView>
                { /* identity band: live preview of the two gang colors — the
                     same colorA/colorB that will tint the gang's turf furni */ }
                <div className="gang-banner" style={ { background: `linear-gradient(90deg, ${ primaryHex } 0%, ${ primaryHex } 55%, ${ secondaryHex } 100%)` } } />
                <Flex alignItems="center" gap={ 2 }>
                    <div className="gang-badge-preview" style={ { backgroundColor: primaryHex, borderColor: secondaryHex } } />
                    <Column grow gap={ 1 }>
                        <input className="form-control" type="text" placeholder="Enter gang name..." maxLength={ GANG_NAME_MAX_LENGTH }
                            value={ gangName } onChange={ event => setGangName(event.target.value) } />
                        <Flex alignItems="center" gap={ 1 } className="gang-editing-row">
                            <span className="gang-editing-label">EDITING:</span>
                            <Flex pointer alignItems="center" gap={ 1 } className={ `gang-editing-chip${ (editing === 'primary') ? ' is-active' : '' }` } onClick={ () => setEditing('primary') }>
                                <span className="gang-editing-swatch" style={ { backgroundColor: primaryHex } } /> PRIMARY
                            </Flex>
                            <Flex pointer alignItems="center" gap={ 1 } className={ `gang-editing-chip${ (editing === 'secondary') ? ' is-active' : '' }` } onClick={ () => setEditing('secondary') }>
                                <span className="gang-editing-swatch" style={ { backgroundColor: secondaryHex } } /> SECONDARY
                            </Flex>
                        </Flex>
                    </Column>
                </Flex>
                <div className="gang-color-grid">
                    { palette.map(entry => (
                        <div key={ entry.id } className={ `gang-color-swatch cursor-pointer${ (entry.id === selectedColorId) ? ' is-selected' : '' }` }
                            style={ { backgroundColor: ('#' + entry.color) } } onClick={ () => selectColor(entry.id) } />
                    )) }
                </div>
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
