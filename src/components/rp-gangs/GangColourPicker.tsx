import { FC } from 'react';
import { Column, Flex } from '../../common';
import { GANG_COLOURS } from './GangColours';

// '#rrggbb', 'rrggbb' or 'rgb(r, g, b)' -> raw RGB int for the wire
export const HexToColourInt = (value: string): number =>
{
    const matches = (value ?? '').match(/rgba?\((\d+)[,\s]+(\d+)[,\s]+(\d+)/);

    if(matches) return ((parseInt(matches[1]) << 16) + (parseInt(matches[2]) << 8) + parseInt(matches[3]));

    return (parseInt((value ?? '').replace('#', ''), 16) || 0);
}

interface GangColourPickerProps
{
    editing: 'primary' | 'secondary';
    onEditing: (editing: 'primary' | 'secondary') => void;
    primary: string;
    secondary: string;
    onPick: (colour: string) => void;
}

// The pickers are tabs ATTACHED to the palette: the open tab IS the colour
// being edited. Used by the Create Gang form and the Settings tab, both
// picking from GANG_COLOURS.
export const GangColourPicker: FC<GangColourPickerProps> = ({ editing, onEditing, primary, secondary, onPick }) =>
{
    const active = (((editing === 'primary') ? primary : secondary) ?? '').toLowerCase();

    return (
        <Column gap={ 0 }>
            <Flex gap={ 1 } className="gang-palette-tabs">
                <Flex center pointer gap={ 1 } className={ `gang-palette-tab${ (editing === 'primary') ? ' is-active' : '' }` } onClick={ () => onEditing('primary') }>
                    <span className="gang-tab-swatch" style={ { backgroundColor: primary } } /> PRIMARY
                </Flex>
                <Flex center pointer gap={ 1 } className={ `gang-palette-tab${ (editing === 'secondary') ? ' is-active' : '' }` } onClick={ () => onEditing('secondary') }>
                    <span className="gang-tab-swatch" style={ { backgroundColor: secondary } } /> SECONDARY
                </Flex>
            </Flex>
            <div className="gang-color-grid">
                { GANG_COLOURS.map(colour => (
                    <div key={ colour } title={ colour } className={ `gang-color-swatch cursor-pointer${ (colour.toLowerCase() === active) ? ' is-selected' : '' }` }
                        style={ { backgroundColor: colour } } onClick={ () => onPick(colour) } />
                )) }
            </div>
        </Column>
    );
}
