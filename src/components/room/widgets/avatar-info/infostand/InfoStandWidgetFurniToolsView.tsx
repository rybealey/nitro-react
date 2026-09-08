import { FurnitureFloorUpdateComposer, FurnitureStackHeightComposer, RoomObjectCategory, RoomObjectOperationType, RoomObjectVariable } from '@nitrots/nitro-renderer';
import { FC, useCallback, useEffect, useState } from 'react';
import ReactSlider from 'react-slider';
import { AvatarInfoFurni, GetRoomEngine, LocalizeText, SendMessageComposer } from '../../../../../api';
import { ApplyFurniAlpha, RpSetFurniAlphaComposer } from '../../../../../api/rp-furni/RpFurniMessages';
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

// Inline so they inherit currentColor and scale with the button, and so the
// four nudge arrows are one consistent set rather than whatever a glyph font
// happens to draw. 16px on a 26px button, stroked to match the client's icons.
const NudgeIcon: FC<{ rotate: number }> = ({ rotate }) => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"
        style={ { transform: `rotate(${ rotate }deg)` } }>
        <path d="M12 19V5" />
        <path d="M5 12l7-7 7 7" />
    </svg>);

const RotateIcon: FC<{ clockwise?: boolean }> = ({ clockwise = false }) => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
        style={ clockwise ? { transform: 'scaleX(-1)' } : undefined }>
        <path d="M3 12a9 9 0 1 0 3-6.7" />
        <path d="M3 4v5h5" />
    </svg>);

const StepIcon: FC<{ minus?: boolean }> = ({ minus = false }) => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="2.6" strokeLinecap="round">
        <path d="M5 12h14" />
        { !minus && <path d="M12 5v14" /> }
    </svg>);

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
 * Opacity is the one PixelRP-side message: RpSetFurniAlphaComposer stores the
 * value on `items.alpha`, and the server echoes it to the room so every viewer
 * fades the item, then replays it to anyone who walks in later.
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

    // Start the readouts from the item itself rather than from a default: the
    // height off its location, the opacity off the alpha the server already
    // pushed for this room.
    useEffect(() =>
    {
        const roomObject = getRoomObject();

        if(!roomObject) return;

        setHeight(parseFloat((roomObject.getLocation().z || 0).toFixed(2)));

        const alpha = roomObject.model.getValue<number>(RoomObjectVariable.FURNITURE_ALPHA_MULTIPLIER);

        setOpacity((alpha === undefined) || (alpha === null) ? 100 : Math.round(alpha * 100));
    }, [ getRoomObject ]);

    // Painted locally for the drag, then stored - the server's echo lands on
    // the same value, so nothing flickers back.
    const applyOpacity = (value: number) =>
    {
        ApplyFurniAlpha(avatarInfo.id, value);

        SendMessageComposer(new RpSetFurniAlphaComposer(avatarInfo.id, value));
    }

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
                        <Column gap={ 1 } className="infostand-tools-pad">
                            <Flex gap={ 1 }>
                                <Button variant="dark" onClick={ () => nudge(-1, 0) }><NudgeIcon rotate={ -45 } /></Button>
                                <Button variant="dark" onClick={ () => nudge(0, -1) }><NudgeIcon rotate={ 45 } /></Button>
                            </Flex>
                            <Flex gap={ 1 }>
                                <Button variant="dark" onClick={ () => nudge(0, 1) }><NudgeIcon rotate={ 225 } /></Button>
                                <Button variant="dark" onClick={ () => nudge(1, 0) }><NudgeIcon rotate={ 135 } /></Button>
                            </Flex>
                        </Column>
                        <Column gap={ 1 } grow className="infostand-tools-rotate">
                            <Button variant="dark" onClick={ () => rotate(false) }><RotateIcon /></Button>
                            <Button variant="dark" onClick={ () => rotate(true) }><RotateIcon clockwise /></Button>
                        </Column>
                    </Flex>

                    <Flex alignItems="center" justifyContent="between">
                        <Text variant="white" small>{ LocalizeText('infostand.tools.height') }</Text>
                        <Text variant="white" small>{ height.toFixed(2) }</Text>
                    </Flex>
                    <Flex gap={ 1 }>
                        { HEIGHT_STEPS.map(step =>
                            <Column key={ step } gap={ 1 } grow className="infostand-tools-step">
                                <Button variant="dark" onClick={ () => stepHeight(step) }><StepIcon /></Button>
                                <Text variant="white" center small>{ step }</Text>
                                <Button variant="dark" onClick={ () => stepHeight(-step) }><StepIcon minus /></Button>
                            </Column>) }
                    </Flex>
                    <Flex gap={ 1 }>
                        <Button variant="dark" grow onClick={ () => setStackMode(0) }>{ LocalizeText('infostand.tools.floor') }</Button>
                        <Button variant="dark" grow onClick={ () => setStackMode(-100) }>{ LocalizeText('infostand.tools.ontop') }</Button>
                    </Flex>
                </> }

            <Flex alignItems="center" justifyContent="between">
                <Text variant="white" small>{ LocalizeText('infostand.tools.opacity') }</Text>
                <Text variant="white" small>{ opacity }%</Text>
            </Flex>
            <ReactSlider
                className="nitro-slider"
                min={ 10 }
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
