import { FC, MouseEvent as ReactMouseEvent, useCallback, useEffect, useRef } from 'react';
import { Flex, Text } from '../../../../../common';

interface FurniSettingScrubberInputProps
{
    label: string;
    value: string;
    onChange: (value: string) => void;
}

const HOLD_INITIAL_DELAY_MS = 400;
const HOLD_REPEAT_MS = 120;
const HOLD_ACCELERATE_AFTER_MS = 1000;

const parseValue = (value: string) =>
{
    const parsed = parseInt(value);

    return isNaN(parsed) ? 0 : parsed;
};

export const FurniSettingScrubberInput: FC<FurniSettingScrubberInputProps> = props =>
{
    const { label = '', value = '', onChange = null } = props;
    const valueRef = useRef<string>(value);
    const holdTimeout = useRef<ReturnType<typeof setTimeout>>(null);
    const holdInterval = useRef<ReturnType<typeof setInterval>>(null);

    valueRef.current = value;

    const step = useCallback((delta: number) =>
    {
        onChange((parseValue(valueRef.current) + delta).toString());
    }, [ onChange ]);

    const stopHold = useCallback(() =>
    {
        if(holdTimeout.current) clearTimeout(holdTimeout.current);
        if(holdInterval.current) clearInterval(holdInterval.current);

        holdTimeout.current = null;
        holdInterval.current = null;
    }, []);

    const startHold = useCallback((direction: number, shiftKey: boolean) =>
    {
        const baseStep = (shiftKey ? 10 : 1) * direction;

        step(baseStep);

        const startedAt = Date.now();

        holdTimeout.current = setTimeout(() =>
        {
            holdInterval.current = setInterval(() =>
            {
                const accelerated = ((Date.now() - startedAt) > HOLD_ACCELERATE_AFTER_MS);

                step(accelerated ? (baseStep * 10) : baseStep);
            }, HOLD_REPEAT_MS);
        }, HOLD_INITIAL_DELAY_MS);
    }, [ step ]);

    const startScrub = useCallback((event: ReactMouseEvent) =>
    {
        event.preventDefault();

        const startX = event.screenX;
        const startValue = parseValue(valueRef.current);

        const onMouseMove = (moveEvent: MouseEvent) =>
        {
            const multiplier = (moveEvent.shiftKey ? 10 : 1);

            onChange((startValue + ((moveEvent.screenX - startX) * multiplier)).toString());
        };

        const onMouseUp = () =>
        {
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
        };

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    }, [ onChange ]);

    useEffect(() => stopHold, [ stopHold ]);

    return (
        <Flex alignItems="center" gap={ 1 }>
            <Text small wrap variant="white" className="col-4" style={ { cursor: 'ew-resize', userSelect: 'none' } } onMouseDown={ startScrub }>{ label }</Text>
            <button type="button" className="btn btn-sm btn-dark px-1 py-0" onMouseDown={ event => startHold(-1, event.shiftKey) } onMouseUp={ stopHold } onMouseLeave={ stopHold }>-</button>
            <input type="text" className="form-control form-control-sm" value={ value } onChange={ event => onChange(event.target.value) } />
            <button type="button" className="btn btn-sm btn-dark px-1 py-0" onMouseDown={ event => startHold(1, event.shiftKey) } onMouseUp={ stopHold } onMouseLeave={ stopHold }>+</button>
        </Flex>
    );
};
