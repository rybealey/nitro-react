import { RoomControllerLevel } from '@nitrots/nitro-renderer';
import { FC, useEffect, useState } from 'react';
import { GetAvatarRenderManager, GetRoomSession, GetSessionDataManager, LocalizeText, MannequinUtilities } from '../../../../api';
import { Base, Button, Column, Flex, LayoutAvatarImageView, NitroCardContentView, NitroCardHeaderView, NitroCardView, Text } from '../../../../common';
import { useFurnitureMannequinWidget } from '../../../../hooks';
import { HasAnyRoomRights, IsRoomOwnerNow } from '../../../../api/rp-rights/RpRoomRightsMessages';

const MODE_NONE: number = -1;
const MODE_CONTROLLER: number = 0;
const MODE_UPDATE: number = 1;
const MODE_PEER: number = 2;
const MODE_WRONG_GENDER: number = 4;

// pixelrp: every staff rank, Builder (2) and up, may dress any
// mannequin, on duty or off - the server's Room.MannequinStaffRank.
const MANNEQUIN_STAFF_RANK: number = 2;

export const FurnitureMannequinView: FC<{}> = props =>
{
    const [ renderedFigure, setRenderedFigure ] = useState<string>(null);
    const [ mode, setMode ] = useState(MODE_NONE);
    const { objectId = -1, type = null, figure = null, gender = null, name = null, setName = null, saveFigure = null, wearFigure = null, saveName = null, onClose = null } = useFurnitureMannequinWidget();

    useEffect(() =>
    {
        if(objectId === -1) return;

        const roomSession = GetRoomSession();

        if(IsRoomOwnerNow(roomSession) || (roomSession.controllerLevel >= RoomControllerLevel.GUEST) || HasAnyRoomRights() || (GetSessionDataManager().securityLevel >= MANNEQUIN_STAFF_RANK))
        {
            setMode(MODE_CONTROLLER);

            return;
        }
        
        // An empty mannequin has no gender yet - compared as blank rather than
        // throwing, which kept the window from opening for anyone without rights.
        if((GetSessionDataManager().gender || '').toLowerCase() !== (gender || '').toLowerCase())
        {
            setMode(MODE_WRONG_GENDER);

            return;
        }

        // pixelrp: no Habbo Club gate (Twist, 2026-10-15) - HC means nothing
        // here, so anyone may wear any mannequin's outfit.
        setMode(MODE_PEER);
    }, [ objectId, gender ]);

    useEffect(() =>
    {
        switch(mode)
        {
            case MODE_CONTROLLER:
            case MODE_WRONG_GENDER: {
                const figureContainer = GetAvatarRenderManager().createFigureContainer(figure);

                MannequinUtilities.transformAsMannequinFigure(figureContainer, type);

                setRenderedFigure(figureContainer.getFigureString());
                break;
            }
            case MODE_UPDATE: {
                const figureContainer = GetAvatarRenderManager().createFigureContainer(GetSessionDataManager().figure);

                MannequinUtilities.transformAsMannequinFigure(figureContainer, type);

                setRenderedFigure(figureContainer.getFigureString());
                break;
            }
            case MODE_PEER: {
                const figureContainer = MannequinUtilities.getMergedMannequinFigureContainer(GetSessionDataManager().figure, figure);

                setRenderedFigure(figureContainer.getFigureString());
                break;
            }
        }
    }, [ mode, figure, type ]);

    if(objectId === -1) return null;

    return (
        <NitroCardView className="nitro-mannequin no-resize" theme="primary-slim">
            <NitroCardHeaderView headerText={ LocalizeText('mannequin.widget.title') } onCloseClick={ onClose } />
            <NitroCardContentView center>
                <Flex fullWidth gap={ 2 } overflow="hidden">
                    <Column>
                        <Base position="relative" className="mannequin-preview">
                            <LayoutAvatarImageView position="absolute" figure={ renderedFigure } direction={ 2 } />
                        </Base>
                    </Column>
                    <Column grow justifyContent="between" overflow="auto">
                        { (mode === MODE_CONTROLLER) &&
                            <>
                                <input type="text" className="form-control form-control-sm" value={ name } onChange={ event => setName(event.target.value) } onBlur={ saveName } />
                                <Column gap={ 1 }>
                                    <Button variant="success" onClick={ event => setMode(MODE_UPDATE) }>
                                        { LocalizeText('mannequin.widget.style') }
                                    </Button>
                                    <Button variant="success" onClick={ wearFigure }>
                                        { LocalizeText('mannequin.widget.wear') }
                                    </Button>
                                </Column>
                            </> }
                        { (mode === MODE_UPDATE) &&
                            <>
                                <Column gap={ 1 }>
                                    <Text bold>{ name }</Text>
                                    <Text wrap>{ LocalizeText('mannequin.widget.savetext') }</Text>
                                </Column>
                                <Flex alignItems="center" justifyContent="between">
                                    <Text underline pointer onClick={ event => setMode(MODE_CONTROLLER) }>
                                        { LocalizeText('mannequin.widget.back') }
                                    </Text>
                                    <Button variant="success" onClick={ saveFigure }>
                                        { LocalizeText('mannequin.widget.save') }
                                    </Button>
                                </Flex>
                            </> }
                        { (mode === MODE_PEER) &&
                            <>
                                <Column gap={ 1 }>
                                    <Text bold>{ name }</Text>
                                    <Text>{ LocalizeText('mannequin.widget.weartext') }</Text>
                                </Column>
                                <Button variant="success" onClick={ wearFigure }>
                                    { LocalizeText('mannequin.widget.wear') }
                                </Button>
                            </> }
                        { (mode === MODE_WRONG_GENDER) &&
                            <Text>{ LocalizeText('mannequin.widget.wronggender') }</Text> }
                    </Column>
                </Flex>
            </NitroCardContentView>
        </NitroCardView>
    );
}
