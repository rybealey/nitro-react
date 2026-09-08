import { FurnitureFloorUpdateComposer, FurnitureStackHeightComposer, RoomObjectCategory, RoomObjectOperationType, RoomObjectVariable } from '@nitrots/nitro-renderer';
import { FC, useCallback, useEffect, useState } from 'react';
import ReactSlider from 'react-slider';
import { AvatarInfoFurni, GetRoomEngine, LocalizeText, SendMessageComposer } from '../../../../../api';
import { Button, Column, Flex, Text } from '../../../../../common';
import { useRoom } from '../../../../../hooks';

interface InfoStandWidgetFurniToolsViewProps
{
    avatarInfo: AvatarInfoFurni;
}

// Matches the stack-height widget: the wire value is height * 100, and 40 is
// as high as that widget lets anyone stack.
const MAX_HEIGHT: number = 40;
const HEIGHT_STEPS: number[] = [ 1, 0.1, 0.01 ];

/**
 * Build tools for a selected item - nudge, turn, stack height, opacity.
 *
 * Everything here drives messages the room already uses, so nothing new has to
 * be understood server-side:
 *   position   FurnitureFloorUpdateComposer(id, x, y, direction), which is what
 *              RoomObjectEventHandler itself sends when a drag is dropped
 *   rotation   the OBJECT_ROTATE_* operations behind the Rotate button
 *   height     FurnitureStackHeightComposer(id, height * 100), the wire format
 *              the stack-height widget already speaks
 *
 * Opacity is the exception and is deliberately CLIENT-ONLY: alpha has no column
 * on `furniture` and no message, so it is a see-through-it aid while building,
 * not a property of the item. It is restored when the tools close - without
 * that, a ghosted item would have no way back short of a reload.
 */
export const InfoStandWidgetFurniToolsView: FC<InfoStandWidgetFurniToolsViewProps> = props =>
{
    const { avatarInfo = null } = props;
    const { roomSession = null } = useRoom();
    const [ height, setHeight ] = useState<number>(0);
    const [ opacity, setOpacity ] = useState<number>(100);

    const getRoomObject = useCallback(() =>
    {
        if(!roomSession || !avatarInfo) return null;

        return GetRoomEngine().getRoomObject(roomSession.roomId, avatarInfo.id, avatarInfo.category);
    }, [ roomSession, avatarInfo ]);

    // Start the readout from the item's own height rather than from zero.
    useEffect(() =>
    {
        const roomObject = getRoomObject();

        if(!roomObject) return;

        setHeight(parseFloat((roomObject.getLocation().z || 0).toFixed(2)));
    }, [ getRoomObject ]);

    const applyOpacity = useCallback((value: number) =>
    {
        const roomObject = getRoomObject();

        if(!roomObject) return;

        roomObject.model.setValue(RoomObjectVariable.FURNITURE_ALPHA_MULTIPLIER, (value / 100));
    }, [ getRoomObject ]);

    useEffect(() => () => applyOpacity(100), [ applyOpacity ]);

    // Screen diagonals, not tile axes: the isometric transform puts +x
    // down-right and +y down-left, so each button moves the item the way it
    // points on screen.
    const nudge = (offsetX: number, offsetY: number) =>
    {
        const roomObject = getRoomObject();

        if(!roomObject) return;

        const location = roomObject.getLocation();
        const direction = ((roomObject.getDirection().x % 360) / 45);

        SendMessageComposer(new FurnitureFloorUpdateComposer(avatarInfo.id,
            (location.x + offsetX), (location.y + offsetY), direction));
    }

    const rotate = (positive: boolean) =>
        GetRoomEngine().processRoomObjectOperation(avatarInfo.id, avatarInfo.category,
            positive ? RoomObjectOperationType.OBJECT_ROTATE_POSITIVE : RoomObjectOperationType.OBJECT_ROTATE_NEGATIVE);

    const stepHeight = (delta: number) =>
    {
        const next = Math.min(MAX_HEIGHT, Math.max(0, parseFloat((height + delta).toFixed(2))));

        if(next === height) return;

        setHeight(next);
        SendMessageComposer(new FurnitureStackHeightComposer(avatarInfo.id, ~~(next * 100)));
    }

    // -100 is the stack-height widget's "sit on whatever is already there"; 0
    // is the floor. Neither is a height, so the readout waits for the server.
    const setStackMode = (value: number) =>
        SendMessageComposer(new FurnitureStackHeightComposer(avatarInfo.id, value));

    const isFloorItem = (avatarInfo && (avatarInfo.category === RoomObjectCategory.FLOOR));

    return (
        <Column className="infostand-tools-body" gap={ 1 }>
            { isFloorItem &&
                <>
                    <Text variant="white" small>{ LocalizeText('infostand.tools.position') }</Text>
                    <Flex gap={ 1 }>
                        <Column gap={ 1 }>
                            <Flex gap={ 1 }>
                                <Button variant="dark" onClick={ () => nudge(-1, 0) }>&#9698;</Button>
                                <Button variant="dark" onClick={ () => nudge(0, -1) }>&#9699;</Button>
                            </Flex>
                            <Flex gap={ 1 }>
                                <Button variant="dark" onClick={ () => nudge(0, 1) }>&#9701;</Button>
                                <Button variant="dark" onClick={ () => nudge(1, 0) }>&#9700;</Button>
                            </Flex>
                        </Column>
                        <Column gap={ 1 } grow>
                            <Button variant="dark" onClick={ () => rotate(false) }>&#8634;</Button>
                            <Button variant="dark" onClick={ () => rotate(true) }>&#8635;</Button>
                        </Column>
                    </Flex>

                    <Flex alignItems="center" justifyContent="between">
                        <Text variant="white" small>{ LocalizeText('infostand.tools.height') }</Text>
                        <Text variant="white" small>{ height.toFixed(2) }</Text>
                    </Flex>
                    <Flex gap={ 1 }>
                        { HEIGHT_STEPS.map(step =>
                            <Column key={ step } gap={ 1 } grow>
                                <Button variant="dark" onClick={ () => stepHeight(step) }>+</Button>
                                <Text variant="white" center small>{ step }</Text>
                                <Button variant="dark" onClick={ () => stepHeight(-step) }>&#8722;</Button>
                            </Column>) }
                    </Flex>
                    <Flex gap={ 1 }>
                        <Button variant="dark" grow onClick={ () => setStackMode(0) }>{ LocalizeText('furniture.floor.level') }</Button>
                        <Button variant="dark" grow onClick={ () => setStackMode(-100) }>{ LocalizeText('furniture.above.stack') }</Button>
                    </Flex>
                </> }

            <Flex alignItems="center" justifyContent="between">
                <Text variant="white" small>{ LocalizeText('infostand.tools.opacity') }</Text>
                <Text variant="white" small>{ opacity }%</Text>
            </Flex>
            <ReactSlider
                className="nitro-slider"
                min={ 20 }
                max={ 100 }
                step={ 5 }
                value={ opacity }
                onChange={ value =>
                {
                    setOpacity(value);
                    applyOpacity(value);
                } }
                renderThumb={ thumbProps => <div { ...thumbProps } /> } />
        </Column>
    );
}
