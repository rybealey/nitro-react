import { FC, useState } from 'react';
import { SendMessageComposer } from '../../api';
import { RpBuyGangComposer, RpGangRespondInviteComposer } from '../../api/rp-gangs/RpGangMessages';
import { FormatGangCountdown, GangIncomingInvite } from '../../api/rp-gangs/RpGangTypes';
import { Button, Column, Flex, LayoutCurrencyIcon } from '../../common';
import { GangColourPicker, HexToColourInt } from './GangColourPicker';
import { GANG_COLOURS } from './GangColours';
import { GangCrest } from './GangCrest';

type EditingColor = 'primary' | 'secondary';

const GANG_NAME_MAX_LENGTH = 29;

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
// tabs over the gang colour palette (GangColourPicker), and cost + Create as
// one control. The colours default to the palette's first two.
export const GangCreateView: FC<GangCreateViewProps> = props =>
{
    const { gangCost = 0, buyPending = false, onBuy = null, incomingInvites = [], nowSeconds = 0 } = props;
    const [ gangName, setGangName ] = useState('');
    const [ editing, setEditing ] = useState<EditingColor>('primary');
    const [ primaryHex, setPrimaryHex ] = useState<string>(GANG_COLOURS[0]);
    const [ secondaryHex, setSecondaryHex ] = useState<string>(GANG_COLOURS[1]);

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
        SendMessageComposer(new RpBuyGangComposer(gangName.trim(), HexToColourInt(primaryHex), HexToColourInt(secondaryHex)));
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
                    <div className="gang-or-divider"><span /> Create your own gang <span /></div>
                </> }
            <Flex alignItems="center" gap={ 2 }>
                <GangCrest primary={ primaryHex ?? '#999999' } secondary={ secondaryHex ?? '#4c4c4c' } />
                <input className="form-control" type="text" placeholder="Enter gang name..." maxLength={ GANG_NAME_MAX_LENGTH }
                    value={ gangName } onChange={ event => setGangName(event.target.value) } />
            </Flex>
            <GangColourPicker editing={ editing } onEditing={ setEditing } primary={ primaryHex } secondary={ secondaryHex } onPick={ selectColor } />
            <Flex className="gang-create-row">
                <Flex center gap={ 1 } className="gang-create-cost">
                    <LayoutCurrencyIcon type={ -1 } /> { gangCost }
                </Flex>
                <Button fullWidth variant="success" disabled={ !canCreate } onClick={ createGang }>{ buyPending ? 'Founding…' : 'Create Gang' }</Button>
            </Flex>
        </>
    );
}
