import { ColorConverter } from '@nitrots/nitro-renderer';
import { FC, useEffect, useMemo, useState } from 'react';
import { GetAvatarPalette, GetAvatarSetType, SendMessageComposer } from '../../api';
import { RpBuyGangComposer, RpGangRespondInviteComposer } from '../../api/rp-gangs/RpGangMessages';
import { FormatGangCountdown, GangIncomingInvite } from '../../api/rp-gangs/RpGangTypes';
import { Button, Column, Flex, LayoutCurrencyIcon } from '../../common';
import { GangCrest } from './GangCrest';

type EditingColor = 'primary' | 'secondary';

const GANG_NAME_MAX_LENGTH = 29;
// the clothing palette - the big standard color grid in Choose Your Looks
const PALETTE_SET_TYPE = 'ch';

// '#rrggbb', 'rrggbb' or 'rgb(r, g, b)' -> raw RGB int for the wire
const cssColorToInt = (value: string): number =>
{
    const matches = value.match(/rgba?\((\d+)[,\s]+(\d+)[,\s]+(\d+)/);

    if(matches) return ((parseInt(matches[1]) << 16) + (parseInt(matches[2]) << 8) + parseInt(matches[3]));

    return (parseInt(value.replace('#', ''), 16) || 0);
}

interface GangCreateViewProps
{
    gangCost: number;
    buyPending: boolean;
    onBuy: () => void;
    incomingInvites: GangIncomingInvite[];
    nowSeconds: number;
}

// The window's no-gang state: any invites waiting on the player first (accept
// or decline right there), then the founding form - crest + name, the palette
// tabs (the open tab IS the colour being edited), and cost + Create as one
// control.
export const GangCreateView: FC<GangCreateViewProps> = props =>
{
    const { gangCost = 0, buyPending = false, onBuy = null, incomingInvites = [], nowSeconds = 0 } = props;
    const [ gangName, setGangName ] = useState('');
    const [ editing, setEditing ] = useState<EditingColor>('primary');
    const [ primaryHex, setPrimaryHex ] = useState<string>(null);
    const [ secondaryHex, setSecondaryHex ] = useState<string>(null);

    // The Choose Your Looks clothing palette, as CSS colors. Figure data is
    // loaded long before any window opens in-room, but guard anyway.
    const palette = useMemo(() =>
    {
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
    }, []);

    // default the two gang colors to the palette's first entries once known
    useEffect(() =>
    {
        if(palette.length < 2) return;

        setPrimaryHex(prevValue => (prevValue ?? palette[0]));
        setSecondaryHex(prevValue => (prevValue ?? palette[1]));
    }, [ palette ]);

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

        onBuy && onBuy();
        SendMessageComposer(new RpBuyGangComposer(gangName.trim(), cssColorToInt(primaryHex), cssColorToInt(secondaryHex)));
    }

    return (
        <>
            { (incomingInvites.length > 0) &&
                <>
                    <Column gap={ 1 }>
                        { incomingInvites.map(invite => (
                            <div key={ invite.gangId } className="gang-card gang-invite-banner">
                                <GangCrest primary={ invite.colourA } secondary={ invite.colourB } size={ 34 } />
                                <div className="gang-invite-banner-info">
                                    <div className="gang-invite-banner-title">{ invite.name } invited you</div>
                                    <div className="gang-note">From { invite.invitedBy } · expires in { FormatGangCountdown(invite.expiresAt, nowSeconds) }</div>
                                </div>
                                <Flex gap={ 1 }>
                                    <Button variant="danger" onClick={ () => SendMessageComposer(new RpGangRespondInviteComposer(invite.gangId, false)) }>Decline</Button>
                                    <Button variant="success" onClick={ () => SendMessageComposer(new RpGangRespondInviteComposer(invite.gangId, true)) }>Accept</Button>
                                </Flex>
                            </div>
                        )) }
                    </Column>
                    <div className="gang-or-divider"><span /> or found your own <span /></div>
                </> }
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
        </>
    );
}
