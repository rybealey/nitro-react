// The gang colour palette - the Create Gang form and the Settings tab both
// pick from it (Gang Window canvas). 152 colours: the whites, greys and
// blacks first, then each colour family around the wheel, light to dark.
// Picked so no two look alike, and 152 so a normal-width window shows 8 full
// rows of 19. The server stores whatever RGB is sent (groups.colour1/2).
export const GANG_COLOURS: string[] = [
    '#FFFFFF', '#CCCCCC', '#B8B8B8', '#9A9A9A', '#787878', '#595959', '#444444', '#2E2E2E',
    '#1E1E1E', '#0A0A0A', '#FFBFC2', '#EA8686', '#ED5C50', '#E23636', '#E53624', '#FF1300',
    '#AE4747', '#AD1F1F', '#9F2B31', '#813033', '#691616', '#5B2420', '#EAA786', '#B18276',
    '#DA6A43', '#E27036', '#FF5B08', '#AD4E1F', '#C74400', '#84573C', '#8F5E2F', '#693216',
    '#F3E1AF', '#F8C790', '#F7CE6E', '#E79E55', '#C69F71', '#BEA955', '#FF9211', '#E7B027',
    '#FFA508', '#FFCC00', '#96743D', '#AD7E1F', '#A86B19', '#6B573B', '#694E16', '#FFF7B7',
    '#EAEA86', '#FFF41D', '#FFE508', '#D5D500', '#A6A600', '#7A7D22', '#939300', '#666600',
    '#C8EA86', '#DCF76E', '#A9E236', '#8AAA41', '#73A600', '#546800', '#3C4D00', '#2B3A00',
    '#A7EA86', '#70E236', '#4EAD1F', '#368613', '#326916', '#BBF3BD', '#86EA86', '#36E236',
    '#6BAE61', '#456F40', '#00A600', '#004D00', '#86EAA7', '#36E270', '#00A64B', '#166932',
    '#C5EDE6', '#86EAC8', '#36E2A9', '#1FAD7E', '#2F8F6B', '#16694E', '#86EAEA', '#36E2E2',
    '#00A1A6', '#166969', '#004D4D', '#86C8EA', '#75B7C7', '#36A9E2', '#4F7AA2', '#1F7EAD',
    '#0063A6', '#164E69', '#00304D', '#86A7EA', '#3670E2', '#328AE2', '#205FF3', '#1F4EAD',
    '#0A3EB8', '#2F4F8F', '#163269', '#8686EA', '#3636E2', '#2020F3', '#1F1FAD', '#161669',
    '#A786EA', '#896EF7', '#7036E2', '#6B41AA', '#4E1FAD', '#3000A6', '#1B0B4D', '#E7D1EE',
    '#E993FF', '#C7A5E9', '#C886EA', '#CE6EF7', '#AC94B3', '#A936E2', '#7E5B90', '#7E1FAD',
    '#6300A6', '#4E1669', '#3A0B4D', '#FF88F4', '#E236E2', '#A63AB0', '#9E00A6', '#691669',
    '#FFC7E4', '#EA86C8', '#FF27A6', '#E236A9', '#BE558A', '#AD1F7E', '#C80078', '#69164E',
    '#FE86B1', '#EA86A7', '#FF6D8F', '#E23670', '#D2183C', '#AD1F4E', '#9B001D', '#691632'
];
